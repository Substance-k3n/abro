package apitypes

import (
	"net/mail"
	"regexp"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

var otpCodePattern = regexp.MustCompile(`^\d{6}$`)

// RequestOTPInput mirrors packages/types' requestOtpSchema.
type RequestOTPInput struct {
	Email string `json:"email"`
}

func (in *RequestOTPInput) Validate() error {
	in.Email = NormalizeEmail(in.Email)
	if _, err := mail.ParseAddress(in.Email); err != nil {
		return httpx.BadRequest("VALIDATION_ERROR", "email must be a valid email address")
	}
	return nil
}

// VerifyOTPInput mirrors packages/types' verifyOtpSchema.
type VerifyOTPInput struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func (in *VerifyOTPInput) Validate() error {
	in.Email = NormalizeEmail(in.Email)
	if _, err := mail.ParseAddress(in.Email); err != nil {
		return httpx.BadRequest("VALIDATION_ERROR", "email must be a valid email address")
	}
	if !otpCodePattern.MatchString(in.Code) {
		return httpx.BadRequest("VALIDATION_ERROR", "code must be 6 digits")
	}
	return nil
}
