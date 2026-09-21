// Package config loads runtime configuration from the environment. Mirrors
// the env vars apps/api's NestJS implementation used (see
// docs/DECISIONS.md ADR-004/ADR-006) so infra/docker/dev's .env and
// deployment configs don't need to change for this rewrite.
package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port        string
	DatabaseURL string

	SessionTTLDays int
	WebOrigin      string
	NodeEnv        string

	GoogleClientID     string
	GoogleClientSecret string
	GoogleCallbackURL  string

	S3Endpoint        string
	S3Region          string
	S3AccessKeyID     string
	S3SecretAccessKey string
	ReceiptsBucket    string
}

func Load() Config {
	return Config{
		Port:        getEnv("PORT", "3000"),
		DatabaseURL: os.Getenv("DATABASE_URL"),

		SessionTTLDays: getEnvInt("SESSION_TTL_DAYS", 30),
		WebOrigin:      getEnv("WEB_ORIGIN", "http://localhost:3200"),
		NodeEnv:        getEnv("NODE_ENV", "development"),

		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleCallbackURL:  os.Getenv("GOOGLE_CALLBACK_URL"),

		S3Endpoint:        os.Getenv("S3_ENDPOINT"),
		S3Region:          os.Getenv("S3_REGION"),
		S3AccessKeyID:     os.Getenv("S3_ACCESS_KEY_ID"),
		S3SecretAccessKey: os.Getenv("S3_SECRET_ACCESS_KEY"),
		ReceiptsBucket:    os.Getenv("RECEIPTS_BUCKET"),
	}
}

func (c Config) IsProduction() bool { return c.NodeEnv == "production" }

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return parsed
}
