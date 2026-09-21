package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// GoogleProfile is the userinfo response from Google's OAuth endpoints.
type GoogleProfile struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified *bool  `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// GoogleOAuthClient does the raw OAuth2 code exchange against Google's
// endpoints -- no library, since the flow is just two HTTP calls (same
// choice the original NestJS implementation made). Config values are
// passed in explicitly rather than read from the environment per-call, so
// this is testable without mutating process-wide env state.
type GoogleOAuthClient struct {
	ClientID     string
	ClientSecret string
	CallbackURL  string
}

func (g GoogleOAuthClient) IsConfigured() bool {
	return g.ClientID != "" && g.ClientSecret != "" && g.CallbackURL != ""
}

func (g GoogleOAuthClient) BuildAuthURL(state string) string {
	params := url.Values{
		"client_id":     {g.ClientID},
		"redirect_uri":  {g.CallbackURL},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"state":         {state},
		"access_type":   {"online"},
		"prompt":        {"select_account"},
	}
	return "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
}

// ExchangeCode is the network-dependent half -- exercised in integration
// tests via a hand-written stub implementing the same interface the
// service depends on, not by mocking HTTP (no mocking library in this
// codebase, matching apps/api's established convention).
func (g GoogleOAuthClient) ExchangeCode(code string) (GoogleProfile, error) {
	tokenResp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"code":          {code},
		"client_id":     {g.ClientID},
		"client_secret": {g.ClientSecret},
		"redirect_uri":  {g.CallbackURL},
		"grant_type":    {"authorization_code"},
	})
	if err != nil || tokenResp.StatusCode != http.StatusOK {
		return GoogleProfile{}, httpx.Internal("GOOGLE_TOKEN_EXCHANGE_FAILED", "Could not complete Google sign-in.")
	}
	defer tokenResp.Body.Close()

	var tokens struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokens); err != nil {
		return GoogleProfile{}, httpx.Internal("GOOGLE_TOKEN_EXCHANGE_FAILED", "Could not complete Google sign-in.")
	}

	req, _ := http.NewRequest(http.MethodGet, "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokens.AccessToken))
	userResp, err := http.DefaultClient.Do(req)
	if err != nil || userResp.StatusCode != http.StatusOK {
		return GoogleProfile{}, httpx.Internal("GOOGLE_USERINFO_FAILED", "Could not complete Google sign-in.")
	}
	defer userResp.Body.Close()

	var profile GoogleProfile
	if err := json.NewDecoder(userResp.Body).Decode(&profile); err != nil {
		return GoogleProfile{}, httpx.Internal("GOOGLE_USERINFO_FAILED", "Could not complete Google sign-in.")
	}
	return profile, nil
}

// GoogleOAuth is the interface AuthService depends on -- GoogleOAuthClient
// satisfies it; tests substitute a stub.
type GoogleOAuth interface {
	IsConfigured() bool
	BuildAuthURL(state string) string
	ExchangeCode(code string) (GoogleProfile, error)
}

var _ GoogleOAuth = GoogleOAuthClient{}
