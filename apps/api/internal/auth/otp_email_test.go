package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildOTPEmail(t *testing.T) {
	msg, err := buildOTPEmail("user@example.com", "482913")
	require.NoError(t, err)

	t.Run("puts the code first in the subject", func(t *testing.T) {
		assert.Equal(t, "482913 is your ABRO verification code", msg.Subject)
	})

	t.Run("both bodies carry the code, expiry, warning and recipient", func(t *testing.T) {
		for _, body := range []string{msg.Text, msg.HTML} {
			assert.Contains(t, body, "482913")
			assert.Contains(t, body, "expires in 10 minutes")
			assert.Contains(t, body, "share this code with anyone")
			assert.Contains(t, body, "safely ignore this email")
			assert.Contains(t, body, "user@example.com")
		}
	})

	t.Run("escapes the email address in the HTML body", func(t *testing.T) {
		msg, err := buildOTPEmail(`a<script>@example.com`, "482913")
		require.NoError(t, err)
		assert.NotContains(t, msg.HTML, "<script>")
		assert.Contains(t, msg.HTML, "a&lt;script&gt;@example.com")
	})
}
