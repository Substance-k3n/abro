package apitypes

import (
	"strings"
	"time"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
)

// CreateSettlementInput mirrors packages/types' createSettlementSchema --
// deliberately its own type, not a splitType branch of CreateExpenseInput,
// per ADR-003.
type CreateSettlementInput struct {
	ToUserID string  `json:"toUserId"`
	Amount   string  `json:"amount"`
	GroupID  *string `json:"groupId"`

	ParsedAmount money.MinorUnits
}

func (in *CreateSettlementInput) Validate() error {
	if strings.TrimSpace(in.ToUserID) == "" {
		return httpx.BadRequest("VALIDATION_ERROR", "toUserId is required")
	}
	parsed, err := money.ParseAmount(in.Amount)
	if err != nil || parsed == 0 {
		return httpx.BadRequest("VALIDATION_ERROR", "amount must be a positive integer string of minor units")
	}
	in.ParsedAmount = parsed
	return nil
}

// RecordReceivedInput is POST /settlements/received: the person who was
// paid records it themselves (ADR-019), so it counts at once.
type RecordReceivedInput struct {
	FromUserID string  `json:"fromUserId"`
	Amount     string  `json:"amount"`
	GroupID    *string `json:"groupId"`

	ParsedAmount money.MinorUnits
}

func (in *RecordReceivedInput) Validate() error {
	if strings.TrimSpace(in.FromUserID) == "" {
		return httpx.BadRequest("VALIDATION_ERROR", "fromUserId is required")
	}
	parsed, err := money.ParseAmount(in.Amount)
	if err != nil || parsed == 0 {
		return httpx.BadRequest("VALIDATION_ERROR", "amount must be a positive integer string of minor units")
	}
	in.ParsedAmount = parsed
	return nil
}

// SettlementRequest is a payment the payer recorded that waits for the
// recipient to confirm it (ADR-019). Payer and Recipient never carry an
// email.
type SettlementRequest struct {
	ID           string      `json:"id"`
	Payer        AuthProfile `json:"payer"`
	Recipient    AuthProfile `json:"recipient"`
	GroupID      *string     `json:"groupId"`
	GroupName    *string     `json:"groupName"`
	Amount       string      `json:"amount"`
	Currency     string      `json:"currency"`
	Status       string      `json:"status"`
	HasReceipt   bool        `json:"hasReceipt"`
	SettlementID *string     `json:"settlementId"`
	CreatedAt    time.Time   `json:"createdAt"`
	ResolvedAt   *time.Time  `json:"resolvedAt"`
}
