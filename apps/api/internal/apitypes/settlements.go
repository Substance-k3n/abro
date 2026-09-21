package apitypes

import (
	"strings"

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
