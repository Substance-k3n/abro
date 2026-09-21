package auth

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Only the pure parts (IsConfigured/BuildAuthURL) are unit-tested here.
// ExchangeCode makes real HTTP calls to Google's OAuth endpoints -- see
// GoogleOAuth's doc comment: AuthService's tests substitute a stub instead.

func TestGoogleOAuthClient_IsConfigured(t *testing.T) {
	t.Run("is false when any of the three fields is missing", func(t *testing.T) {
		assert.False(t, GoogleOAuthClient{}.IsConfigured())
		assert.False(t, GoogleOAuthClient{ClientID: "id", ClientSecret: "secret"}.IsConfigured())
	})

	t.Run("is true when all three fields are set", func(t *testing.T) {
		client := GoogleOAuthClient{ClientID: "id", ClientSecret: "secret", CallbackURL: "https://example.com/callback"}
		assert.True(t, client.IsConfigured())
	})
}

func TestGoogleOAuthClient_BuildAuthURL(t *testing.T) {
	t.Run("embeds client_id, callback, state, and the openid/email/profile scope", func(t *testing.T) {
		client := GoogleOAuthClient{ClientID: "my-client-id", CallbackURL: "https://example.com/callback"}
		raw := client.BuildAuthURL("the-state")

		u, err := url.Parse(raw)
		require.NoError(t, err)

		assert.Equal(t, "https://accounts.google.com/o/oauth2/v2/auth", u.Scheme+"://"+u.Host+u.Path)
		q := u.Query()
		assert.Equal(t, "my-client-id", q.Get("client_id"))
		assert.Equal(t, "https://example.com/callback", q.Get("redirect_uri"))
		assert.Equal(t, "the-state", q.Get("state"))
		assert.Equal(t, "openid email profile", q.Get("scope"))
		assert.Equal(t, "code", q.Get("response_type"))
	})
}
