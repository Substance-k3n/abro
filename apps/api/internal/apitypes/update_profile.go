package apitypes

import (
	"net/url"
	"strings"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// UpdateProfileInput mirrors packages/types' updateProfileSchema.
// Pointer fields are nil when omitted -- the wire equivalent of Zod's
// .optional(), and what lets the DB update leave a field untouched.
type UpdateProfileInput struct {
	DisplayName       *string `json:"displayName"`
	AvatarURL         *string `json:"avatarUrl"`
	Username          *string `json:"username"`
	PreferredCurrency *string `json:"preferredCurrency"`
	Locale            *string `json:"locale"`
}

func (in *UpdateProfileInput) Validate() error {
	if in.DisplayName != nil {
		trimmed := strings.TrimSpace(*in.DisplayName)
		if trimmed == "" || len(trimmed) > 80 {
			return httpx.BadRequest("VALIDATION_ERROR", "displayName must be 1-80 characters")
		}
		in.DisplayName = &trimmed
	}
	if in.AvatarURL != nil {
		parsed, err := url.Parse(*in.AvatarURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return httpx.BadRequest("VALIDATION_ERROR", "avatarUrl must be a valid URL")
		}
	}
	if in.Username != nil {
		normalized := NormalizeUsername(*in.Username)
		if err := ValidateUsernameFormat(normalized); err != nil {
			return err
		}
		in.Username = &normalized
	}
	if in.PreferredCurrency != nil && len(*in.PreferredCurrency) != 3 {
		return httpx.BadRequest("VALIDATION_ERROR", "preferredCurrency must be a 3-letter code")
	}
	if in.Locale != nil && (len(*in.Locale) < 2 || len(*in.Locale) > 10) {
		return httpx.BadRequest("VALIDATION_ERROR", "locale must be 2-10 characters")
	}
	return nil
}
