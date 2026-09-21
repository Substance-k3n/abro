package auth

import "log"

// OTPMailer sends a one-time code to an email address.
type OTPMailer interface {
	Send(email, code string) error
}

// ConsoleOTPMailer is a dev-only stand-in: logs the code instead of
// emailing it. No real provider has been chosen yet (Resend/SES/etc --
// see docs/DECISIONS.md ADR-004's Consequence section) -- swap this
// binding in cmd/api/main.go once one is.
type ConsoleOTPMailer struct{}

func (ConsoleOTPMailer) Send(email, code string) error {
	log.Printf("[DEV ONLY, no real mailer configured] OTP for %s: %s", email, code)
	return nil
}
