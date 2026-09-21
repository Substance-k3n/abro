package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
)

// GenerateOTPCode returns a 6-digit code, per ABRO_PRD.md §39 ("Enter the
// verification code").
func GenerateOTPCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", fmt.Errorf("generating otp code: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// GenerateSessionToken returns the raw token that goes in the session
// cookie -- never stored as-is, see HashToken.
func GenerateSessionToken() (string, error) {
	return randomHex(32)
}

// GenerateOAuthState returns a CSRF/replay guard for the OAuth redirect
// round-trip.
func GenerateOAuthState() (string, error) {
	return randomHex(16)
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generating random bytes: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

// HashToken is the one-way hash for anything stored in the DB that must
// not be replayable from a DB leak alone.
func HashToken(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
