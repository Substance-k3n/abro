package storage_test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/storage"
)

// Hits a real S3-compatible server (RustFS -- infra/docker/dev/compose.yml's
// s3 service, bucket provisioned by s3-createbuckets) -- same "hit the real thing, don't
// mock" convention as every Postgres-backed test in this repo.

func newTestStorage(t *testing.T) *storage.ReceiptStorage {
	t.Helper()
	endpoint := getenv("S3_ENDPOINT", "http://localhost:9460")
	region := getenv("S3_REGION", "us-east-1")
	accessKey := getenv("S3_ACCESS_KEY_ID", "abro-minio")
	secretKey := getenv("S3_SECRET_ACCESS_KEY", "password123")
	bucket := getenv("RECEIPTS_BUCKET", "abro-receipts")

	s, err := storage.NewReceiptStorage(endpoint, region, accessKey, secretKey, bucket)
	require.NoError(t, err)
	return s
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func testKey(label string) string {
	return fmt.Sprintf("test/%s-%d-%d.png", label, time.Now().UnixNano(), rand.Intn(1_000_000))
}

func TestReceiptStorage(t *testing.T) {
	t.Run("is configured against the dev S3 env vars", func(t *testing.T) {
		s := newTestStorage(t)
		assert.True(t, s.IsConfigured())
	})

	t.Run("uploads an object and reads it back through a presigned GET URL", func(t *testing.T) {
		s := newTestStorage(t)
		key := testKey("upload")
		body := []byte("fake-png-bytes")

		require.NoError(t, s.Upload(context.Background(), key, bytes.NewReader(body), int64(len(body)), "image/png"))
		t.Cleanup(func() { s.Delete(context.Background(), key) })

		url, err := s.GetPresignedGetURL(context.Background(), key)
		require.NoError(t, err)
		assert.Contains(t, url, key)

		resp, err := http.Get(url)
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.True(t, resp.StatusCode < 300)

		got, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Equal(t, body, got)
		assert.Equal(t, "image/png", resp.Header.Get("Content-Type"))
	})

	t.Run("produces a URL that expires (short TTL), not a permanently public one", func(t *testing.T) {
		s := newTestStorage(t)
		key := testKey("expiry")
		body := []byte("x")
		require.NoError(t, s.Upload(context.Background(), key, bytes.NewReader(body), int64(len(body)), "image/png"))
		t.Cleanup(func() { s.Delete(context.Background(), key) })

		url, err := s.GetPresignedGetURL(context.Background(), key)
		require.NoError(t, err)
		assert.Contains(t, url, "X-Amz-Expires=")
	})

	t.Run("deletes an object so it is no longer fetchable", func(t *testing.T) {
		s := newTestStorage(t)
		key := testKey("delete")
		body := []byte("x")
		require.NoError(t, s.Upload(context.Background(), key, bytes.NewReader(body), int64(len(body)), "image/png"))

		require.NoError(t, s.Delete(context.Background(), key))

		url, err := s.GetPresignedGetURL(context.Background(), key)
		require.NoError(t, err)
		resp, err := http.Get(url)
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.True(t, resp.StatusCode >= 300)
	})
}
