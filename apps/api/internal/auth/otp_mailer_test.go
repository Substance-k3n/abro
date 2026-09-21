package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResendOTPMailer_IsConfigured(t *testing.T) {
	t.Run("is false when either field is missing", func(t *testing.T) {
		assert.False(t, NewResendOTPMailer("", "").IsConfigured())
		assert.False(t, NewResendOTPMailer("key", "").IsConfigured())
		assert.False(t, NewResendOTPMailer("", "from@abro.test").IsConfigured())
	})

	t.Run("is true when both are set", func(t *testing.T) {
		assert.True(t, NewResendOTPMailer("key", "from@abro.test").IsConfigured())
	})
}

func TestResendOTPMailer_Send(t *testing.T) {
	t.Run("posts the expected request shape and auth header", func(t *testing.T) {
		var gotAuth string
		var gotBody resendEmailRequest

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotAuth = r.Header.Get("Authorization")
			require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		mailer := NewResendOTPMailer("re_test_key", "otp@abro.test")
		mailer.client = server.Client()
		mailer.URL = server.URL

		err := mailer.Send("user@example.com", "123456")
		require.NoError(t, err)

		assert.Equal(t, "Bearer re_test_key", gotAuth)
		assert.Equal(t, "otp@abro.test", gotBody.From)
		assert.Equal(t, []string{"user@example.com"}, gotBody.To)
		assert.Contains(t, gotBody.Text, "123456")
	})

	t.Run("errors on a non-2xx response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		}))
		defer server.Close()

		mailer := NewResendOTPMailer("bad-key", "otp@abro.test")
		mailer.client = server.Client()
		mailer.URL = server.URL

		err := mailer.Send("user@example.com", "123456")
		assert.Error(t, err)
	})
}
