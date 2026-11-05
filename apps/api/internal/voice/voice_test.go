package voice

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

func TestEnabledFor(t *testing.T) {
	s := NewService("https://relay.test", "tz_sec_live_x", "https://app.test", " Alice@Abro.test, bob@abro.test ,")
	cases := map[string]bool{"alice@abro.test": true, "BOB@abro.test": true, "carol@abro.test": false, "": false}
	for email, want := range cases {
		if got := s.EnabledFor(email); got != want {
			t.Errorf("EnabledFor(%q) = %v, want %v", email, got, want)
		}
	}
	if !NewService("https://relay.test", "k", "o", "*").EnabledFor("anyone@abro.test") {
		t.Error(`"*" should enable everyone`)
	}
	if NewService("", "k", "o", "*").EnabledFor("a@abro.test") || NewService("https://relay.test", "", "o", "*").EnabledFor("a@abro.test") {
		t.Error("voice must be off when the relay URL or the secret key is missing")
	}
}

func TestSessionURL(t *testing.T) {
	cases := map[string]string{
		"https://tezaz.onrender.com/": "wss://tezaz.onrender.com/v1/session",
		"http://localhost:8787":       "ws://localhost:8787/v1/session",
	}
	for relay, want := range cases {
		if got := NewService(relay, "k", "o", "").SessionURL(); got != want {
			t.Errorf("SessionURL(%q) = %q, want %q", relay, got, want)
		}
	}
}

func TestTokenSendsSecretOriginAndUser(t *testing.T) {
	var gotAuth, gotPath string
	var gotBody map[string]string
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotPath = r.Header.Get("Authorization"), r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		// The relay's own shape: expiresAt in milliseconds.
		_, _ = w.Write([]byte(`{"token":"tok","expiresAt":1793102859417}`))
	}))
	defer relay.Close()

	tok, err := NewService(relay.URL, "tz_sec_live_x", "https://app.test", "*").Token(context.Background(), "user-1")
	if err != nil {
		t.Fatal(err)
	}
	if tok.Token != "tok" || tok.ExpiresAt != 1793102859417 {
		t.Errorf("token = %+v", tok)
	}
	if gotPath != "/v1/tokens" || gotAuth != "Bearer tz_sec_live_x" {
		t.Errorf("relay got path %q, auth %q", gotPath, gotAuth)
	}
	if gotBody["origin"] != "https://app.test" || gotBody["visitorId"] != "user-1" {
		t.Errorf("relay got body %v", gotBody)
	}
}

func TestTokenErrors(t *testing.T) {
	cases := []struct {
		status int
		body   string
		code   string
		http   int
	}{
		{http.StatusTooManyRequests, `{"error":"limit_reached"}`, "VOICE_LIMIT_REACHED", http.StatusTooManyRequests},
		{http.StatusUnauthorized, `{"error":"invalid_key"}`, "VOICE_UNAVAILABLE", http.StatusBadGateway},
		{http.StatusForbidden, `{"error":"origin_not_allowed"}`, "VOICE_UNAVAILABLE", http.StatusBadGateway},
		{http.StatusOK, `{}`, "VOICE_UNAVAILABLE", http.StatusBadGateway},
	}
	for _, c := range cases {
		relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(c.status)
			_, _ = w.Write([]byte(c.body))
		}))
		_, err := NewService(relay.URL, "k", "o", "*").Token(context.Background(), "u")
		relay.Close()
		var apiErr *httpx.APIError
		if !errors.As(err, &apiErr) || apiErr.Code != c.code || apiErr.Status != c.http {
			t.Errorf("relay %d: got %v, want %s (%d)", c.status, err, c.code, c.http)
		}
	}

	// Relay down.
	_, err := NewService("http://127.0.0.1:1", "k", "o", "*").Token(context.Background(), "u")
	var apiErr *httpx.APIError
	if !errors.As(err, &apiErr) || apiErr.Code != "VOICE_UNAVAILABLE" {
		t.Errorf("relay down: got %v", err)
	}
}

func TestWithPublicKeyKeepsOnlyPublicKeys(t *testing.T) {
	cases := map[string]string{
		" tz_pub_live_abc ": "tz_pub_live_abc",
		"":                  "",
		"tz_sec_live_abc":   "", // a secret in the wrong variable never reaches the browser
	}
	for in, want := range cases {
		if got := NewService("https://relay.test", "k", "o", "*").WithPublicKey(in).publicKey; got != want {
			t.Errorf("WithPublicKey(%q) = %q, want %q", in, got, want)
		}
	}
}
