// Package app menyusun seluruh dependensi aplikasi.
package app

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/nyxsr/meme-portal/api/internal/config"
	"github.com/nyxsr/meme-portal/api/internal/middleware"
	"github.com/nyxsr/meme-portal/api/internal/modules/subscription"
	"github.com/nyxsr/meme-portal/api/internal/platform/token"
	"github.com/nyxsr/meme-portal/api/internal/server"
	v1 "github.com/nyxsr/meme-portal/api/internal/server/v1"
)

const dbCloseTimeout = 5 * time.Second

// expireInterval adalah periode janitor penanda langganan expired.
const expireInterval = time.Hour

type App struct {
	server *server.Server
	subSvc *subscription.Service
	stop   chan struct{}
	done   chan struct{}
}

func New(ctx context.Context, cfg config.Config) (*App, error) {
	deps, err := bootstrap(ctx, cfg)
	if err != nil {
		return nil, err
	}

	tokens := token.NewManager(cfg.JWT.Secret, cfg.JWT.Issuer, cfg.JWT.AccessTTL, cfg.JWT.RefreshTTL, deps.redis)

	router := http.NewServeMux()
	v1.Mount(router, deps.db, deps.redis, deps.s3, tokens, cfg)

	var handler http.Handler = router
	handler = middleware.NoCache(handler)
	handler = middleware.CORS(cfg.AllowedOrigins)(handler)
	handler = middleware.RequestLogger(slog.Default())(handler)

	app := &App{
		server: server.New(cfg, handler),
		subSvc: subscription.NewService(subscription.NewPostgresRepository(deps.db), subscription.MockGateway{}),
		stop:   make(chan struct{}),
		done:   make(chan struct{}),
	}
	go app.expireJanitor()

	return app, nil
}

// expireJanitor menandai langganan yang sudah lewat masa aktif setiap jam
// agar kolom status tetap akurat; lazy check di query tetap berlaku.
func (a *App) expireJanitor() {
	defer close(a.done)
	ticker := time.NewTicker(expireInterval)
	defer ticker.Stop()

	mark := func() {
		n, err := a.subSvc.MarkExpired(context.Background())
		if err != nil {
			slog.Error("janitor: gagal menandai langganan expired", "err", err)
			return
		}
		if n > 0 {
			slog.Info("janitor: langganan expired ditandai", "count", n)
		}
	}

	mark()
	for {
		select {
		case <-a.stop:
			return
		case <-ticker.C:
			mark()
		}
	}
}

func (a *App) Run() error {
	return a.server.Start()
}

func (a *App) Shutdown(ctx context.Context) error {
	close(a.stop)
	select {
	case <-a.done:
	case <-ctx.Done():
	}
	return a.server.Shutdown(ctx)
}
