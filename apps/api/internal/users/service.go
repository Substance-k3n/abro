// Package users implements GET/PATCH /users/me.
package users

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
)

type Service struct {
	q db.Querier
}

func NewService(q db.Querier) *Service {
	return &Service{q: q}
}

func (s *Service) UpdateProfile(ctx context.Context, userID pgtype.UUID, in apitypes.UpdateProfileInput) (db.Profile, error) {
	return s.q.UpdateProfile(ctx, db.UpdateProfileParams{
		ID:                userID,
		DisplayName:       nullableText(in.DisplayName),
		AvatarUrl:         nullableText(in.AvatarURL),
		PreferredCurrency: nullableText(in.PreferredCurrency),
		Locale:            nullableText(in.Locale),
	})
}

func nullableText(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}
