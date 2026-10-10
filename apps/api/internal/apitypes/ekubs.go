package apitypes

import (
	"strings"
	"time"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
)

// maxEkubAmount caps any ekub amount (1 trillion ETB in cents) so the
// totals of a full cycle stay far inside int64.
const maxEkubAmount = 100_000_000_000_000

var validEkubCadences = map[string]bool{"WEEKLY": true, "MONTHLY": true}

func parseEkubAmount(raw, field string) (money.MinorUnits, error) {
	parsed, err := money.ParseAmount(raw)
	if err != nil || parsed == 0 || parsed > maxEkubAmount {
		return 0, httpx.BadRequest("VALIDATION_ERROR", field+" must be a positive integer string of minor units")
	}
	return parsed, nil
}

// EkubShareInput is one person's part of a slot. ID is a user id when
// creating an ekub and a member id when rearranging one. JoinedRound,
// before the start only, is the first round they put in -- for entering
// an ekub that was already running, where someone joined mid-way
// (default 1).
type EkubShareInput struct {
	ID          string `json:"id"`
	Amount      string `json:"amount"`
	JoinedRound *int   `json:"joinedRound"`

	ParsedAmount money.MinorUnits `json:"-"`
}

func validateSlots(slots [][]EkubShareInput) error {
	if len(slots) < 1 || len(slots) > 100 {
		return httpx.BadRequest("VALIDATION_ERROR", "slots must have 1-100 entries")
	}
	seen := map[string]bool{}
	for turn, slot := range slots {
		if len(slot) == 0 || len(slot) > 20 {
			return httpx.BadRequest("VALIDATION_ERROR", "each slot must have 1-20 people")
		}
		for i := range slot {
			id := strings.TrimSpace(slot[i].ID)
			if id == "" {
				return httpx.BadRequest("VALIDATION_ERROR", "each share needs an id")
			}
			if seen[id] {
				return httpx.BadRequest("VALIDATION_ERROR", "a person can only be in one slot")
			}
			seen[id] = true
			slot[i].ID = id
			amount, err := parseEkubAmount(slot[i].Amount, "amount")
			if err != nil {
				return err
			}
			slot[i].ParsedAmount = amount
			if j := slot[i].JoinedRound; j != nil && (*j < 1 || *j > turn+1) {
				return httpx.BadRequest("VALIDATION_ERROR", "joinedRound must be from 1 up to the person's own turn")
			}
		}
	}
	return nil
}

// CreateEkubInput is POST /ekubs. Slots are in payout order; the creator
// must be in one of them. Share ids are user ids (friends of the
// creator, who get invited).
type CreateEkubInput struct {
	Name       string             `json:"name"`
	Currency   *string            `json:"currency"`
	SlotAmount string             `json:"slotAmount"`
	Cadence    string             `json:"cadence"`
	Slots      [][]EkubShareInput `json:"slots"`

	ParsedSlotAmount money.MinorUnits `json:"-"`
}

func (in *CreateEkubInput) Validate() error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 80 {
		return httpx.BadRequest("VALIDATION_ERROR", "name must be 1-80 characters")
	}
	if in.Currency != nil && len(*in.Currency) != 3 {
		return httpx.BadRequest("VALIDATION_ERROR", "currency must be a 3-letter code")
	}
	if !validEkubCadences[in.Cadence] {
		return httpx.BadRequest("VALIDATION_ERROR", "cadence must be WEEKLY or MONTHLY")
	}
	amount, err := parseEkubAmount(in.SlotAmount, "slotAmount")
	if err != nil {
		return err
	}
	in.ParsedSlotAmount = amount
	return validateSlots(in.Slots)
}

// UpdateEkubSlotsInput is PATCH /ekubs/{id}/slots: the whole arrangement,
// in payout order, by member id.
type UpdateEkubSlotsInput struct {
	Slots [][]EkubShareInput `json:"slots"`
}

func (in *UpdateEkubSlotsInput) Validate() error {
	return validateSlots(in.Slots)
}

// AddEkubMemberInput is POST /ekubs/{id}/members. Amount is their part
// of a slot (before the start only; someone joining later takes a full
// slot). Position is the round to put them in; it defaults to last.
type AddEkubMemberInput struct {
	UserID   string  `json:"userId"`
	Amount   *string `json:"amount"`
	Position *int    `json:"position"`
	// Before the start only: the first round they put in (see
	// EkubShareInput).
	JoinedRound *int `json:"joinedRound"`

	ParsedAmount money.MinorUnits `json:"-"`
}

func (in *AddEkubMemberInput) Validate() error {
	if strings.TrimSpace(in.UserID) == "" {
		return httpx.BadRequest("VALIDATION_ERROR", "userId is required")
	}
	if in.Amount != nil {
		amount, err := parseEkubAmount(*in.Amount, "amount")
		if err != nil {
			return err
		}
		in.ParsedAmount = amount
	}
	if in.Position != nil && (*in.Position < 1 || *in.Position > 101) {
		return httpx.BadRequest("VALIDATION_ERROR", "position must be 1-101")
	}
	if in.JoinedRound != nil && (*in.JoinedRound < 1 || *in.JoinedRound > 101) {
		return httpx.BadRequest("VALIDATION_ERROR", "joinedRound must be 1-101")
	}
	return nil
}

// StartEkubInput is POST /ekubs/{id}/start: the day round 1 is due. A
// date in the past enters an ekub that was already running; PastPaid
// then records every payment of the rounds already over as made, except
// the Missed ones: payments of those rounds that were never made. If the
// payer's own turn is still to come, the two skip each other for the
// whole cycle; if the payer already took their pot, it stays owed
// (ADR-024).
type StartEkubInput struct {
	StartDate string                 `json:"startDate"`
	PastPaid  bool                   `json:"pastPaid"`
	Missed    []EkubMissedPaymentRef `json:"missed"`

	ParsedStartDate time.Time `json:"-"`
}

// EkubMissedPaymentRef is one payment of a round already over that was
// never made, by member id.
type EkubMissedPaymentRef struct {
	PayerMemberID     string `json:"payerMemberId"`
	RecipientMemberID string `json:"recipientMemberId"`
}

func (in *StartEkubInput) Validate() error {
	parsed, err := time.Parse("2006-01-02", in.StartDate)
	if err != nil {
		return httpx.BadRequest("VALIDATION_ERROR", "startDate must be YYYY-MM-DD")
	}
	in.ParsedStartDate = parsed
	if len(in.Missed) > 2000 {
		return httpx.BadRequest("VALIDATION_ERROR", "missed can have at most 2000 entries")
	}
	for _, m := range in.Missed {
		if strings.TrimSpace(m.PayerMemberID) == "" || strings.TrimSpace(m.RecipientMemberID) == "" {
			return httpx.BadRequest("VALIDATION_ERROR", "each missed payment needs payerMemberId and recipientMemberId")
		}
	}
	return nil
}

// RecordEkubPaymentInput is POST /ekubs/{id}/payments, by either side:
// the payer saying they paid memberId (Direction PAID; waits for them to
// confirm), or the person paid saying memberId paid them (RECEIVED;
// counts at once). Two members usually pay into each other's pots, so
// the direction says which of the two payments this is.
type RecordEkubPaymentInput struct {
	MemberID  string `json:"memberId"`
	Direction string `json:"direction"`
}

func (in *RecordEkubPaymentInput) Validate() error {
	if strings.TrimSpace(in.MemberID) == "" {
		return httpx.BadRequest("VALIDATION_ERROR", "memberId is required")
	}
	if in.Direction != "PAID" && in.Direction != "RECEIVED" {
		return httpx.BadRequest("VALIDATION_ERROR", "direction must be PAID or RECEIVED")
	}
	return nil
}

// Ekub is the list shape: the ekub plus the viewer's own membership.
type Ekub struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Currency    string  `json:"currency"`
	SlotAmount  string  `json:"slotAmount"`
	Cadence     string  `json:"cadence"`
	Status      string  `json:"status"`
	StartDate   *string `json:"startDate"`
	CreatedByID string  `json:"createdById"`
	MyStatus    string  `json:"myStatus"`
	MyRole      string  `json:"myRole"`
	MemberCount int     `json:"memberCount"`
}

type EkubMember struct {
	ID           string  `json:"id"`
	UserID       string  `json:"userId"`
	DisplayName  string  `json:"displayName"`
	Username     *string `json:"username"`
	AvatarURL    *string `json:"avatarUrl"`
	Role         string  `json:"role"`
	Status       string  `json:"status"`
	Amount       string  `json:"amount"`
	SlotPosition int     `json:"slotPosition"`
	JoinedRound  int     `json:"joinedRound"`
}

// EkubRound is one turn: who takes the pot, when, and how much of what
// the others put in has been confirmed.
type EkubRound struct {
	Round     int      `json:"round"`
	DueDate   *string  `json:"dueDate"`
	MemberIDs []string `json:"memberIds"`
	// From the others only; each recipient also keeps their own part.
	Pot       string `json:"pot"`
	Confirmed string `json:"confirmed"`
}

// EkubObligation is one expected payment and where it stands: DUE
// (nothing recorded), PENDING (the payer says paid) or CONFIRMED.
type EkubObligation struct {
	PayerMemberID     string  `json:"payerMemberId"`
	RecipientMemberID string  `json:"recipientMemberId"`
	Amount            string  `json:"amount"`
	Round             int     `json:"round"`
	Status            string  `json:"status"`
	PaymentID         *string `json:"paymentId"`
}

// EkubMissedPayment is a payment of a round before the ekub was entered
// in ABRO that was never made, by someone whose turn was still to come;
// the two skip each other.
type EkubMissedPayment struct {
	PayerMemberID     string `json:"payerMemberId"`
	RecipientMemberID string `json:"recipientMemberId"`
	Round             int    `json:"round"`
}

type EkubDetail struct {
	Ekub
	MyMemberID   string              `json:"myMemberId"`
	CurrentRound int                 `json:"currentRound"`
	Members      []EkubMember        `json:"members"`
	Rounds       []EkubRound         `json:"rounds"`
	Obligations  []EkubObligation    `json:"obligations"`
	Missed       []EkubMissedPayment `json:"missed"`
	// Whether the viewer may leave now, and if not, why not.
	CanLeave        bool    `json:"canLeave"`
	LeaveBlockedWhy *string `json:"leaveBlockedWhy"`
}
