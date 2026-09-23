package apitypes

import (
	"regexp"
	"strings"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// usernamePattern matches the frontend's setup-profile slugify rules
// (apps/web/src/app/auth/setup-profile/page.tsx): lowercase letters,
// digits, dots, and underscores only.
var usernamePattern = regexp.MustCompile(`^[a-z0-9_.]{3,24}$`)

// NormalizeUsername lowercases and trims -- usernames are
// case-insensitive by convention (matching NormalizeEmail's rationale:
// one entry point disagreeing on casing would make the `profiles.username`
// unique index useless for catching near-duplicates).
func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// ValidateUsernameFormat checks shape only, not availability -- shared by
// UpdateProfileInput.Validate and the username-availability-check
// endpoint so the two can never disagree on what counts as a valid
// username.
func ValidateUsernameFormat(username string) error {
	if !usernamePattern.MatchString(username) {
		return httpx.BadRequest("VALIDATION_ERROR",
			"username must be 3-24 characters: lowercase letters, digits, dots, and underscores only")
	}
	return nil
}
