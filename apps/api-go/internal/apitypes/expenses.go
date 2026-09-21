package apitypes

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
)

var positiveAmountPattern = regexp.MustCompile(`^[1-9]\d*$`)

// ExpenseParticipantRaw is one participant entry from the wire, shaped
// differently depending on splitType -- mirrors createExpenseSchema's
// discriminated-union participant shapes.
type ExpenseParticipantRaw struct {
	UserID     string  `json:"userId"`
	Amount     string  `json:"amount"`     // EXACT only
	Percentage float64 `json:"percentage"` // PERCENTAGE only
	Shares     int     `json:"shares"`     // SHARES only
}

// CreateExpenseInput mirrors packages/types' createExpenseSchema. Also
// used for update (editing an expense resubmits the whole thing -- same
// shape as create). SETTLEMENT is deliberately not an accepted SplitType
// here -- per ADR-003, the general expense-create path must never accept
// splitType SETTLEMENT, so it's structurally impossible to submit one
// through this type.
type CreateExpenseInput struct {
	SplitType    string                  `json:"splitType"`
	Name         string                  `json:"name"`
	Category     string                  `json:"category"`
	Amount       string                  `json:"amount"`
	Currency     *string                 `json:"currency"`
	GroupID      *string                 `json:"groupId"`
	PaidByID     *string                 `json:"paidById"`
	ExpenseDate  string                  `json:"expenseDate"`
	ReceiptPath  *string                 `json:"receiptPath"`
	Notes        *string                 `json:"notes"`
	Participants []ExpenseParticipantRaw `json:"participants"`

	ParsedAmount      money.MinorUnits
	ParsedExpenseDate time.Time
}

func (in *CreateExpenseInput) Validate() error {
	switch in.SplitType {
	case "EQUAL", "EXACT", "PERCENTAGE", "SHARES":
	default:
		return httpx.BadRequest("VALIDATION_ERROR", "splitType must be one of EQUAL, EXACT, PERCENTAGE, SHARES")
	}

	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 120 {
		return httpx.BadRequest("VALIDATION_ERROR", "name must be 1-120 characters")
	}
	in.Category = strings.TrimSpace(in.Category)
	if in.Category == "" || len(in.Category) > 60 {
		return httpx.BadRequest("VALIDATION_ERROR", "category must be 1-60 characters")
	}
	if !positiveAmountPattern.MatchString(in.Amount) {
		return httpx.BadRequest("VALIDATION_ERROR", "amount must be a positive integer string of minor units")
	}
	parsedAmount, err := money.ParseAmount(in.Amount)
	if err != nil || parsedAmount == 0 {
		return httpx.BadRequest("VALIDATION_ERROR", "amount must be a positive integer string of minor units")
	}
	in.ParsedAmount = parsedAmount

	if in.Currency != nil && len(*in.Currency) != 3 {
		return httpx.BadRequest("VALIDATION_ERROR", "currency must be a 3-letter code")
	}
	if in.Notes != nil && len(*in.Notes) > 1000 {
		return httpx.BadRequest("VALIDATION_ERROR", "notes must be at most 1000 characters")
	}

	parsedDate, err := parseFlexibleDate(in.ExpenseDate)
	if err != nil {
		return httpx.BadRequest("VALIDATION_ERROR", "expenseDate must be a valid date")
	}
	in.ParsedExpenseDate = parsedDate

	if len(in.Participants) == 0 {
		return httpx.BadRequest("VALIDATION_ERROR", "participants must have at least one entry")
	}
	for _, p := range in.Participants {
		if strings.TrimSpace(p.UserID) == "" {
			return httpx.BadRequest("VALIDATION_ERROR", "each participant needs a userId")
		}
		switch in.SplitType {
		case "EXACT":
			if _, err := money.ParseAmount(p.Amount); err != nil {
				return httpx.BadRequest("VALIDATION_ERROR", "each EXACT participant needs a non-negative integer amount string")
			}
		case "PERCENTAGE":
			if p.Percentage <= 0 || p.Percentage > 100 {
				return httpx.BadRequest("VALIDATION_ERROR", "each PERCENTAGE participant needs a percentage in (0, 100]")
			}
		case "SHARES":
			if p.Shares <= 0 {
				return httpx.BadRequest("VALIDATION_ERROR", "each SHARES participant needs a positive integer shares value")
			}
		}
	}

	return nil
}

func parseFlexibleDate(raw string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("invalid date: %s", raw)
}

type AddExpenseNoteInput struct {
	Content string `json:"content"`
}

func (in *AddExpenseNoteInput) Validate() error {
	in.Content = strings.TrimSpace(in.Content)
	if in.Content == "" || len(in.Content) > 500 {
		return httpx.BadRequest("VALIDATION_ERROR", "content must be 1-500 characters")
	}
	return nil
}

type ListExpensesQuery struct {
	GroupID  string
	FriendID string
	Limit    int32
	Offset   int32
}

// ExpenseParticipant / AuthExpense / AuthExpenseNote are response shapes --
// see the *_expense mappers.
type ExpenseParticipantOut struct {
	ID     string      `json:"id"`
	Amount string      `json:"amount"`
	User   AuthProfile `json:"user"`
}

type AuthExpense struct {
	ID           string                  `json:"id"`
	GroupID      *string                 `json:"groupId"`
	Name         string                  `json:"name"`
	Category     string                  `json:"category"`
	Amount       string                  `json:"amount"`
	Currency     string                  `json:"currency"`
	PaidBy       AuthProfile             `json:"paidBy"`
	SplitType    string                  `json:"splitType"`
	ExpenseDate  time.Time               `json:"expenseDate"`
	ReceiptPath  *string                 `json:"receiptPath"`
	Notes        *string                 `json:"notes"`
	DeletedAt    *time.Time              `json:"deletedAt"`
	CreatedAt    time.Time               `json:"createdAt"`
	UpdatedAt    time.Time               `json:"updatedAt"`
	Participants []ExpenseParticipantOut `json:"participants"`
}

type AuthExpenseNote struct {
	ID        string      `json:"id"`
	ExpenseID string      `json:"expenseId"`
	Content   string      `json:"content"`
	CreatedAt time.Time   `json:"createdAt"`
	Author    AuthProfile `json:"author"`
}
