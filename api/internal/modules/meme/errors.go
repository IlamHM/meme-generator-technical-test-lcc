package meme

import "errors"

var (
	ErrNotFound          = errors.New("meme tidak ditemukan")
	ErrNotOwned          = errors.New("bukan pemilik meme")
	ErrInvalidFile       = errors.New("file gambar tidak valid")
	ErrFileTooLarge      = errors.New("ukuran file melebihi batas 10MB")
	ErrNotSubscribedGate = errors.New("butuh langganan aktif untuk membuat meme")
	// ErrSubscriptionExpiredGate dibedakan dari ErrNotSubscribedGate (TKT-101):
	// user punya langganan, tetapi masa aktifnya sudah habis.
	ErrSubscriptionExpiredGate = errors.New("langganan sudah kedaluwarsa")
	ErrQuotaExceeded     = errors.New("kuota meme pada paket aktif sudah habis")
)
