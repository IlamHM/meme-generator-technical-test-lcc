// Package token mengelola JWT access & refresh token.
// Refresh token dilacak di Redis agar bisa direvoke.
package token

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

const (
	TypeAccess  = "access"
	TypeRefresh = "refresh"

	refreshKeyPrefix = "auth:refresh:"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrTokenRevoked = errors.New("token revoked")
)

type Claims struct {
	UserID    string `json:"userID"`
	Role      string `json:"role"`
	TokenType string `json:"tokenType"`
	jwt.RegisteredClaims
}

type Pair struct {
	UserID       string
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
}

type Manager struct {
	secret         []byte
	issuer         string
	accessTimeout  time.Duration
	refreshTimeout time.Duration
	redis          *redis.Client
}

func NewManager(secret, issuer string, accessTTL, refreshTTL time.Duration, rdb *redis.Client) *Manager {
	return &Manager{
		secret:         []byte(secret),
		issuer:         issuer,
		accessTimeout:  accessTTL,
		refreshTimeout: refreshTTL,
		redis:          rdb,
	}
}

// Issue membuat pasangan access + refresh token untuk seorang user.
func (m *Manager) Issue(ctx context.Context, userID, role string) (Pair, error) {
	access, err := m.signed(userID, role, TypeAccess, m.accessTimeout)
	if err != nil {
		return Pair{}, err
	}
	refresh, err := m.signed(userID, role, TypeRefresh, m.refreshTimeout)
	if err != nil {
		return Pair{}, err
	}
	if m.redis != nil {
		key := refreshKeyPrefix + userID
		started := time.Now()
		err := m.redis.Set(ctx, key, refresh, m.refreshTimeout).Err()
		// TEMPORARY login-performance diagnostic; also covers register/refresh token issuance.
		slog.InfoContext(ctx, "temporary login timing", "operation", "token.redis.set", "duration_ms", time.Since(started).Milliseconds())
		if err != nil {
			return Pair{}, fmt.Errorf("token: gagal menyimpan refresh token: %w", err)
		}
	}
	return Pair{
		UserID:       userID,
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(m.accessTimeout.Seconds()),
	}, nil
}

func (m *Manager) signed(userID, role, tokenType string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Role:      role,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			Subject:   userID,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

func (m *Manager) parse(raw, tokenType string) (*Claims, error) {
	var claims Claims
	_, err := jwt.ParseWithClaims(raw, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return m.secret, nil
	})
	if err != nil || claims.TokenType != tokenType {
		return nil, ErrInvalidToken
	}
	return &claims, nil
}

func (m *Manager) VerifyAccess(raw string) (*Claims, error) {
	return m.parse(raw, TypeAccess)
}

func (m *Manager) VerifyRefresh(ctx context.Context, raw string) (*Claims, error) {
	claims, err := m.parse(raw, TypeRefresh)
	if err != nil {
		return nil, err
	}
	if m.redis != nil {
		stored, err := m.redis.Get(ctx, refreshKeyPrefix+claims.UserID).Result()
		if err != nil || stored != raw {
			return nil, ErrTokenRevoked
		}
	}
	return claims, nil
}

// Revoke menghapus refresh token user dari Redis.
func (m *Manager) Revoke(ctx context.Context, userID string) error {
	if m.redis == nil {
		return nil
	}
	return m.redis.Del(ctx, refreshKeyPrefix+userID).Err()
}

// RandomHex menghasilkan string acak (untuk idempotency key pembayaran mock).
func RandomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}
