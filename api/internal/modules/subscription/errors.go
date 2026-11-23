package subscription

import "errors"

var (
	ErrPlanNotFound      = errors.New("paket langganan tidak ditemukan")
	ErrAlreadySubscribed = errors.New("masih ada langganan aktif")
	ErrNotSubscribed        = errors.New("belum berlangganan")
	// ErrSubscriptionExpired dibedakan dari ErrNotSubscribed: user pernah
	// berlangganan tetapi masa aktifnya sudah habis (TKT-101).
	ErrSubscriptionExpired = errors.New("langganan sudah kedaluwarsa")
	ErrPaymentFailed     = errors.New("pembayaran gagal")
	ErrNotFound          = errors.New("langganan tidak ditemukan")
)
