package apitypes

import (
	"time"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

var validFrequencies = map[string]bool{"DAILY": true, "WEEKLY": true, "MONTHLY": true, "YEARLY": true}

// CreateRecurringExpenseInput mirrors packages/types' createRecurringExpenseSchema
// -- every CreateExpenseInput field plus frequency (ABRO_PRD.md §35: the
// template IS a real Expense).
type CreateRecurringExpenseInput struct {
	CreateExpenseInput
	Frequency string `json:"frequency"`
}

func (in *CreateRecurringExpenseInput) Validate() error {
	if err := in.CreateExpenseInput.Validate(); err != nil {
		return err
	}
	if !validFrequencies[in.Frequency] {
		return httpx.BadRequest("VALIDATION_ERROR", "frequency must be one of DAILY, WEEKLY, MONTHLY, YEARLY")
	}
	return nil
}

type SetRecurringEnabledInput struct {
	Enabled bool `json:"enabled"`
}

type RecurringExpense struct {
	ID              string      `json:"id"`
	Frequency       string      `json:"frequency"`
	NextRunAt       time.Time   `json:"nextRunAt"`
	Enabled         bool        `json:"enabled"`
	CreatedAt       time.Time   `json:"createdAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
	TemplateExpense AuthExpense `json:"templateExpense"`
}

type GenerateDueResult struct {
	Generated int `json:"generated"`
}
