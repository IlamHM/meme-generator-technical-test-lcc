package meme

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/nyxsr/meme-portal/api/internal/config"
	"github.com/nyxsr/meme-portal/api/internal/platform/token"
)

// Gate memeriksa apakah user berhak membuat meme (langganan aktif).
// Diimplementasikan oleh modul subscription lewat structural typing.
type Gate interface {
	CanCreate(ctx context.Context, userID string) error
}

type Service struct {
	repo    *Repository
	s3      *s3.Client
	bucket  string
	baseURL string // public base URL Garage web endpoint
	gate    Gate
}

func NewService(repo *Repository, s3Client *s3.Client, cfg config.StorageConfig, gate Gate) *Service {
	return &Service{repo: repo, s3: s3Client, bucket: cfg.Bucket, baseURL: cfg.PublicBaseURL, gate: gate}
}

// PrepareUpload membuat record meme (pending) dan mengembalikan presigned PUT URL
// untuk mengunggah gambar dasar langsung ke S3/Garage.
func (s *Service) PrepareUpload(ctx context.Context, userID, title, ext, contentType string) (UploadResponse, error) {
	// Gate pre-check dini (UX); enforcement kuota final yang race-safe ada di
	// repo.Create lewat lock baris subscription dalam satu transaksi (TKT-109).
	if err := s.gate.CanCreate(ctx, userID); err != nil {
		return UploadResponse{}, err
	}
	ext = strings.ToLower(ext)
	if !allowedExt(ext) {
		return UploadResponse{}, ErrInvalidFile
	}
	// ContentType dipaksakan server-side dari allowlist ekstensi dan ikut
	// ditandatangani di presign — klien tidak bisa PUT text/html/exe dsb.
	contentType = extContentType(ext)
	objectKey := fmt.Sprintf("base/%s%s", token.RandomHex(12), ext)

	m, err := s.repo.Create(ctx, Meme{
		UserID: userID, Title: title,
		BaseImageURL: s.publicURL(objectKey),
	})
	if err != nil {
		return UploadResponse{}, err
	}

	presign := s3.NewPresignClient(s.s3)
	input := &s3.PutObjectInput{Bucket: &s.bucket, Key: &objectKey, ContentType: &contentType}
	req, err := presign.PresignPutObject(ctx, input, s3.WithPresignExpires(maxPresignTTL))
	if err != nil {
		return UploadResponse{}, fmt.Errorf("meme service: presign gagal: %w", err)
	}
	return UploadResponse{ID: m.ID, UploadURL: req.URL, BaseURL: m.BaseImageURL}, nil
}

// validateBaseImage memeriksa objek base yang diunggah klien sebelum dipakai:
// ukuran <= maxUploadSize dan magic bytes cocok dengan tipe gambar yang
// diizinkan (content sniffing via http.DetectContentType, bukan kepercayaan
// pada header/ekstensi dari klien).
func (s *Service) validateBaseImage(ctx context.Context, m Meme) error {
	key := s.keyFromPublicURL(m.BaseImageURL)
	if key == "" {
		return ErrInvalidFile
	}
	head, err := s.s3.HeadObject(ctx, &s3.HeadObjectInput{Bucket: &s.bucket, Key: &key})
	if err != nil {
		return fmt.Errorf("meme service: head object gagal: %w", err)
	}
	if head.ContentLength != nil && *head.ContentLength > maxUploadSize {
		return ErrFileTooLarge
	}
	obj, err := s.s3.GetObject(ctx, &s3.GetObjectInput{Bucket: &s.bucket, Key: &key, Range: &[]string{"bytes=0-511"}[0]})
	if err != nil {
		return fmt.Errorf("meme service: baca header objek gagal: %w", err)
	}
	defer obj.Body.Close()
	buf := make([]byte, 512)
	n, _ := io.ReadFull(obj.Body, buf)
	sniffed := http.DetectContentType(buf[:n])
	if !allowedMIME(sniffed) {
		return ErrInvalidFile
	}
	return nil
}

func (s *Service) keyFromPublicURL(url string) string {
	base := strings.TrimRight(s.baseURL, "/") + "/"
	if !strings.HasPrefix(url, base) {
		return ""
	}
	return strings.TrimPrefix(url, base)
}

// ResultUpload mengembalikan presigned PUT URL untuk gambar hasil render
// (canvas) milik meme <id>; complete kemudian menyimpan URL publiknya.
func (s *Service) ResultUpload(ctx context.Context, userID, id string) (UploadResponse, error) {
	if err := s.gate.CanCreate(ctx, userID); err != nil {
		return UploadResponse{}, err
	}
	m, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return UploadResponse{}, err
	}
	// Validasi base image yang diunggah klien sebelum dijadikan bahan render:
	// menolak payload non-gambar (exe/zip/html) dan file oversize yang lolos
	// lewat presigned PUT (yang tidak bisa membatasi ukuran di presign v2).
	if err := s.validateBaseImage(ctx, m); err != nil {
		return UploadResponse{}, err
	}
	objectKey := fmt.Sprintf("result/%s.png", id)

	presign := s3.NewPresignClient(s.s3)
	req, err := presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      &s.bucket,
		Key:         &objectKey,
		ContentType: &[]string{"image/png"}[0],
	}, s3.WithPresignExpires(maxPresignTTL))
	if err != nil {
		return UploadResponse{}, fmt.Errorf("meme service: presign gagal: %w", err)
	}
	return UploadResponse{ID: id, UploadURL: req.URL, BaseURL: s.publicURL(objectKey)}, nil
}

func (s *Service) Complete(ctx context.Context, userID, id, resultURL string) (Meme, error) {
	if err := s.gate.CanCreate(ctx, userID); err != nil {
		return Meme{}, err
	}
	return s.repo.SetResultURL(ctx, id, userID, resultURL)
}

func (s *Service) List(ctx context.Context, userID string, limit, offset int32) (ListResponse, error) {
	items, total, err := s.repo.ListByUser(ctx, userID, limit, offset)
	if err != nil {
		return ListResponse{}, err
	}
	if items == nil {
		items = []Meme{}
	}
	return ListResponse{Items: items, Total: total}, nil
}

func (s *Service) Delete(ctx context.Context, userID, id string) error {
	return s.repo.Delete(ctx, id, userID)
}

func (s *Service) publicURL(key string) string {
	if s.baseURL == "" {
		return key
	}
	return strings.TrimRight(s.baseURL, "/") + "/" + path.Clean(key)
}

func allowedExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
		return true
	}
	return false
}

// extContentType memetakan ekstensi yang diizinkan ke MIME-nya; dipaksakan
// server-side agar Content-Type klien tidak dipercaya.
func extContentType(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	}
	return ""
}

func allowedMIME(mime string) bool {
	switch mime {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
		return true
	}
	return false
}
