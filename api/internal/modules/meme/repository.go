package meme

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// errNoRows mengubah "tidak ada baris" (id tidak ada, id milik user lain, atau
// format id tidak valid) menjadi ErrNotFound. Id milik user lain sengaja
// dipetakan ke not found supaya id meme user lain tidak bisa dienumerasi.
func errNoRows(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	// 22P02 = invalid_text_representation: id bukan format uuid yang valid.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "22P02" {
		return ErrNotFound
	}
	return err
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create menyimpan meme baru dengan enforcement kuota atomik (fix TKT-109).
//
// Sebelumnya check kuota (gate CanCreate) dan insert terpisah tanpa
// transaksi/lock, sehingga N request paralel lolos check bersama-sama dan
// usage menembus limit. Sekarang lock baris subscription aktif milik user
// (SELECT ... FOR UPDATE, granularitas per-user — bukan lock global), hitung
// usage, lalu insert dalam SATU transaksi. Request konkuren terserialisasi
// pada lock baris, sehingga tepat sisa kuota yang sukses.
func (r *Repository) Create(ctx context.Context, m Meme) (Meme, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Meme{}, fmt.Errorf("meme repository: begin tx gagal: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Lock baris subscription aktif user sampai commit. Masa aktif dicek
	// terhadap WAKTU SERVER (now()): baris berstatus 'active' yang sudah
	// lewat ends_at tidak lolos (fix TKT-101).
	var maxMemes, durationDays int32
	err = tx.QueryRow(ctx, `
		SELECT p.max_memes, p.duration_days
		FROM subscriptions s
		JOIN plans p ON p.id = s.plan_id
		WHERE s.user_id = $1 AND s.status = 'active'
		  AND s.ends_at > now()
		ORDER BY s.ends_at DESC
		LIMIT 1
		FOR UPDATE OF s`,
		m.UserID,
	).Scan(&maxMemes, &durationDays)
	if errors.Is(err, pgx.ErrNoRows) {
		var hasExpired bool
		if scanErr := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM subscriptions
				WHERE user_id = $1 AND status = 'active' AND ends_at <= now()
			)`, m.UserID).Scan(&hasExpired); scanErr != nil {
			return Meme{}, fmt.Errorf("meme repository: cek expired gagal: %w", scanErr)
		}
		if hasExpired {
			return Meme{}, ErrSubscriptionExpiredGate
		}
		return Meme{}, ErrNotSubscribedGate
	}
	if err != nil {
		return Meme{}, fmt.Errorf("meme repository: lock subscription gagal: %w", err)
	}

	// max_memes = 0 berarti unlimited; selain itu cek usage di window plan.
	if maxMemes > 0 {
		var used int32
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM memes
			 WHERE user_id = $1 AND created_at >= now() - make_interval(days => $2)`,
			m.UserID, durationDays,
		).Scan(&used); err != nil {
			return Meme{}, fmt.Errorf("meme repository: hitung usage gagal: %w", err)
		}
		if used >= maxMemes {
			return Meme{}, ErrQuotaExceeded
		}
	}

	const q = `
		INSERT INTO memes (user_id, title, base_url, top_text, bottom_text, font_size)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, title, base_url, result_url, top_text, bottom_text, font_size, created_at`
	var out Meme
	err = tx.QueryRow(ctx, q,
		m.UserID, m.Title, m.BaseImageURL, m.TopText, m.BottomText, m.FontSize,
	).Scan(&out.ID, &out.UserID, &out.Title, &out.BaseImageURL, &out.ResultURL,
		&out.TopText, &out.BottomText, &out.FontSize, &out.CreatedAt)
	if err != nil {
		return Meme{}, fmt.Errorf("meme repository: create gagal: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Meme{}, fmt.Errorf("meme repository: commit gagal: %w", err)
	}
	return out, nil
}

// GetByID mengambil meme berdasarkan id DAN pemiliknya. userID wajib berasal
// dari context JWT (bukan dari request), sehingga meme milik user lain
// menghasilkan ErrNotFound.
func (r *Repository) GetByID(ctx context.Context, id, userID string) (Meme, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, user_id, title, base_url, result_url, top_text, bottom_text, font_size, created_at
		 FROM memes WHERE id = $1 AND user_id = $2`, id, userID)
	var m Meme
	err := row.Scan(&m.ID, &m.UserID, &m.Title, &m.BaseImageURL, &m.ResultURL, &m.TopText, &m.BottomText, &m.FontSize, &m.CreatedAt)
	if err != nil {
		if errors.Is(errNoRows(err), ErrNotFound) {
			return Meme{}, ErrNotFound
		}
		return Meme{}, fmt.Errorf("meme repository: get by id gagal: %w", err)
	}
	return m, nil
}

func (r *Repository) SetResultURL(ctx context.Context, id, userID, resultURL string) (Meme, error) {
	const q = `
		UPDATE memes SET result_url = $2
		WHERE id = $1 AND user_id = $3
		RETURNING id, user_id, title, base_url, result_url, top_text, bottom_text, font_size, created_at`
	var out Meme
	err := r.pool.QueryRow(ctx, q, id, resultURL, userID).Scan(
		&out.ID, &out.UserID, &out.Title, &out.BaseImageURL, &out.ResultURL,
		&out.TopText, &out.BottomText, &out.FontSize, &out.CreatedAt)
	if err != nil {
		if errors.Is(errNoRows(err), ErrNotFound) {
			return Meme{}, ErrNotFound
		}
		return Meme{}, fmt.Errorf("meme repository: set result gagal: %w", err)
	}
	return out, nil
}

func (r *Repository) ListByUser(ctx context.Context, userID string, limit, offset int32) ([]Meme, int64, error) {
	var total int64
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM memes WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("meme repository: count gagal: %w", err)
	}
	const q = `
		SELECT id, user_id, title, base_url, result_url, top_text, bottom_text, font_size, created_at
		FROM memes WHERE user_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	rows, err := r.pool.Query(ctx, q, userID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("meme repository: list gagal: %w", err)
	}
	defer rows.Close()
	var items []Meme
	for rows.Next() {
		var m Meme
		if err := rows.Scan(&m.ID, &m.UserID, &m.Title, &m.BaseImageURL, &m.ResultURL,
			&m.TopText, &m.BottomText, &m.FontSize, &m.CreatedAt); err != nil {
			return nil, 0, err
		}
		items = append(items, m)
	}
	return items, total, rows.Err()
}

func (r *Repository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM memes WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		// 22P02 = id bukan uuid valid → perlakukan seperti not found.
		if errors.Is(errNoRows(err), ErrNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("meme repository: delete gagal: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
