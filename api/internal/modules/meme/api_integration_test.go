package meme

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nyxsr/meme-portal/api/internal/platform/token"
)

// TestAPIHappyPath exercises the existing public API without test-only routes.
// Set API_INTEGRATION=1 together with the storage and database environment.
func TestAPIHappyPath(t *testing.T) {
	if os.Getenv("API_INTEGRATION") != "1" {
		t.Skip("set API_INTEGRATION=1 to test the running API")
	}
	baseAPI := getenvOrDefault("API_BASE_URL", "http://127.0.0.1:8080")
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar, Timeout: 30 * time.Second}
	var setCookieHeaders []string
	client.CheckRedirect = nil
	transport := client.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	client.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		res, err := transport.RoundTrip(req)
		if err == nil {
			setCookieHeaders = append(setCookieHeaders, res.Header.Values("Set-Cookie")...)
		}
		return res, err
	})
	email := fmt.Sprintf("qa-%s@example.invalid", token.RandomHex(12))
	password := token.RandomHex(24)
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	s3Client, bucket := integrationStorage(t)
	var objectKeys []string
	t.Cleanup(func() {
		for _, key := range objectKeys {
			deleteTestObject(s3Client, bucket, key)
		}
		_, _ = pool.Exec(context.Background(), "DELETE FROM users WHERE email = $1", email)
	})

	var registered struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/auth/register", map[string]string{
		"email": email, "password": password, "name": "Isolated QA",
	}, nil, http.StatusCreated, &registered)
	if registered.User.ID == "" {
		t.Fatal("register returned no user ID")
	}
	assertCookieSecurity(t, setCookieHeaders)

	// Plans are returned directly as an array, not as ListResponse.
	var planList []struct {
		Code string `json:"code"`
	}
	assertAPIRequest(t, client, http.MethodGet, baseAPI+"/api/v1/subscription/plans", nil, nil, http.StatusOK, &planList)
	if len(planList) == 0 {
		t.Fatal("no subscription plans available")
	}
	planCode := planList[0].Code
	var checkout struct {
		Payment struct {
			Reference string `json:"reference"`
		} `json:"payment"`
	}
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/subscription/checkout", map[string]string{
		"planCode": planCode,
	}, map[string]string{"Idempotency-Key": "qa-" + token.RandomHex(12)}, http.StatusCreated, &checkout)
	if checkout.Payment.Reference == "" {
		t.Fatal("checkout returned no payment reference")
	}
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/subscription/payments/"+checkout.Payment.Reference+"/confirm", nil, nil, http.StatusOK, nil)

	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/auth/refresh", nil, nil, http.StatusOK, nil)
	assertAPIRequest(t, client, http.MethodGet, baseAPI+"/api/v1/auth/me", nil, nil, http.StatusOK, nil)
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/auth/logout", nil, nil, http.StatusOK, nil)
	assertAPIRequest(t, client, http.MethodGet, baseAPI+"/api/v1/auth/me", nil, nil, http.StatusUnauthorized, nil)
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/auth/login", map[string]string{
		"email": email, "password": password,
	}, nil, http.StatusOK, nil)
	assertCookieSecurity(t, setCookieHeaders)

	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	var prepared UploadResponse
	// Gerbang ukuran: file >10 MiB harus ditolak 413 TANPA membuat record
	// (sebelumnya PrepareUpload membuat record dulu → record yatim).
	var memeCountBefore int64
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM memes WHERE user_id = $1", registered.User.ID).Scan(&memeCountBefore); err != nil {
		t.Fatal(err)
	}
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/memes/upload", map[string]any{
		"title": "Isolated QA oversize", "filename": "big.png", "contentType": "image/png",
		"fileSize": maxUploadSize + 1<<20,
	}, nil, http.StatusRequestEntityTooLarge, nil)
	var memeCountAfter int64
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM memes WHERE user_id = $1", registered.User.ID).Scan(&memeCountAfter); err != nil {
		t.Fatal(err)
	}
	if memeCountAfter != memeCountBefore {
		t.Fatalf("oversize prepare created %d orphan record(s)", memeCountAfter-memeCountBefore)
	}
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/memes/upload", map[string]any{
		"title": "Isolated QA meme", "filename": "valid.png", "contentType": "image/png",
		"fileSize": len(png),
	}, nil, http.StatusCreated, &prepared)
	if prepared.ID == "" || prepared.Fields["policy"] == "" {
		t.Fatal("base upload response has no ID or signed POST fields")
	}
	basePath := prepared.BaseURL[strings.LastIndex(prepared.BaseURL, "/base/")+1:]
	objectKeys = append(objectKeys, basePath)
	assertStoragePost(t, client, &prepared, png)

	var result UploadResponse
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/memes/"+prepared.ID+"/result-upload", nil, nil, http.StatusOK, &result)
	if result.Fields["policy"] == "" {
		t.Fatal("result upload response has no signed POST fields")
	}
	objectKeys = append(objectKeys, "result/"+prepared.ID+".png")
	assertStoragePost(t, client, &result, png)

	var completed Meme
	assertAPIRequest(t, client, http.MethodPost, baseAPI+"/api/v1/memes/"+prepared.ID+"/complete", map[string]string{
		"resultUrl": result.BaseURL,
	}, nil, http.StatusOK, &completed)
	if completed.ResultURL == nil || *completed.ResultURL != result.BaseURL {
		t.Fatal("complete did not persist the result URL")
	}
	var listed ListResponse
	assertAPIRequest(t, client, http.MethodGet, baseAPI+"/api/v1/memes", nil, nil, http.StatusOK, &listed)
	found := false
	for _, item := range listed.Items {
		if item.ID == prepared.ID && item.ResultURL != nil && *item.ResultURL == result.BaseURL {
			found = true
		}
	}
	if !found {
		t.Fatal("completed meme with result URL not found in list")
	}
	t.Log("happy path passed: register, refresh, logout, login, valid base POST, result POST, complete, and list")
}

func assertAPIRequest(t *testing.T, client *http.Client, method, endpoint string, payload any, headers map[string]string, wantStatus int, output any) {
	t.Helper()
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, endpoint, body)
	if err != nil {
		t.Fatal(err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != wantStatus {
		t.Fatalf("%s %s returned HTTP %d, want %d", method, req.URL.Path, res.StatusCode, wantStatus)
	}
	if output != nil {
		var envelope struct {
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(responseBody, &envelope); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(envelope.Data, output); err != nil {
			t.Fatal(err)
		}
	}
}

func assertCookieSecurity(t *testing.T, headers []string) {
	t.Helper()
	accessFound, refreshFound := false, false
	for _, header := range headers {
		cookie, err := http.ParseSetCookie(header)
		if err != nil {
			t.Fatal(err)
		}
		if cookie.Name == "meme_access_token" {
			accessFound = cookie.HttpOnly
		}
		if cookie.Name == "meme_refresh_token" {
			refreshFound = cookie.HttpOnly
		}
	}
	if !accessFound || !refreshFound {
		t.Error("access and refresh Set-Cookie headers must both be HttpOnly")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func assertStoragePost(t *testing.T, client *http.Client, upload *UploadResponse, content []byte) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range upload.Fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.WriteField("Content-Type", "image/png"); err != nil {
		t.Fatal(err)
	}
	file, err := writer.CreateFormFile("file", "valid.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, upload.UploadURL, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		t.Fatalf("valid upload returned HTTP %d", res.StatusCode)
	}
}
