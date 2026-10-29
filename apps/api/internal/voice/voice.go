// Package voice lets signed-in testers talk to ABRO through Tezaz, the
// voice-command service (docs/DECISIONS.md ADR-027). The API only hands
// out short-lived Tezaz session tokens: it calls the Tezaz relay with the
// project's secret key, which never reaches the browser. Everything the
// assistant does in the app goes through the same API calls the screens
// make, so the usual rules and permissions apply.
package voice

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

type Service struct {
	// RelayURL is the Tezaz relay's address, e.g. https://tezaz.onrender.com.
	relayURL  string
	secretKey string
	// origin is the web app's address; the token only works on pages from it.
	origin string
	// testers are lower-cased emails, or "*" for everyone. Empty: nobody.
	testers map[string]bool
	client  *http.Client
	// syncedAt is when the relay last had our manifest (see ensurePublished).
	syncMu   sync.Mutex
	syncedAt time.Time
}

func NewService(relayURL, secretKey, origin, testers string) *Service {
	s := &Service{
		relayURL:  strings.TrimRight(relayURL, "/"),
		secretKey: secretKey,
		origin:    origin,
		testers:   map[string]bool{},
		client:    &http.Client{Timeout: 10 * time.Second},
	}
	for _, t := range strings.Split(testers, ",") {
		if t = strings.ToLower(strings.TrimSpace(t)); t != "" {
			s.testers[t] = true
		}
	}
	return s
}

func (s *Service) IsConfigured() bool { return s.relayURL != "" && s.secretKey != "" }

// EnabledFor: voice is opt-in per tester while it's a pilot, so strangers
// can't spend the speech-provider credit.
func (s *Service) EnabledFor(email string) bool {
	if !s.IsConfigured() {
		return false
	}
	return s.testers["*"] || (email != "" && s.testers[strings.ToLower(email)])
}

// SessionURL is where the browser opens the voice session.
func (s *Service) SessionURL() string {
	return "ws" + strings.TrimPrefix(s.relayURL, "http") + "/v1/session"
}

type Token struct {
	Token string `json:"token"`
	// ExpiresAt is milliseconds since the epoch, as the relay sends it.
	ExpiresAt int64 `json:"expiresAt"`
}

// Token asks the relay for a session token for this user. The user id is
// the visitor id, so Tezaz's per-visitor limits apply per ABRO user.
func (s *Service) Token(ctx context.Context, userID string) (Token, error) {
	s.ensurePublished(ctx)
	body, err := json.Marshal(map[string]string{"origin": s.origin, "visitorId": userID})
	if err != nil {
		return Token{}, fmt.Errorf("marshaling voice token request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.relayURL+"/v1/tokens", bytes.NewReader(body))
	if err != nil {
		return Token{}, fmt.Errorf("building voice token request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.secretKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		// Also a relay still waking up past the client timeout.
		log.Printf("voice: token request: %v", err)
		return Token{}, unavailable()
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusTooManyRequests:
		return Token{}, httpx.TooManyRequests("VOICE_LIMIT_REACHED", "Voice has reached its limit for now. Try again later.")
	case resp.StatusCode != http.StatusOK:
		// The relay's reason (invalid_key, origin_not_allowed, ...) holds no
		// secrets and is the only way to tell a wrong key from a wrong origin.
		reason, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		log.Printf("voice: relay refused a token for origin %s: %d %s", s.origin, resp.StatusCode, strings.TrimSpace(string(reason)))
		return Token{}, unavailable()
	}
	var t Token
	if err := json.NewDecoder(resp.Body).Decode(&t); err != nil || t.Token == "" {
		log.Printf("voice: unreadable token from relay: %v", err)
		return Token{}, unavailable()
	}
	return t, nil
}

func unavailable() error {
	return httpx.NewAPIError(http.StatusBadGateway, "VOICE_UNAVAILABLE", "Voice isn't available right now. Try again in a minute.")
}

type Handler struct {
	svc *Service
	q   db.Querier
}

func NewHandler(svc *Service, q db.Querier) *Handler {
	return &Handler{svc: svc, q: q}
}

func (h *Handler) Mount(r chi.Router) {
	r.Use(authpkg.RequireSession(h.q))
	r.Get("/", httpx.Wrap(h.status))
	r.Post("/token", httpx.Wrap(h.token))
}

// status: GET /voice -> {"enabled": bool, "sessionUrl"?: "wss://..."}, so
// the app shows the voice button only to testers.
func (h *Handler) status(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	if !h.svc.EnabledFor(user.Email.String) {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"enabled": false})
		return nil
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"enabled": true, "sessionUrl": h.svc.SessionURL()})
	return nil
}

// token: POST /voice/token -> {"token", "expiresAt"}; the widget asks for
// a fresh one each time it connects (they live two minutes).
func (h *Handler) token(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	if !h.svc.EnabledFor(user.Email.String) {
		return httpx.Forbidden("VOICE_NOT_ENABLED", "Voice commands aren't turned on for your account.")
	}
	t, err := h.svc.Token(r.Context(), idutil.String(user.ID))
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, t)
	return nil
}
