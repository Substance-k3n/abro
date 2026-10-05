package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

// OTPMailer sends a one-time code to an email address.
type OTPMailer interface {
	Send(email, code string) error
}

// ConsoleOTPMailer is a dev-only stand-in: logs the code instead of
// emailing it. Used when neither ResendOTPMailer nor BrevoOTPMailer is
// configured -- see cmd/api/main.go's selection between them.
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

const brevoAPIURL = "https://api.brevo.com/v3/smtp/email"

// BrevoOTPMailer sends OTP emails via Brevo's transactional HTTP API
// (docs/DECISIONS.md ADR-013). Unlike Resend, Brevo can send to any
// recipient from a single verified sender address (e.g. a Gmail
// address), so real OTP email works before ABRO owns a domain. HTTP, not
// SMTP: Render's free plan blocks outbound SMTP ports.
type BrevoOTPMailer struct {
	APIKey      string
	SenderEmail string
	SenderName  string
	// URL defaults to brevoAPIURL; overridable in tests.
	URL    string
	client *http.Client
}

func NewBrevoOTPMailer(apiKey, senderEmail, senderName string) *BrevoOTPMailer {
	return &BrevoOTPMailer{
		APIKey: apiKey, SenderEmail: senderEmail, SenderName: senderName,
		URL: brevoAPIURL, client: &http.Client{},
	}
}

func (m *BrevoOTPMailer) IsConfigured() bool {
	return m.APIKey != "" && m.SenderEmail != ""
}

type brevoAddress struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

type brevoEmailRequest struct {
	Sender      brevoAddress   `json:"sender"`
	To          []brevoAddress `json:"to"`
	Subject     string         `json:"subject"`
	TextContent string         `json:"textContent"`
}

func (m *BrevoOTPMailer) Send(email, code string) error {
	body, err := json.Marshal(brevoEmailRequest{
		Sender:      brevoAddress{Email: m.SenderEmail, Name: m.SenderName},
		To:          []brevoAddress{{Email: email}},
		Subject:     "Your ABRO verification code",
		TextContent: fmt.Sprintf("Your ABRO verification code is %s. It expires in 10 minutes.", code),
	})
	if err != nil {
		return fmt.Errorf("marshaling brevo request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, m.URL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("building brevo request: %w", err)
	}
	req.Header.Set("api-key", m.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("sending OTP email via brevo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		// Brevo's error body names the cause (e.g. an unverified sender),
		// which is what someone reading the API log needs.
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("brevo returned status %d: %s", resp.StatusCode, detail)
	}
	return nil
}
