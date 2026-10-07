// Package storage is a thin S3-compatible client wrapper -- ADR-006/008.
// Targets RustFS in dev and CI (infra/docker/dev/compose.yml; ADR-008
// replaced MinIO, whose images stopped being publicly pullable) via
// minio-go/v7, a generic S3 client despite its name (the
// original NestJS implementation used the AWS SDK instead, specifically so
// swapping to real S3/R2/B2 later would be a config change rather than an
// SDK change -- minio-go is equally S3-protocol-compatible against any of
// those, so that property still holds; this rewrite just uses MinIO's own
// SDK since there's no longer a cross-language reuse reason not to).
// Knows nothing about Expense or authorization -- ExpensesService owns
// those checks and calls here only after they pass.
package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const presignedGetTTL = 5 * time.Minute

type ReceiptStorage struct {
	bucket    string
	endpoint  string
	accessKey string
	secretKey string
	client    *minio.Client
}

func NewReceiptStorage(endpoint, region, accessKeyID, secretAccessKey, bucket string) (*ReceiptStorage, error) {
	if bucket == "" {
		bucket = "abro-receipts"
	}
	s := &ReceiptStorage{bucket: bucket, endpoint: endpoint, accessKey: accessKeyID, secretKey: secretAccessKey}
	if !s.IsConfigured() {
		return s, nil
	}

	host, secure := splitEndpoint(endpoint)
	client, err := minio.New(host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKeyID, secretAccessKey, ""),
		Secure: secure,
		Region: region,
	})
	if err != nil {
		return nil, err
	}
	s.client = client
	return s, nil
}

// IsConfigured mirrors GoogleOAuthService.isConfigured()'s pattern -- lets
// the caller respond 501 instead of crashing when storage env vars are unset.
func (s *ReceiptStorage) IsConfigured() bool {
	return s.endpoint != "" && s.accessKey != "" && s.secretKey != ""
}

func (s *ReceiptStorage) Upload(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

// GetPresignedGetURL returns a short-lived URL -- private storage (PRD
// §36), the client never talks to object storage directly except
// through this.
func (s *ReceiptStorage) GetPresignedGetURL(ctx context.Context, key string) (string, error) {
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, presignedGetTTL, url.Values{})
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// Open streams a stored object back (used to serve profile and group
// photos through the API, ADR-017), with its size and content type.
func (s *ReceiptStorage) Open(ctx context.Context, key string) (io.ReadCloser, int64, string, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, 0, "", err
	}
	info, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, 0, "", err
	}
	return obj, info.Size, info.ContentType, nil
}

// ErrNotImage means DetectImage found no JPG, PNG or WebP signature.
var ErrNotImage = errors.New("not a JPG, PNG or WebP image")

var imageExtensions = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

// DetectImage types an upload by its first bytes (http.DetectContentType),
// never by the client-declared Content-Type, and accepts only JPG, PNG and
// WebP. It returns the detected type, its file extension, and a reader that
// still yields the whole upload (the sniffed bytes put back in front).
func DetectImage(body io.Reader) (contentType, ext string, full io.Reader, err error) {
	head := make([]byte, 512)
	n, err := io.ReadFull(body, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return "", "", nil, err
	}
	head = head[:n]
	contentType = http.DetectContentType(head)
	ext, ok := imageExtensions[contentType]
	if !ok {
		return "", "", nil, ErrNotImage
	}
	return contentType, ext, io.MultiReader(bytes.NewReader(head), body), nil
}

func (s *ReceiptStorage) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

// splitEndpoint strips a scheme from an S3_ENDPOINT value like
// "http://localhost:9460" into minio-go's expected (host:port, secure) pair.
func splitEndpoint(endpoint string) (host string, secure bool) {
	if strings.HasPrefix(endpoint, "https://") {
		return strings.TrimPrefix(endpoint, "https://"), true
	}
	return strings.TrimPrefix(endpoint, "http://"), false
}
