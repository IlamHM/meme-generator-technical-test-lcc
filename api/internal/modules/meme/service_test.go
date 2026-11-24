package meme

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestPresignedUploadEnforcesMaxUploadSize(t *testing.T) {
	client := s3.NewFromConfig(aws.Config{
		Region: "garage",
		Credentials: aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
			return aws.Credentials{AccessKeyID: "test", SecretAccessKey: "test"}, nil
		}),
	}, func(o *s3.Options) {
		o.BaseEndpoint = aws.String("http://localhost:3900")
		o.UsePathStyle = true
	})
	service := Service{s3: client, bucket: "memes"}
	key, contentType := "base/test.png", "image/png"

	for _, test := range []struct {
		name    string
		presign func() (*s3.PresignedPostRequest, error)
	}{
		{"base", func() (*s3.PresignedPostRequest, error) {
			return service.presignBaseUpload(context.Background(), key, contentType)
		}},
		{"result", func() (*s3.PresignedPostRequest, error) {
			return service.presignResultUpload(context.Background(), key)
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := test.presign()
			if err != nil {
				t.Fatal(err)
			}
			assertUploadPolicy(t, got, key, contentType, service.bucket)
		})
	}
}

func assertUploadPolicy(t *testing.T, got *s3.PresignedPostRequest, key, contentType, bucket string) {
	t.Helper()
	encodedPolicy := got.Values["policy"]
	if encodedPolicy == "" {
		t.Fatal("presigned POST has no policy")
	}
	decodedPolicy, err := base64.StdEncoding.DecodeString(encodedPolicy)
	if err != nil {
		t.Fatal(err)
	}
	var policy struct {
		Conditions []any `json:"conditions"`
	}
	if err := json.Unmarshal(decodedPolicy, &policy); err != nil {
		t.Fatal(err)
	}

	wantSizeRange := []any{"content-length-range", float64(0), float64(10 << 20)}
	if !containsCondition(policy.Conditions, wantSizeRange) {
		t.Errorf("policy conditions %v do not contain size range %v", policy.Conditions, wantSizeRange)
	}
	if maxUploadSize != 10<<20 {
		t.Fatalf("maxUploadSize = %d, want 10 MiB", maxUploadSize)
	}
	for _, want := range []any{
		map[string]any{"Content-Type": contentType},
		map[string]any{"key": key},
		map[string]any{"bucket": bucket},
	} {
		if !containsCondition(policy.Conditions, want) {
			t.Errorf("policy conditions %v do not contain %v", policy.Conditions, want)
		}
	}
}

func containsCondition(conditions []any, want any) bool {
	for _, condition := range conditions {
		if reflect.DeepEqual(condition, want) {
			return true
		}
	}
	return false
}
