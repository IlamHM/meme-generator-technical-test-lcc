package meme

import "time"

const maxPresignTTL = 15 * time.Minute

// maxUploadSize membatasi ukuran file meme yang diunggah (10 MB).
const maxUploadSize int64 = 10 << 20

const (
	defaultLimit = 20
	maxLimit     = 100
)
