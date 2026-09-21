// Package apitypes holds the wire-facing request/response shapes shared
// across handlers -- the Go equivalent of packages/types' Zod schemas
// (docs/DECISIONS.md ADR-007's "no longer shared across languages" note).
package apitypes

import (
	"strings"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// AuthProfile is what every auth endpoint that establishes a session
// returns -- mirrors packages/types' authProfileSchema. The one place this
// shape is defined, so a future sensitive Profile field doesn't leak by
// accident (same rationale as the NestJS toAuthProfile mapper it replaces).
type AuthProfile struct {
	ID                string  `json:"id"`
	DisplayName       string  `json:"displayName"`
	AvatarURL         *string `json:"avatarUrl"`
	Email             *string `json:"email"`
	PreferredCurrency string  `json:"preferredCurrency"`
	Locale            string  `json:"locale"`
}

func ToAuthProfile(p db.Profile) AuthProfile {
	return AuthProfile{
		ID:                idutil.String(p.ID),
		DisplayName:       p.DisplayName,
		AvatarURL:         textPtr(p.AvatarUrl),
		Email:             textPtr(p.Email),
		PreferredCurrency: p.PreferredCurrency,
		Locale:            p.Locale,
	}
}

// textPtr converts a pgtype.Text into a *string (nil when NULL) -- JSON
// null instead of an empty string, matching the TS side's `string | null`.
func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

// NormalizeEmail matches packages/types' z.string().trim().toLowerCase().email()
// normalization -- the profiles.email unique index is case-sensitive, and
// ADR-004's account-linking-by-email only works if every entry point
// agrees on one canonical casing.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
