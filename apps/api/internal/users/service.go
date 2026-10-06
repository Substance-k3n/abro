// Package users implements GET/PATCH /users/me.
package users

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// Same Postgres error code idempotency/service.go already handles for its
// own unique constraint -- kept local rather than shared, since a shared
// "pg error code" package would be its own small abstraction for two call
// sites.
const uniqueViolation = "23505"

type Service struct {
	q db.Querier
}

func NewService(q db.Querier) *Service {
	return &Service{q: q}
}

func (s *Service) UpdateProfile(ctx context.Context, userID pgtype.UUID, in apitypes.UpdateProfileInput) (db.Profile, error) {
	profile, err := s.q.UpdateProfile(ctx, db.UpdateProfileParams{
		ID:                userID,
		DisplayName:       nullableText(in.DisplayName),
		AvatarUrl:         nullableText(in.AvatarURL),
		Username:          nullableText(in.Username),
		PreferredCurrency: nullableText(in.PreferredCurrency),
		Locale:            nullableText(in.Locale),
	})
	if err == nil {
		return profile, nil
	}

	var pgErr *pgconn.PgError
	if in.Username != nil && errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		return db.Profile{}, httpx.Conflict("USERNAME_TAKEN", "That username is already taken.")
	}
	return db.Profile{}, err
}

// CheckUsernameAvailable backs AUTH-05's live availability check. Assumes
// `username` has already passed ValidateUsernameFormat -- the handler is
// responsible for that, same division of labor as every other endpoint in
// this package (Validate() in apitypes, business logic in Service).
func (s *Service) CheckUsernameAvailable(ctx context.Context, username string) (bool, error) {
	_, err := s.q.GetProfileByUsername(ctx, pgtype.Text{String: username, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return false, nil
}

func nullableText(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}
