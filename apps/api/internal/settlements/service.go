// Package settlements implements the only path allowed to write
// SplitType SETTLEMENT -- ADR-003: settlements are Expense rows with
// split_type = SETTLEMENT, never a separate table, and must never go
// through the general create-expense path.
//
// ADR-019: a payment the payer records is first a settlement *request*
// (settlement_requests), which never affects a balance; the SETTLEMENT
// expense is written when the recipient confirms it. A payment the
// recipient records is written straight away.
//
// Shape (ADR-003's implementation note): every expense_participants.amount
// stays non-negative, matching every other split type.
// {paid_by_id: settler, amount: settlementAmount} with participants
// [{settler, 0}, {recipient, settlementAmount}] still satisfies
// "sum(participant shares) = expense total" (ABRO_PRD.md §45) unchanged,
// and balances.Service.GetPairwiseBalance nets it correctly with zero
// splitType-specific branching in the read path.
package settlements

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/balances"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

type Service struct {
	q             db.Querier
	balances      *balances.Service
	groups        *groups.Service
	notifications *notifications.Service
	expenses      *expenses.Service
}

func NewService(q db.Querier, balancesSvc *balances.Service, groupsSvc *groups.Service, notificationsSvc *notifications.Service, expensesSvc *expenses.Service) *Service {
	return &Service{q: q, balances: balancesSvc, groups: groupsSvc, notifications: notificationsSvc, expenses: expensesSvc}
}

// Create is the payer recording a payment they made. It doesn't settle
// anything yet: it's a PENDING request until the recipient confirms it
// (ADR-019), so it can't push any balance around on the payer's word
// alone. The claim is checked against the live debt, less what this
// payer already has waiting on the same recipient.
func (s *Service) Create(ctx context.Context, actorID pgtype.UUID, in apitypes.CreateSettlementInput) (db.SettlementRequest, error) {
	toUserID, err := s.requireOtherProfile(ctx, actorID, in.ToUserID)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	currency, groupID, err := s.resolveCurrency(ctx, actorID, toUserID, in.GroupID)
	if err != nil {
		return db.SettlementRequest{}, err
	}

	// ABRO_PRD.md §19/§45: "settlement <= outstanding debt", validated
	// against the live balance, never a client-supplied figure.
	outstanding, err := s.outstanding(ctx, actorID, toUserID, groupID)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	pending, err := s.q.SumPendingSettlementRequests(ctx, db.SumPendingSettlementRequestsParams{
		PayerID: actorID, RecipientID: toUserID, GroupID: groupID,
	})
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if in.ParsedAmount > outstanding-pending {
		msg := fmt.Sprintf("You owe %s, so you can't record more than that.", money.Format(outstanding, currency))
		if pending > 0 {
			msg = fmt.Sprintf("You owe %s and %s of it is already waiting to be confirmed, so you can record at most %s.",
				money.Format(outstanding, currency), money.Format(pending, currency), money.Format(max(outstanding-pending, 0), currency))
		}
		return db.SettlementRequest{}, httpx.Conflict("EXCEEDS_OUTSTANDING_DEBT", msg)
	}

	req, err := s.q.CreateSettlementRequest(ctx, db.CreateSettlementRequestParams{
		PayerID: actorID, RecipientID: toUserID, GroupID: groupID, Amount: in.ParsedAmount, Currency: currency,
	})
	if err != nil {
		return db.SettlementRequest{}, err
	}

	if _, err := s.notifications.Notify(ctx, toUserID, notifications.TypeSettlement, "Payment to confirm",
		fmt.Sprintf("%s says they paid you %s. Confirm it once you've received it.",
			s.nameOf(ctx, actorID), money.Format(in.ParsedAmount, currency))); err != nil {
		return db.SettlementRequest{}, err
	}
	return req, nil
}

// RecordReceived is the recipient recording a payment they received.
// They're the one who would lose out if it were wrong, so it counts at
// once: a SETTLEMENT expense, no request (ADR-019).
func (s *Service) RecordReceived(ctx context.Context, actorID pgtype.UUID, in apitypes.RecordReceivedInput) (expenses.Expense, error) {
	fromUserID, err := s.requireOtherProfile(ctx, actorID, in.FromUserID)
	if err != nil {
		return expenses.Expense{}, err
	}
	currency, groupID, err := s.resolveCurrency(ctx, actorID, fromUserID, in.GroupID)
	if err != nil {
		return expenses.Expense{}, err
	}

	outstanding, err := s.outstanding(ctx, fromUserID, actorID, groupID)
	if isAPIError(err) {
		// outstanding words its errors for the payer; say it from here.
		return expenses.Expense{}, httpx.Conflict("NO_OUTSTANDING_DEBT", "They don't owe you anything to record.")
	}
	if err != nil {
		return expenses.Expense{}, err
	}
	if in.ParsedAmount > outstanding {
		return expenses.Expense{}, httpx.Conflict("EXCEEDS_OUTSTANDING_DEBT",
			fmt.Sprintf("They owe you %s, so you can't record more than that.", money.Format(outstanding, currency)))
	}

	settlement, err := s.writeSettlement(ctx, fromUserID, actorID, groupID, currency, in.ParsedAmount)
	if err != nil {
		return expenses.Expense{}, err
	}

	if _, err := s.notifications.Notify(ctx, fromUserID, notifications.TypeSettlement, "Payment recorded",
		fmt.Sprintf("%s recorded that you paid them %s.", s.nameOf(ctx, actorID), money.Format(in.ParsedAmount, currency))); err != nil {
		return expenses.Expense{}, err
	}
	return settlement, nil
}

// Confirm is the recipient confirming a payment request: it becomes a
// SETTLEMENT expense and the balance moves. Checked again against the
// live debt, which may have changed since the payer recorded it.
func (s *Service) Confirm(ctx context.Context, actorID, requestID pgtype.UUID) (db.SettlementRequest, error) {
	req, err := s.requireRequest(ctx, actorID, requestID)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if req.RecipientID != actorID {
		return db.SettlementRequest{}, httpx.Forbidden("NOT_REQUEST_RECIPIENT", "Only the person who was paid can confirm this.")
	}
	if req.Status != db.SettlementRequestStatusPENDING {
		return db.SettlementRequest{}, httpx.Conflict("NOT_PENDING", "This payment is no longer waiting to be confirmed.")
	}
	if req.GroupID.Valid {
		for _, id := range []pgtype.UUID{req.PayerID, req.RecipientID} {
			if _, err := s.groups.RequireActiveMembership(ctx, req.GroupID, id); err != nil {
				return db.SettlementRequest{}, err
			}
		}
	}
	outstanding, err := s.outstanding(ctx, req.PayerID, req.RecipientID, req.GroupID)
	if err != nil && !isAPIError(err) {
		return db.SettlementRequest{}, err
	}
	if err != nil || req.Amount > outstanding {
		owes := money.MinorUnits(0)
		if err == nil {
			owes = outstanding
		}
		return db.SettlementRequest{}, httpx.Conflict("EXCEEDS_OUTSTANDING_DEBT",
			fmt.Sprintf("They only owe you %s now, less than this payment. Reject it and ask them to record the right amount.",
				money.Format(owes, req.Currency)))
	}

	// Claim it first, atomically, so two taps can't both confirm it.
	if _, err := s.q.ResolveSettlementRequest(ctx, db.ResolveSettlementRequestParams{ID: req.ID, Status: db.SettlementRequestStatusCONFIRMED}); errors.Is(err, pgx.ErrNoRows) {
		return db.SettlementRequest{}, httpx.Conflict("NOT_PENDING", "This payment is no longer waiting to be confirmed.")
	} else if err != nil {
		return db.SettlementRequest{}, err
	}
	settlement, err := s.writeSettlement(ctx, req.PayerID, req.RecipientID, req.GroupID, req.Currency, req.Amount)
	if err != nil {
		_ = s.q.ReopenSettlementRequest(ctx, req.ID)
		return db.SettlementRequest{}, err
	}
	linked, err := s.q.LinkSettlementRequest(ctx, db.LinkSettlementRequestParams{ID: req.ID, SettlementID: settlement.ID})
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if req.ReceiptPath.Valid {
		if err := s.expenses.SetReceiptPath(ctx, settlement.ID, req.ReceiptPath.String); err != nil {
			return db.SettlementRequest{}, err
		}
	}

	if _, err := s.notifications.Notify(ctx, req.PayerID, notifications.TypeSettlement, "Payment confirmed",
		fmt.Sprintf("%s confirmed your payment of %s.", s.nameOf(ctx, actorID), money.Format(req.Amount, req.Currency))); err != nil {
		return db.SettlementRequest{}, err
	}
	return linked, nil
}

// Reject is the recipient saying they didn't receive it. Nothing changes
// in any balance; the payer is told.
func (s *Service) Reject(ctx context.Context, actorID, requestID pgtype.UUID) (db.SettlementRequest, error) {
	req, err := s.requireRequest(ctx, actorID, requestID)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if req.RecipientID != actorID {
		return db.SettlementRequest{}, httpx.Forbidden("NOT_REQUEST_RECIPIENT", "Only the person who was paid can reject this.")
	}
	resolved, err := s.resolve(ctx, req, db.SettlementRequestStatusREJECTED)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if _, err := s.notifications.Notify(ctx, req.PayerID, notifications.TypeSettlement, "Payment not confirmed",
		fmt.Sprintf("%s says they didn't receive your payment of %s.", s.nameOf(ctx, actorID), money.Format(req.Amount, req.Currency))); err != nil {
		return db.SettlementRequest{}, err
	}
	return resolved, nil
}

// Cancel is the payer withdrawing a payment they recorded by mistake,
// while it's still waiting.
func (s *Service) Cancel(ctx context.Context, actorID, requestID pgtype.UUID) (db.SettlementRequest, error) {
	req, err := s.requireRequest(ctx, actorID, requestID)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if req.PayerID != actorID {
		return db.SettlementRequest{}, httpx.Forbidden("NOT_REQUEST_PAYER", "Only the person who recorded this payment can cancel it.")
	}
	resolved, err := s.resolve(ctx, req, db.SettlementRequestStatusCANCELLED)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if _, err := s.notifications.Notify(ctx, req.RecipientID, notifications.TypeSettlement, "Payment cancelled",
		fmt.Sprintf("%s cancelled the payment of %s they had recorded.", s.nameOf(ctx, actorID), money.Format(req.Amount, req.Currency))); err != nil {
		return db.SettlementRequest{}, err
	}
	return resolved, nil
}

// List is the user's payment requests, either side: every pending one,
// and those resolved in the last 30 days.
func (s *Service) List(ctx context.Context, actorID pgtype.UUID) ([]db.SettlementRequest, error) {
	return s.q.ListSettlementRequestsForUser(ctx, actorID)
}

// UploadReceipt attaches proof (a transfer screenshot, a receipt) to a
// pending request; payer only. Replaces any earlier one.
func (s *Service) UploadReceipt(ctx context.Context, actorID, requestID pgtype.UUID, body io.Reader, size int64) (db.SettlementRequest, error) {
	req, err := s.requireRequest(ctx, actorID, requestID)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if req.PayerID != actorID {
		return db.SettlementRequest{}, httpx.Forbidden("NOT_REQUEST_PAYER", "Only the person who recorded this payment can attach a receipt.")
	}
	if req.Status != db.SettlementRequestStatusPENDING {
		return db.SettlementRequest{}, httpx.Conflict("NOT_PENDING", "This payment is no longer waiting to be confirmed.")
	}
	key, err := s.expenses.StoreReceipt(ctx, "settlement-requests/"+idutil.String(req.ID), body, size)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	updated, err := s.q.UpdateSettlementRequestReceiptPath(ctx, db.UpdateSettlementRequestReceiptPathParams{
		ID: req.ID, ReceiptPath: pgtype.Text{String: key, Valid: true},
	})
	if err != nil {
		return db.SettlementRequest{}, err
	}
	if req.ReceiptPath.Valid {
		s.expenses.DeleteReceiptKey(ctx, req.ReceiptPath.String)
	}
	return updated, nil
}

// ReceiptURL is a short-lived link to a request's receipt, for the payer
// or the recipient.
func (s *Service) ReceiptURL(ctx context.Context, actorID, requestID pgtype.UUID) (string, error) {
	req, err := s.requireRequest(ctx, actorID, requestID)
	if err != nil {
		return "", err
	}
	if !req.ReceiptPath.Valid {
		return "", httpx.NotFound("RECEIPT_NOT_FOUND", "This payment has no receipt.")
	}
	return s.expenses.ReceiptURLForKey(ctx, req.ReceiptPath.String)
}

// requireRequest loads a request the actor is part of; anyone else gets
// the same not-found as a request that doesn't exist.
func (s *Service) requireRequest(ctx context.Context, actorID, requestID pgtype.UUID) (db.SettlementRequest, error) {
	req, err := s.q.GetSettlementRequest(ctx, requestID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && req.PayerID != actorID && req.RecipientID != actorID) {
		return db.SettlementRequest{}, httpx.NotFound("SETTLEMENT_REQUEST_NOT_FOUND", "No such payment.")
	}
	return req, err
}

func (s *Service) resolve(ctx context.Context, req db.SettlementRequest, status db.SettlementRequestStatus) (db.SettlementRequest, error) {
	resolved, err := s.q.ResolveSettlementRequest(ctx, db.ResolveSettlementRequestParams{ID: req.ID, Status: status})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.SettlementRequest{}, httpx.Conflict("NOT_PENDING", "This payment is no longer waiting to be confirmed.")
	}
	return resolved, err
}

func (s *Service) requireOtherProfile(ctx context.Context, actorID pgtype.UUID, raw string) (pgtype.UUID, error) {
	otherID, err := idutil.Parse(raw)
	if err != nil {
		return pgtype.UUID{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	}
	if actorID == otherID {
		return pgtype.UUID{}, httpx.BadRequest("CANNOT_SETTLE_WITH_SELF", "You cannot record a settlement with yourself.")
	}
	if _, err := s.q.GetProfileByID(ctx, otherID); errors.Is(err, pgx.ErrNoRows) {
		return pgtype.UUID{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	} else if err != nil {
		return pgtype.UUID{}, err
	}
	return otherID, nil
}

// writeSettlement is the one place a SETTLEMENT expense is written
// (ADR-003's shape): paid by the payer, the recipient's share carrying
// the amount, the payer's 0.
func (s *Service) writeSettlement(ctx context.Context, payerID, recipientID, groupID pgtype.UUID, currency string, amount money.MinorUnits) (expenses.Expense, error) {
	settlement, err := s.q.CreateExpense(ctx, db.CreateExpenseParams{
		GroupID: groupID, Name: "Settlement", Category: "Settlement", Amount: amount,
		Currency: currency, PaidByID: payerID, SplitType: db.SplitTypeSETTLEMENT,
		ExpenseDate: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return expenses.Expense{}, err
	}
	if _, err := s.q.CreateExpenseParticipant(ctx, db.CreateExpenseParticipantParams{ExpenseID: settlement.ID, UserID: payerID, Amount: 0}); err != nil {
		return expenses.Expense{}, err
	}
	if _, err := s.q.CreateExpenseParticipant(ctx, db.CreateExpenseParticipantParams{ExpenseID: settlement.ID, UserID: recipientID, Amount: amount}); err != nil {
		return expenses.Expense{}, err
	}
	return s.expenses.LoadExpense(ctx, settlement)
}

func isAPIError(err error) bool {
	var apiErr *httpx.APIError
	return errors.As(err, &apiErr)
}

func (s *Service) nameOf(ctx context.Context, userID pgtype.UUID) string {
	if p, err := s.q.GetProfileByID(ctx, userID); err == nil {
		return p.DisplayName
	}
	return "Someone"
}

// outstanding is the most the actor may settle to toUserID.
//
// Personal: their pairwise balance (what the actor owes them across
// shared personal expenses).
//
// In a group (ADR-010, decided with the user 2026-09-29): measured
// against group nets, not the pair's shared expenses -- the actor must
// owe the group (net < 0), the recipient must be owed (net > 0), and the
// amount is capped by the smaller of the two. That's what every group
// screen shows and what the simplified plan routes through, so each of
// its payments is payable; after one, both nets move toward 0 and no one
// else's changes.
func (s *Service) outstanding(ctx context.Context, actorID, toUserID, groupID pgtype.UUID) (money.MinorUnits, error) {
	if !groupID.Valid {
		owed, err := s.balances.GetPairwiseBalance(ctx, actorID, toUserID, groupID)
		if err != nil {
			return 0, err
		}
		if owed <= 0 {
			return 0, httpx.Conflict("NO_OUTSTANDING_DEBT", "You do not currently owe this user anything to settle.")
		}
		return owed, nil
	}

	positions, err := s.balances.GetGroupSummary(ctx, groupID)
	if err != nil {
		return 0, err
	}
	var actorNet, recipientNet money.MinorUnits
	actorKey, recipientKey := idutil.String(actorID), idutil.String(toUserID)
	for _, p := range positions {
		switch p.UserID {
		case actorKey:
			actorNet = p.NetBalance
		case recipientKey:
			recipientNet = p.NetBalance
		}
	}
	if actorNet >= 0 {
		return 0, httpx.Conflict("NO_OUTSTANDING_DEBT", "You do not currently owe anything in this group.")
	}
	if recipientNet <= 0 {
		return 0, httpx.Conflict("RECIPIENT_NOT_OWED", "This member isn't owed anything in this group.")
	}
	return min(-actorNet, recipientNet), nil
}

// resolveCurrency also enforces group-membership authorization as a side
// effect, matching how expenses' prepareWrite resolves currency.
func (s *Service) resolveCurrency(ctx context.Context, actorID, toUserID pgtype.UUID, groupIDRaw *string) (string, pgtype.UUID, error) {
	if groupIDRaw == nil {
		actor, err := s.q.GetProfileByID(ctx, actorID)
		if err != nil {
			return "", pgtype.UUID{}, err
		}
		return actor.PreferredCurrency, pgtype.UUID{}, nil
	}

	groupID, err := idutil.Parse(*groupIDRaw)
	if err != nil {
		return "", pgtype.UUID{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	group, err := s.q.GetGroupByID(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", pgtype.UUID{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	if err != nil {
		return "", pgtype.UUID{}, err
	}
	if _, err := s.groups.RequireActiveMembership(ctx, groupID, actorID); err != nil {
		return "", pgtype.UUID{}, err
	}
	if _, err := s.groups.RequireActiveMembership(ctx, groupID, toUserID); err != nil {
		return "", pgtype.UUID{}, err
	}
	return group.Currency, groupID, nil
}
