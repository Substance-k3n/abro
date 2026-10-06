package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

const (
	otpTTL            = 10 * time.Minute
	otpResendCooldown = 60 * time.Second
	otpMaxAttempts    = 5
)

type SessionMeta struct {
	UserAgent string
	IPAddress string
}

type SessionResult struct {
	Profile   db.Profile
	Token     string
	ExpiresAt time.Time
}

type Service struct {
	q              db.Querier
	google         GoogleOAuth
	mailer         OTPMailer
	sessionTTLDays int
}

func NewService(q db.Querier, google GoogleOAuth, mailer OTPMailer, sessionTTLDays int) *Service {
	return &Service{q: q, google: google, mailer: mailer, sessionTTLDays: sessionTTLDays}
}

func (s *Service) RequestOTP(ctx context.Context, email string) error {
	_, err := s.q.GetRecentOtpCode(ctx, db.GetRecentOtpCodeParams{
		Email:     email,
		CreatedAt: pgtype.Timestamptz{Time: time.Now().Add(-otpResendCooldown), Valid: true},
	})
	if err == nil {
		return httpx.TooManyRequests("OTP_COOLDOWN", "Wait a moment before requesting another code.")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	code, err := GenerateOTPCode()
	if err != nil {
		return err
	}

	if _, err := s.q.CreateOtpCode(ctx, db.CreateOtpCodeParams{
		Email:     email,
		CodeHash:  HashToken(code),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(otpTTL), Valid: true},
	}); err != nil {
		return err
	}

	return s.mailer.Send(email, code)
}

func (s *Service) VerifyOTP(ctx context.Context, email, code string, meta SessionMeta) (SessionResult, error) {
	otp, err := s.q.GetLatestUnconsumedOtpCode(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && otp.ExpiresAt.Time.Before(time.Now())) {
		return SessionResult{}, httpx.BadRequest("OTP_EXPIRED", "Code expired or not found. Request a new one.")
	}
	if err != nil {
		return SessionResult{}, err
	}

	if otp.Attempts >= otpMaxAttempts {
		return SessionResult{}, httpx.BadRequest("OTP_LOCKED", "Too many incorrect attempts. Request a new code.")
	}

	if otp.CodeHash != HashToken(code) {
		_ = s.q.IncrementOtpAttempts(ctx, otp.ID)
		return SessionResult{}, httpx.BadRequest("OTP_INCORRECT", "Incorrect code.")
	}

	if err := s.q.ConsumeOtpCode(ctx, otp.ID); err != nil {
		return SessionResult{}, err
	}

	displayName := email
	if at := strings.IndexByte(email, '@'); at >= 0 {
		displayName = email[:at]
	}

	profile, err := s.q.UpsertProfileByEmail(ctx, db.UpsertProfileByEmailParams{
		Email:       pgtype.Text{String: email, Valid: true},
		DisplayName: displayName,
	})
	if err != nil {
		return SessionResult{}, err
	}

	return s.createSession(ctx, profile, meta)
}

func (s *Service) SignInWithGoogle(ctx context.Context, code string, meta SessionMeta) (SessionResult, error) {
	googleProfile, err := s.google.ExchangeCode(code)
	if err != nil {
		return SessionResult{}, err
	}

	if googleProfile.EmailVerified != nil && !*googleProfile.EmailVerified {
		return SessionResult{}, httpx.BadRequest("GOOGLE_EMAIL_UNVERIFIED", "Your Google account email is not verified.")
	}

	// Must match packages/types' requestOtpSchema normalization (see
	// apitypes.NormalizeEmail) -- the email unique index is case-sensitive,
	// and ADR-004's account-linking-by-email only works if both sign-in
	// paths agree on one canonical casing.
	email := apitypes.NormalizeEmail(googleProfile.Email)

	existingAccount, err := s.q.GetOAuthAccountByProvider(ctx, db.GetOAuthAccountByProviderParams{
		Provider:          db.OauthProviderGOOGLE,
		ProviderAccountID: googleProfile.Sub,
	})
	if err == nil {
		profile, err := s.q.GetProfileByID(ctx, existingAccount.UserID)
		if err != nil {
			return SessionResult{}, err
		}
		return s.createSession(ctx, profile, meta)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return SessionResult{}, err
	}

	displayName := googleProfile.Name
	if displayName == "" {
		displayName = email
		if at := strings.IndexByte(email, '@'); at >= 0 {
			displayName = email[:at]
		}
	}

	// Links to an existing profile by email (e.g. one created via OTP
	// earlier) instead of creating a duplicate -- see ADR-004.
	profile, err := s.q.UpsertProfileByEmailWithNameAvatar(ctx, db.UpsertProfileByEmailWithNameAvatarParams{
		Email:       pgtype.Text{String: email, Valid: true},
		DisplayName: displayName,
		AvatarUrl:   pgtype.Text{String: googleProfile.Picture, Valid: googleProfile.Picture != ""},
	})
	if err != nil {
		return SessionResult{}, err
	}

	if _, err := s.q.CreateOAuthAccount(ctx, db.CreateOAuthAccountParams{
		UserID:            profile.ID,
		Provider:          db.OauthProviderGOOGLE,
		ProviderAccountID: googleProfile.Sub,
	}); err != nil {
		return SessionResult{}, err
	}

	return s.createSession(ctx, profile, meta)
}

func (s *Service) RevokeSession(ctx context.Context, rawToken string) error {
	return s.q.RevokeSessionsByTokenHash(ctx, HashToken(rawToken))
}

func (s *Service) createSession(ctx context.Context, profile db.Profile, meta SessionMeta) (SessionResult, error) {
	token, err := GenerateSessionToken()
	if err != nil {
		return SessionResult{}, err
	}
	expiresAt := time.Now().Add(time.Duration(s.sessionTTLDays) * 24 * time.Hour)

	if _, err := s.q.CreateSession(ctx, db.CreateSessionParams{
		UserID:    profile.ID,
		TokenHash: HashToken(token),
		UserAgent: pgtype.Text{String: meta.UserAgent, Valid: meta.UserAgent != ""},
		IpAddress: pgtype.Text{String: meta.IPAddress, Valid: meta.IPAddress != ""},
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	}); err != nil {
		return SessionResult{}, err
	}

	return SessionResult{Profile: profile, Token: token, ExpiresAt: expiresAt}, nil
}
