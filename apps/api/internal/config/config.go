// Package config loads runtime configuration from the environment. Mirrors
// the env vars apps/api's NestJS implementation used (see
// docs/DECISIONS.md ADR-004/ADR-006) so infra/docker/dev's .env and
// deployment configs don't need to change for this rewrite.
package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
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

	// docs/DECISIONS.md ADR-004's "pick a real OTP provider" follow-up --
	// Resend. Empty ResendAPIKey means auth.ConsoleOTPMailer stays in use
	// (see cmd/api/main.go), same IsConfigured()-gated pattern as Google
	// OAuth and S3 receipt storage.
	ResendAPIKey    string
	ResendFromEmail string

	S3Endpoint        string
	S3Region          string
	S3AccessKeyID     string
	S3SecretAccessKey string
	ReceiptsBucket    string
}

// Load reads .env into the process environment if present (dev
// convenience -- unlike Node, Go doesn't do this automatically; harmless,
// silently skipped in prod/CI where the file doesn't exist and real env
// vars are already set) and returns the resolved Config.
func Load() Config {
	_ = godotenv.Load()

	return Config{
		Port:        getEnv("PORT", "3201"),
		DatabaseURL: os.Getenv("DATABASE_URL"),

		SessionTTLDays: getEnvInt("SESSION_TTL_DAYS", 30),
		WebOrigin:      getEnv("WEB_ORIGIN", "http://localhost:3200"),
		NodeEnv:        getEnv("NODE_ENV", "development"),

		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleCallbackURL:  os.Getenv("GOOGLE_CALLBACK_URL"),

		ResendAPIKey:    os.Getenv("RESEND_API_KEY"),
		ResendFromEmail: os.Getenv("RESEND_FROM_EMAIL"),

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
