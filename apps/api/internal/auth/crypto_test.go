package auth

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateOTPCode(t *testing.T) {
	t.Run("always produces a zero-padded 6-digit string", func(t *testing.T) {
		re := regexp.MustCompile(`^\d{6}$`)
		for i := 0; i < 200; i++ {
			code, err := GenerateOTPCode()
			require.NoError(t, err)
			assert.Regexp(t, re, code)
		}
	})

	t.Run("is not constant across calls", func(t *testing.T) {
		seen := map[string]bool{}
		for i := 0; i < 50; i++ {
			code, err := GenerateOTPCode()
			require.NoError(t, err)
			seen[code] = true
		}
		assert.Greater(t, len(seen), 1)
	})
}

func TestGenerateSessionToken(t *testing.T) {
	t.Run("produces a 64-char hex string (32 random bytes)", func(t *testing.T) {
		token, err := GenerateSessionToken()
		require.NoError(t, err)
		assert.Regexp(t, `^[0-9a-f]{64}$`, token)
	})

	t.Run("is unique across calls", func(t *testing.T) {
		seen := map[string]bool{}
		for i := 0; i < 50; i++ {
			token, err := GenerateSessionToken()
			require.NoError(t, err)
			seen[token] = true
		}
		assert.Len(t, seen, 50)
	})
}

func TestGenerateOAuthState(t *testing.T) {
	t.Run("produces a 32-char hex string (16 random bytes)", func(t *testing.T) {
		state, err := GenerateOAuthState()
		require.NoError(t, err)
		assert.Regexp(t, `^[0-9a-f]{32}$`, state)
	})

	t.Run("is unique across calls", func(t *testing.T) {
		seen := map[string]bool{}
		for i := 0; i < 50; i++ {
			state, err := GenerateOAuthState()
			require.NoError(t, err)
			seen[state] = true
		}
		assert.Len(t, seen, 50)
	})
}

func TestHashToken(t *testing.T) {
	t.Run("is deterministic for the same input", func(t *testing.T) {
		assert.Equal(t, HashToken("abc"), HashToken("abc"))
	})

	t.Run("produces a 64-char hex string (sha256 digest)", func(t *testing.T) {
		assert.Regexp(t, `^[0-9a-f]{64}$`, HashToken("abc"))
	})

	t.Run("produces different hashes for different inputs", func(t *testing.T) {
		assert.NotEqual(t, HashToken("abc"), HashToken("abd"))
	})
}
