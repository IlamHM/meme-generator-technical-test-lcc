package meme

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/nyxsr/meme-portal/api/internal/platform/token"
)

// Jalankan dengan S3_INTEGRATION=1 dan S3_ENDPOINT, S3_ACCESS_KEY,
// S3_SECRET_KEY, serta S3_BUCKET yang menunjuk storage pengujian.
func TestBaseUploadStorageSizeBoundary(t *testing.T) {
	if os.Getenv("S3_INTEGRATION") != "1" {
		t.Skip("set S3_INTEGRATION=1 to test the configured S3-compatible storage")
	}
	endpoint := os.Getenv("S3_ENDPOINT")
	accessKey := os.Getenv("S3_ACCESS_KEY")
	secretKey := os.Getenv("S3_SECRET_KEY")
	bucket := os.Getenv("S3_BUCKET")
	if endpoint == "" || accessKey == "" || secretKey == "" || bucket == "" {
		t.Fatal("S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET are required")
	}
	if len(endpoint) < len("https://") || endpoint[:len("https://")] != "https://" {
		endpoint = "http://" + endpoint
	}
	client := s3.NewFromConfig(aws.Config{
		Region:       getenvOrDefault("S3_REGION", "garage"),
		BaseEndpoint: aws.String(endpoint),
		Credentials:  credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
	}, func(o *s3.Options) { o.UsePathStyle = true })
	service := Service{s3: client, bucket: bucket}

	for _, size := range []int64{maxUploadSize, maxUploadSize + 1<<20} {
		t.Run(fmt.Sprintf("%d_bytes", size), func(t *testing.T) {
			key := "base/test-" + token.RandomHex(12) + ".png"
			t.Cleanup(func() { deleteTestObject(client, bucket, key) })
			upload, err := service.presignBaseUpload(context.Background(), key, "image/png")
			if err != nil {
				t.Fatal(err)
			}
			status, err := postTestObject(upload, make([]byte, size))
			if err != nil {
				t.Fatal(err)
			}
			assertStorageBoundary(t, client, bucket, key, size, status)
		})
	}

	t.Run("legacy_unsigned_PUT", func(t *testing.T) {
		key := "base/test-" + token.RandomHex(12) + ".png"
		upload, err := service.presignBaseUpload(context.Background(), key, "image/png")
		if err != nil {
			t.Fatal(err)
		}
		req, err := http.NewRequest(http.MethodPut, upload.URL, bytes.NewReader([]byte("size-policy-probe")))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "image/png")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		var s3Error struct {
			Code string `xml:"Code"`
		}
		_ = xml.Unmarshal(body, &s3Error)
		t.Logf("legacy unsigned PUT: HTTP %d, S3 code %q (small body; rejection is method/signature-related, not size policy)", res.StatusCode, s3Error.Code)
		if res.StatusCode < 400 {
			t.Error("legacy unsigned PUT unexpectedly succeeded; clean up the probe object")
			_, _ = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{Bucket: &bucket, Key: &key})
		}
	})

}

func TestResultUploadStorageSizeBoundary(t *testing.T) {
	client, bucket := integrationStorage(t)
	service := Service{s3: client, bucket: bucket}
	for _, size := range []int64{maxUploadSize, maxUploadSize + 1<<20} {
		t.Run(fmt.Sprintf("%d_bytes", size), func(t *testing.T) {
			key := "result/test-" + token.RandomHex(12) + ".png"
			t.Cleanup(func() { deleteTestObject(client, bucket, key) })
			upload, err := service.presignResultUpload(context.Background(), key)
			if err != nil {
				t.Fatal(err)
			}
			status, err := postTestObject(upload, make([]byte, size))
			if err != nil {
				t.Fatal(err)
			}
			assertStorageBoundary(t, client, bucket, key, size, status)
		})
	}
}

func integrationStorage(t *testing.T) (*s3.Client, string) {
	t.Helper()
	if os.Getenv("S3_INTEGRATION") != "1" {
		t.Skip("set S3_INTEGRATION=1 to test the configured S3-compatible storage")
	}
	endpoint := os.Getenv("S3_ENDPOINT")
	accessKey := os.Getenv("S3_ACCESS_KEY")
	secretKey := os.Getenv("S3_SECRET_KEY")
	bucket := os.Getenv("S3_BUCKET")
	if endpoint == "" || accessKey == "" || secretKey == "" || bucket == "" {
		t.Fatal("S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET are required")
	}
	if len(endpoint) < len("https://") || endpoint[:len("https://")] != "https://" {
		endpoint = "http://" + endpoint
	}
	client := s3.NewFromConfig(aws.Config{
		Region:       getenvOrDefault("S3_REGION", "garage"),
		BaseEndpoint: aws.String(endpoint),
		Credentials:  credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
	}, func(o *s3.Options) { o.UsePathStyle = true })
	return client, bucket
}

func deleteTestObject(client *s3.Client, bucket, key string) {
	_, _ = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{Bucket: &bucket, Key: &key})
}

func assertStorageBoundary(t *testing.T, client *s3.Client, bucket, key string, size int64, status int) {
	t.Helper()
	if size == maxUploadSize && (status < 200 || status >= 300) {
		t.Errorf("10 MiB upload returned HTTP %d, want success", status)
	}
	if size > maxUploadSize && status < 400 {
		t.Errorf("11 MiB upload returned HTTP %d, want rejection", status)
	}
	head, err := client.HeadObject(context.Background(), &s3.HeadObjectInput{Bucket: &bucket, Key: &key})
	if size == maxUploadSize {
		if err != nil {
			t.Errorf("accepted 10 MiB object is absent: %v", err)
		} else if head.ContentLength == nil || *head.ContentLength != size {
			t.Errorf("accepted object size = %v, want %d", head.ContentLength, size)
		}
	}
	if size > maxUploadSize {
		if err == nil {
			t.Error("rejected 11 MiB object exists")
		} else {
			var notFound *s3types.NotFound
			if !errors.As(err, &notFound) {
				t.Errorf("HeadObject after rejection failed unexpectedly: %v", err)
			}
		}
	}
}

func postTestObject(upload *s3.PresignedPostRequest, content []byte) (int, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range upload.Values {
		if err := writer.WriteField(key, value); err != nil {
			return 0, err
		}
	}
	if err := writer.WriteField("Content-Type", "image/png"); err != nil {
		return 0, err
	}
	file, err := writer.CreateFormFile("file", "test.png")
	if err != nil {
		return 0, err
	}
	if _, err := file.Write(content); err != nil {
		return 0, err
	}
	if err := writer.Close(); err != nil {
		return 0, err
	}
	req, err := http.NewRequest(http.MethodPost, upload.URL, &body)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	return res.StatusCode, nil
}

func getenvOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
