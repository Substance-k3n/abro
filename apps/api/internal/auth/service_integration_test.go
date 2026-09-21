package auth_test

// Real Postgres + real Service, matching the pattern established by the
// original NestJS backend's *.service.spec.ts files -- no mocked DB.
//
// Two dependencies of Service can't reasonably hit the real world in a
// test: the OTP mailer (would need a real inbox) and GoogleOAuth (would
// need a real Google OAuth code exchange). Both are swapped for
// hand-written test doubles satisfying the same interface, not a mocking
// library -- recordingOTPMailer just remembers the last code passed to
// Send(), and fakeGoogleOAuth returns a canned profile from ExchangeCode.

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
)

type recordingOTPMailer struct {
	lastEmail string
	lastCode  string
}

func (m *recordingOTPMailer) Send(email, code string) error {
	m.lastEmail = email
	m.lastCode = code
	return nil
}

type fakeGoogleOAuth struct {
	nextProfile auth.GoogleProfile
}

func (f *fakeGoogleOAuth) IsConfigured() bool         { return true }
func (f *fakeGoogleOAuth) BuildAuthURL(string) string { return "" }
func (f *fakeGoogleOAuth) ExchangeCode(string) (auth.GoogleProfile, error) {
	return f.nextProfile, nil
}

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro?sslmode=disable"
}

func testEmail(t *testing.T, label string) string {
	t.Helper()
	return fmt.Sprintf("test-auth-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
}

// setup returns a fresh Service wired to real Postgres, plus a cleanup
// func that must be deferred to delete every row the test created (by
// email), same discipline as the NestJS specs' afterEach.
func setup(t *testing.T) (*auth.Service, *recordingOTPMailer, *fakeGoogleOAuth, *pgxpool.Pool, func(emails ...string)) {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres (docker compose -f infra/docker/dev/compose.yml up -d postgres)")
	require.NoError(t, pool.Ping(context.Background()))

	queries := db.New(pool)
	mailer := &recordingOTPMailer{}
	google := &fakeGoogleOAuth{}
	svc := auth.NewService(queries, google, mailer, 30)

	cleanup := func(emails ...string) {
		ctx := context.Background()
		for _, email := range emails {
			pool.Exec(ctx, `DELETE FROM sessions WHERE user_id IN (SELECT id FROM profiles WHERE email = $1)`, email)
			pool.Exec(ctx, `DELETE FROM oauth_accounts WHERE user_id IN (SELECT id FROM profiles WHERE email = $1)`, email)
			pool.Exec(ctx, `DELETE FROM otp_codes WHERE email = $1`, email)
			pool.Exec(ctx, `DELETE FROM profiles WHERE email = $1`, email)
		}
		pool.Close()
	}

	return svc, mailer, google, pool, cleanup
}

func TestService_RequestOTPVerifyOTP(t *testing.T) {
	t.Run("sends a 6-digit code and lets VerifyOTP with that code create a profile + session", func(t *testing.T) {
		svc, mailer, _, pool, cleanup := setup(t)
		email := testEmail(t, "otp-happy")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		assert.Equal(t, email, mailer.lastEmail)
		assert.Regexp(t, `^\d{6}$`, mailer.lastCode)

		result, err := svc.VerifyOTP(context.Background(), email, mailer.lastCode, auth.SessionMeta{})
		require.NoError(t, err)
		assert.Equal(t, email, result.Profile.Email.String)
		assert.Regexp(t, `^[0-9a-f]{64}$`, result.Token)
		assert.True(t, result.ExpiresAt.After(time.Now()))

		var count int
		require.NoError(t, pool.QueryRow(context.Background(),
			`SELECT count(*) FROM sessions WHERE user_id = $1`, result.Profile.ID).Scan(&count))
		assert.Equal(t, 1, count)
	})

	t.Run("rejects a second RequestOTP within the cooldown window", func(t *testing.T) {
		svc, _, _, _, cleanup := setup(t)
		email := testEmail(t, "otp-cooldown")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		err := svc.RequestOTP(context.Background(), email)
		assert.Error(t, err)
	})

	t.Run("rejects an incorrect code and increments attempts", func(t *testing.T) {
		svc, mailer, _, pool, cleanup := setup(t)
		email := testEmail(t, "otp-incorrect")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		wrongCode := "000000"
		if mailer.lastCode == wrongCode {
			wrongCode = "111111"
		}

		_, err := svc.VerifyOTP(context.Background(), email, wrongCode, auth.SessionMeta{})
		assert.Error(t, err)

		var attempts int
		require.NoError(t, pool.QueryRow(context.Background(),
			`SELECT attempts FROM otp_codes WHERE email = $1`, email).Scan(&attempts))
		assert.Equal(t, 1, attempts)
	})

	t.Run("locks out after max incorrect attempts, even with the right code", func(t *testing.T) {
		svc, mailer, _, _, cleanup := setup(t)
		email := testEmail(t, "otp-lockout")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		correctCode := mailer.lastCode
		wrongCode := "000000"
		if correctCode == wrongCode {
			wrongCode = "111111"
		}

		for i := 0; i < 5; i++ {
			_, err := svc.VerifyOTP(context.Background(), email, wrongCode, auth.SessionMeta{})
			assert.Error(t, err)
		}

		_, err := svc.VerifyOTP(context.Background(), email, correctCode, auth.SessionMeta{})
		assert.ErrorContains(t, err, "Too many incorrect attempts")
	})

	t.Run("rejects verifyOTP when no code was ever requested", func(t *testing.T) {
		svc, _, _, _, cleanup := setup(t)
		email := testEmail(t, "otp-none")
		defer cleanup(email)

		_, err := svc.VerifyOTP(context.Background(), email, "123456", auth.SessionMeta{})
		assert.ErrorContains(t, err, "expired")
	})

	t.Run("reuses an existing profile on a second OTP sign-in for the same email", func(t *testing.T) {
		svc, mailer, _, pool, cleanup := setup(t)
		email := testEmail(t, "otp-reuse")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		first, err := svc.VerifyOTP(context.Background(), email, mailer.lastCode, auth.SessionMeta{})
		require.NoError(t, err)

		secondCode := "135790"
		_, err = pool.Exec(context.Background(),
			`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)`,
			email, auth.HashToken(secondCode), time.Now().Add(60*time.Second))
		require.NoError(t, err)

		second, err := svc.VerifyOTP(context.Background(), email, secondCode, auth.SessionMeta{})
		require.NoError(t, err)
		assert.Equal(t, first.Profile.ID, second.Profile.ID)

		var count int
		require.NoError(t, pool.QueryRow(context.Background(),
			`SELECT count(*) FROM profiles WHERE email = $1`, email).Scan(&count))
		assert.Equal(t, 1, count)
	})
}

func TestService_SignInWithGoogle(t *testing.T) {
	t.Run("creates a new profile + oauth_account on first sign-in", func(t *testing.T) {
		svc, _, google, pool, cleanup := setup(t)
		email := testEmail(t, "google-new")
		defer cleanup(email)
		verified := true
		google.nextProfile = auth.GoogleProfile{Sub: "sub-" + email, Email: email, EmailVerified: &verified, Name: "Google User"}

		result, err := svc.SignInWithGoogle(context.Background(), "unused-code", auth.SessionMeta{})
		require.NoError(t, err)
		assert.Equal(t, email, result.Profile.Email.String)
		assert.Equal(t, "Google User", result.Profile.DisplayName)

		var linkedUserID string
		require.NoError(t, pool.QueryRow(context.Background(),
			`SELECT user_id FROM oauth_accounts WHERE provider = 'GOOGLE' AND provider_account_id = $1`,
			"sub-"+email).Scan(&linkedUserID))
	})

	t.Run("reuses the linked profile on a second sign-in via the same Google account", func(t *testing.T) {
		svc, _, google, pool, cleanup := setup(t)
		email := testEmail(t, "google-repeat")
		defer cleanup(email)
		verified := true
		google.nextProfile = auth.GoogleProfile{Sub: "sub-" + email, Email: email, EmailVerified: &verified}

		first, err := svc.SignInWithGoogle(context.Background(), "unused-code", auth.SessionMeta{})
		require.NoError(t, err)
		second, err := svc.SignInWithGoogle(context.Background(), "unused-code", auth.SessionMeta{})
		require.NoError(t, err)
		assert.Equal(t, first.Profile.ID, second.Profile.ID)

		var count int
		require.NoError(t, pool.QueryRow(context.Background(),
			`SELECT count(*) FROM oauth_accounts WHERE provider_account_id = $1`, "sub-"+email).Scan(&count))
		assert.Equal(t, 1, count)
	})

	t.Run("links to an existing OTP-created profile by email instead of duplicating it", func(t *testing.T) {
		svc, mailer, google, pool, cleanup := setup(t)
		email := testEmail(t, "google-link")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		otpResult, err := svc.VerifyOTP(context.Background(), email, mailer.lastCode, auth.SessionMeta{})
		require.NoError(t, err)

		verified := true
		google.nextProfile = auth.GoogleProfile{Sub: "sub-" + email, Email: email, EmailVerified: &verified}
		googleResult, err := svc.SignInWithGoogle(context.Background(), "unused-code", auth.SessionMeta{})
		require.NoError(t, err)

		assert.Equal(t, otpResult.Profile.ID, googleResult.Profile.ID)
		var count int
		require.NoError(t, pool.QueryRow(context.Background(),
			`SELECT count(*) FROM profiles WHERE email = $1`, email).Scan(&count))
		assert.Equal(t, 1, count)
	})

	t.Run("normalizes Google email casing to match the OTP schema", func(t *testing.T) {
		svc, mailer, google, _, cleanup := setup(t)
		email := testEmail(t, "google-case")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		otpResult, err := svc.VerifyOTP(context.Background(), email, mailer.lastCode, auth.SessionMeta{})
		require.NoError(t, err)

		verified := true
		upper := email
		for i, c := range upper {
			if c >= 'a' && c <= 'z' {
				upper = upper[:i] + string(c-32) + upper[i+1:]
			}
		}
		google.nextProfile = auth.GoogleProfile{Sub: "sub-" + email, Email: upper, EmailVerified: &verified}
		googleResult, err := svc.SignInWithGoogle(context.Background(), "unused-code", auth.SessionMeta{})
		require.NoError(t, err)
		assert.Equal(t, otpResult.Profile.ID, googleResult.Profile.ID)
	})

	t.Run("rejects an unverified Google email", func(t *testing.T) {
		svc, _, google, _, cleanup := setup(t)
		email := testEmail(t, "google-unverified")
		defer cleanup(email)
		verified := false
		google.nextProfile = auth.GoogleProfile{Sub: "sub-" + email, Email: email, EmailVerified: &verified}

		_, err := svc.SignInWithGoogle(context.Background(), "unused-code", auth.SessionMeta{})
		assert.Error(t, err)
	})
}

func TestService_RevokeSession(t *testing.T) {
	t.Run("marks the session revoked so it can no longer be used", func(t *testing.T) {
		svc, mailer, _, pool, cleanup := setup(t)
		email := testEmail(t, "revoke")
		defer cleanup(email)

		require.NoError(t, svc.RequestOTP(context.Background(), email))
		result, err := svc.VerifyOTP(context.Background(), email, mailer.lastCode, auth.SessionMeta{})
		require.NoError(t, err)

		require.NoError(t, svc.RevokeSession(context.Background(), result.Token))

		var revoked bool
		require.NoError(t, pool.QueryRow(context.Background(),
			`SELECT revoked_at IS NOT NULL FROM sessions WHERE user_id = $1`, result.Profile.ID).Scan(&revoked))
		assert.True(t, revoked)
	})

	t.Run("is a no-op for an unknown token", func(t *testing.T) {
		svc, _, _, _, cleanup := setup(t)
		defer cleanup()
		assert.NoError(t, svc.RevokeSession(context.Background(), "not-a-real-token"))
	})
}
