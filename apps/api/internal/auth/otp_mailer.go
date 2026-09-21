package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// OTPMailer sends a one-time code to an email address.
type OTPMailer interface {
	Send(email, code string) error
}

// ConsoleOTPMailer is a dev-only stand-in: logs the code instead of
// emailing it. Used when ResendOTPMailer isn't configured (no
// RESEND_API_KEY) -- see cmd/api/main.go's selection between the two.
type ConsoleOTPMailer struct{}

func (ConsoleOTPMailer) Send(email, code string) error {
	log.Printf("[DEV ONLY, no real mailer configured] OTP for %s: %s", email, code)
	return nil
}

const resendAPIURL = "https://api.resend.com/emails"

// ResendOTPMailer sends real OTP emails via Resend's HTTP API --
// docs/DECISIONS.md ADR-004's previously-undecided "pick a real provider"
// follow-up. One HTTP call, no SDK: Resend's API is a single JSON POST.
type ResendOTPMailer struct {
	APIKey    string
	FromEmail string
	// URL defaults to resendAPIURL; overridable in tests to point at an
	// httptest server instead of the real Resend API.
	URL    string
	client *http.Client
}

func NewResendOTPMailer(apiKey, fromEmail string) *ResendOTPMailer {
	return &ResendOTPMailer{APIKey: apiKey, FromEmail: fromEmail, URL: resendAPIURL, client: &http.Client{}}
}

func (m *ResendOTPMailer) IsConfigured() bool {
	return m.APIKey != "" && m.FromEmail != ""
}

type resendEmailRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
}

func (m *ResendOTPMailer) Send(email, code string) error {
	body, err := json.Marshal(resendEmailRequest{
		From:    m.FromEmail,
		To:      []string{email},
		Subject: "Your ABRO verification code",
		Text:    fmt.Sprintf("Your ABRO verification code is %s. It expires in 10 minutes.", code),
	})
	if err != nil {
		return fmt.Errorf("marshaling resend request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, m.URL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("building resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+m.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("sending OTP email via resend: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend returned status %d", resp.StatusCode)
	}
	return nil
}
