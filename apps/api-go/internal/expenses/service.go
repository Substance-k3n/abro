// Package expenses implements create/list/detail/update/soft-delete,
// notes, and receipt upload/read/delete -- ported from
// apps/api/src/modules/expenses.
package expenses

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
	"github.com/Substance-k3n/abro/apps/api/internal/storage"
)

// receiptExtensionByMimeType -- ABRO_PRD.md §36 "Supported initially".
var receiptExtensionByMimeType = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

const maxReceiptBytes = 10 * 1024 * 1024

type Service struct {
	q             db.Querier
	groups        *groups.Service
	friends       *friends.Service
	notifications *notifications.Service
	receiptStore  *storage.ReceiptStorage
}

func NewService(q db.Querier, groupsSvc *groups.Service, friendsSvc *friends.Service, notificationsSvc *notifications.Service, receiptStore *storage.ReceiptStorage) *Service {
	return &Service{q: q, groups: groupsSvc, friends: friendsSvc, notifications: notificationsSvc, receiptStore: receiptStore}
}

// Expense is an Expense row plus its participants (each with the nested
// Profile) and payer -- the same shape the original Prisma
// `include: { participants: { include: { user: true } }, paidBy: true }` produced.
type Expense struct {
	db.Expense
	PaidBy       db.Profile
	Participants []db.ListExpenseParticipantsForExpenseIDsRow
}

type preparedWrite struct {
	paidByID     pgtype.UUID
	currency     string
	participants []money.ExpenseParticipantInput
}

func (s *Service) Create(ctx context.Context, actorID pgtype.UUID, in apitypes.CreateExpenseInput) (Expense, error) {
	prepared, err := s.prepareWrite(ctx, actorID, in)
	if err != nil {
		return Expense{}, err
	}

	var groupID pgtype.UUID
	if in.GroupID != nil {
		groupID, err = idutil.Parse(*in.GroupID)
		if err != nil {
			return Expense{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
		}
	}

	expense, err := s.q.CreateExpense(ctx, db.CreateExpenseParams{
		GroupID: groupID, Name: in.Name, Category: in.Category, Amount: in.ParsedAmount,
		Currency: prepared.currency, PaidByID: prepared.paidByID, SplitType: db.SplitType(in.SplitType),
		ExpenseDate: pgtype.Timestamptz{Time: in.ParsedExpenseDate, Valid: true},
		ReceiptPath: optionalText(in.ReceiptPath), Notes: optionalText(in.Notes),
	})
	if err != nil {
		return Expense{}, err
	}

	if err := s.createParticipants(ctx, expense.ID, prepared.participants); err != nil {
		return Expense{}, err
	}

	full, err := s.loadExpense(ctx, expense)
	if err != nil {
		return Expense{}, err
	}

	if err := s.notifyParties(ctx, actorID, full, notifications.TypeExpenseAdded, "New expense", func(actor string) string {
		return fmt.Sprintf("%s added an expense: %q (%d %s).", actor, full.Name, full.Amount, full.Currency)
	}); err != nil {
		return Expense{}, err
	}

	return full, nil
}

func (s *Service) Update(ctx context.Context, actorID, expenseID pgtype.UUID, in apitypes.CreateExpenseInput) (Expense, error) {
	expense, err := s.requireVisible(ctx, actorID, expenseID)
	if err != nil {
		return Expense{}, err
	}
	if err := s.requireEditAuthority(ctx, actorID, expense); err != nil {
		return Expense{}, err
	}

	prepared, err := s.prepareWrite(ctx, actorID, in)
	if err != nil {
		return Expense{}, err
	}

	var groupID pgtype.UUID
	if in.GroupID != nil {
		groupID, err = idutil.Parse(*in.GroupID)
		if err != nil {
			return Expense{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
		}
	}

	if err := s.q.DeleteExpenseParticipants(ctx, expenseID); err != nil {
		return Expense{}, err
	}
	updated, err := s.q.UpdateExpense(ctx, db.UpdateExpenseParams{
		ID: expenseID, GroupID: groupID, Name: in.Name, Category: in.Category, Amount: in.ParsedAmount,
		Currency: prepared.currency, PaidByID: prepared.paidByID, SplitType: db.SplitType(in.SplitType),
		ExpenseDate: pgtype.Timestamptz{Time: in.ParsedExpenseDate, Valid: true},
		ReceiptPath: optionalText(in.ReceiptPath), Notes: optionalText(in.Notes), UpdatedByID: actorID,
	})
	if err != nil {
		return Expense{}, err
	}
	if err := s.createParticipants(ctx, expenseID, prepared.participants); err != nil {
		return Expense{}, err
	}

	full, err := s.loadExpense(ctx, updated)
	if err != nil {
		return Expense{}, err
	}

	if err := s.notifyParties(ctx, actorID, full, notifications.TypeExpenseEdited, "Expense updated", func(actor string) string {
		return fmt.Sprintf("%s edited an expense: %q (%d %s).", actor, full.Name, full.Amount, full.Currency)
	}); err != nil {
		return Expense{}, err
	}

	return full, nil
}

func (s *Service) SoftDelete(ctx context.Context, actorID, expenseID pgtype.UUID) error {
	expense, err := s.requireVisible(ctx, actorID, expenseID)
	if err != nil {
		return err
	}
	if err := s.requireEditAuthority(ctx, actorID, expense); err != nil {
		return err
	}

	if err := s.q.SoftDeleteExpense(ctx, db.SoftDeleteExpenseParams{ID: expenseID, DeletedByID: actorID}); err != nil {
		return err
	}

	// Participant rows survive a soft delete (only deleted_at changes), so
	// the pre-delete audience is still queryable here.
	full, err := s.loadExpense(ctx, expense)
	if err != nil {
		return err
	}
	return s.notifyParties(ctx, actorID, full, notifications.TypeExpenseDeleted, "Expense deleted", func(actor string) string {
		return fmt.Sprintf("%s deleted an expense: %q (%d %s).", actor, full.Name, full.Amount, full.Currency)
	})
}

func (s *Service) FindByID(ctx context.Context, actorID, expenseID pgtype.UUID) (Expense, error) {
	expense, err := s.requireVisible(ctx, actorID, expenseID)
	if err != nil {
		return Expense{}, err
	}
	return s.loadExpense(ctx, expense)
}

func (s *Service) List(ctx context.Context, actorID pgtype.UUID, q apitypes.ListExpensesQuery) ([]Expense, error) {
	limit := q.Limit
	if limit <= 0 {
		limit = 50
	}

	var rows []db.Expense
	var err error
	switch {
	case q.GroupID != "":
		groupID, parseErr := idutil.Parse(q.GroupID)
		if parseErr != nil {
			return nil, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
		}
		if _, err := s.groups.RequireActiveMembership(ctx, groupID, actorID); err != nil {
			return nil, err
		}
		rows, err = s.q.ListExpensesByGroup(ctx, db.ListExpensesByGroupParams{GroupID: groupID, Limit: limit, Offset: q.Offset})
	case q.FriendID != "":
		friendID, parseErr := idutil.Parse(q.FriendID)
		if parseErr != nil {
			return []Expense{}, nil
		}
		rows, err = s.q.ListExpensesWithFriend(ctx, db.ListExpensesWithFriendParams{UserID: actorID, UserID_2: friendID, Limit: limit, Offset: q.Offset})
	default:
		rows, err = s.q.ListMyExpenses(ctx, db.ListMyExpensesParams{UserID: actorID, Limit: limit, Offset: q.Offset})
	}
	if err != nil {
		return nil, err
	}

	return s.loadExpenses(ctx, rows)
}

func (s *Service) AddNote(ctx context.Context, actorID, expenseID pgtype.UUID, content string) (db.ListExpenseNotesWithAuthorRow, error) {
	if _, err := s.requireVisible(ctx, actorID, expenseID); err != nil {
		return db.ListExpenseNotesWithAuthorRow{}, err
	}
	note, err := s.q.CreateExpenseNote(ctx, db.CreateExpenseNoteParams{ExpenseID: expenseID, AuthorID: actorID, Content: content})
	if err != nil {
		return db.ListExpenseNotesWithAuthorRow{}, err
	}
	author, err := s.q.GetProfileByID(ctx, actorID)
	if err != nil {
		return db.ListExpenseNotesWithAuthorRow{}, err
	}
	return db.ListExpenseNotesWithAuthorRow{
		ID: note.ID, ExpenseID: note.ExpenseID, Content: note.Content, CreatedAt: note.CreatedAt,
		AuthorID: author.ID, AuthorDisplayName: author.DisplayName, AuthorAvatarUrl: author.AvatarUrl,
		AuthorEmail: author.Email, AuthorPreferredCurrency: author.PreferredCurrency, AuthorLocale: author.Locale,
	}, nil
}

func (s *Service) ListNotes(ctx context.Context, actorID, expenseID pgtype.UUID) ([]db.ListExpenseNotesWithAuthorRow, error) {
	if _, err := s.requireVisible(ctx, actorID, expenseID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListExpenseNotesWithAuthor(ctx, expenseID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []db.ListExpenseNotesWithAuthorRow{}
	}
	return rows, nil
}

// UploadReceipt implements ABRO_PRD.md §36. Replaces any existing receipt
// -- one per expense, matching the schema's singular receipt_path.
// Uploads the new object before deleting the old one, so a failed upload
// never destroys a working receipt.
func (s *Service) UploadReceipt(ctx context.Context, actorID, expenseID pgtype.UUID, body io.Reader, size int64, mimeType string) (Expense, error) {
	if err := s.requireStorageConfigured(); err != nil {
		return Expense{}, err
	}
	expense, err := s.requireVisible(ctx, actorID, expenseID)
	if err != nil {
		return Expense{}, err
	}
	if err := s.requireEditAuthority(ctx, actorID, expense); err != nil {
		return Expense{}, err
	}

	extension, ok := receiptExtensionByMimeType[mimeType]
	if !ok {
		return Expense{}, httpx.BadRequest("UNSUPPORTED_RECEIPT_TYPE", "Receipts must be JPG, PNG, or WebP.")
	}
	if size > maxReceiptBytes {
		return Expense{}, httpx.BadRequest("RECEIPT_TOO_LARGE", fmt.Sprintf("Receipt must be %dMB or smaller.", maxReceiptBytes/(1024*1024)))
	}

	key := fmt.Sprintf("receipts/%s/%s.%s", idutil.String(expenseID), uuid.NewString(), extension)
	if err := s.receiptStore.Upload(ctx, key, body, size, mimeType); err != nil {
		return Expense{}, err
	}

	updated, err := s.q.UpdateExpenseReceiptPath(ctx, db.UpdateExpenseReceiptPathParams{ID: expenseID, ReceiptPath: pgtype.Text{String: key, Valid: true}})
	if err != nil {
		return Expense{}, err
	}

	if expense.ReceiptPath.Valid {
		_ = s.receiptStore.Delete(ctx, expense.ReceiptPath.String)
	}

	return s.loadExpense(ctx, updated)
}

// GetReceiptURL returns a short-lived presigned URL -- the caller must
// already be authorized to view the expense, same as any other read.
func (s *Service) GetReceiptURL(ctx context.Context, actorID, expenseID pgtype.UUID) (string, error) {
	if err := s.requireStorageConfigured(); err != nil {
		return "", err
	}
	expense, err := s.requireVisible(ctx, actorID, expenseID)
	if err != nil {
		return "", err
	}
	if !expense.ReceiptPath.Valid {
		return "", httpx.NotFound("RECEIPT_NOT_FOUND", "This expense has no receipt.")
	}
	return s.receiptStore.GetPresignedGetURL(ctx, expense.ReceiptPath.String)
}

func (s *Service) DeleteReceipt(ctx context.Context, actorID, expenseID pgtype.UUID) error {
	if err := s.requireStorageConfigured(); err != nil {
		return err
	}
	expense, err := s.requireVisible(ctx, actorID, expenseID)
	if err != nil {
		return err
	}
	if err := s.requireEditAuthority(ctx, actorID, expense); err != nil {
		return err
	}
	if !expense.ReceiptPath.Valid {
		return httpx.NotFound("RECEIPT_NOT_FOUND", "This expense has no receipt.")
	}

	if err := s.receiptStore.Delete(ctx, expense.ReceiptPath.String); err != nil {
		return err
	}
	_, err = s.q.UpdateExpenseReceiptPath(ctx, db.UpdateExpenseReceiptPathParams{ID: expenseID, ReceiptPath: pgtype.Text{}})
	return err
}

func (s *Service) requireStorageConfigured() error {
	if !s.receiptStore.IsConfigured() {
		return httpx.NewAPIError(501, "RECEIPT_STORAGE_NOT_CONFIGURED", "Receipt storage is not configured on this server.")
	}
	return nil
}

// prepareWrite is shared by Create/Update: resolves payer + currency,
// checks membership/friendship invariants, computes shares.
func (s *Service) prepareWrite(ctx context.Context, actorID pgtype.UUID, in apitypes.CreateExpenseInput) (preparedWrite, error) {
	paidByID := actorID
	if in.PaidByID != nil {
		parsed, err := idutil.Parse(*in.PaidByID)
		if err != nil {
			return preparedWrite{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
		}
		paidByID = parsed
	}

	seen := map[string]bool{}
	for _, p := range in.Participants {
		if seen[p.UserID] {
			return preparedWrite{}, httpx.BadRequest("DUPLICATE_PARTICIPANT", "A participant appears more than once.")
		}
		seen[p.UserID] = true
	}

	currency := "ETB"
	if in.Currency != nil {
		currency = *in.Currency
	}

	if in.GroupID != nil {
		groupID, err := idutil.Parse(*in.GroupID)
		if err != nil {
			return preparedWrite{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
		}
		group, err := s.q.GetGroupByID(ctx, groupID)
		if errors.Is(err, pgx.ErrNoRows) {
			return preparedWrite{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
		}
		if err != nil {
			return preparedWrite{}, err
		}
		currency = group.Currency

		if _, err := s.groups.RequireActiveMembership(ctx, groupID, actorID); err != nil {
			return preparedWrite{}, err
		}
		if _, err := s.groups.RequireActiveMembership(ctx, groupID, paidByID); err != nil {
			return preparedWrite{}, err
		}
		for userID := range seen {
			participantID, _ := idutil.Parse(userID)
			if _, err := s.groups.RequireActiveMembership(ctx, groupID, participantID); err != nil {
				return preparedWrite{}, err
			}
		}
	} else {
		involved := map[pgtype.UUID]bool{paidByID: true}
		for userID := range seen {
			id, err := idutil.Parse(userID)
			if err != nil {
				return preparedWrite{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
			}
			involved[id] = true
		}
		if !involved[actorID] {
			return preparedWrite{}, httpx.Forbidden("NOT_INVOLVED", "You must be the payer or a participant.")
		}
		for otherID := range involved {
			if otherID == actorID {
				continue
			}
			ok, err := s.friends.AreFriends(ctx, actorID, otherID)
			if err != nil {
				return preparedWrite{}, err
			}
			if !ok {
				return preparedWrite{}, httpx.Conflict("NOT_FRIENDS", fmt.Sprintf("User %s must be a friend.", idutil.String(otherID)))
			}
		}
		if in.Currency == nil {
			payer, err := s.q.GetProfileByID(ctx, paidByID)
			if err == nil {
				currency = payer.PreferredCurrency
			}
		}
	}

	participants, err := computeParticipantAmounts(in)
	if err != nil {
		return preparedWrite{}, err
	}

	return preparedWrite{paidByID: paidByID, currency: currency, participants: participants}, nil
}

// computeParticipantAmounts implements ABRO_PRD.md §14 Split Logic.
func computeParticipantAmounts(in apitypes.CreateExpenseInput) ([]money.ExpenseParticipantInput, error) {
	switch in.SplitType {
	case "EQUAL":
		shares, err := money.SplitEqually(in.ParsedAmount, len(in.Participants))
		if err != nil {
			return nil, httpx.BadRequest("VALIDATION_ERROR", err.Error())
		}
		out := make([]money.ExpenseParticipantInput, len(in.Participants))
		for i, p := range in.Participants {
			out[i] = money.ExpenseParticipantInput{UserID: p.UserID, Amount: shares[i]}
		}
		return out, nil

	case "EXACT":
		out := make([]money.ExpenseParticipantInput, len(in.Participants))
		for i, p := range in.Participants {
			amount, _ := money.ParseAmount(p.Amount)
			out[i] = money.ExpenseParticipantInput{UserID: p.UserID, Amount: amount}
		}
		if err := money.AssertSharesMatchTotal(in.ParsedAmount, out); err != nil {
			return nil, httpx.BadRequest("SHARES_DO_NOT_MATCH_TOTAL", err.Error())
		}
		return out, nil

	case "PERCENTAGE":
		basisPoints := make([]money.MinorUnits, len(in.Participants))
		var totalBasisPoints money.MinorUnits
		for i, p := range in.Participants {
			bp := money.MinorUnits(p.Percentage*100 + 0.5)
			basisPoints[i] = bp
			totalBasisPoints += bp
		}
		if totalBasisPoints != 10000 {
			return nil, httpx.BadRequest("PERCENTAGES_MUST_SUM_TO_100",
				fmt.Sprintf("Percentages must sum to exactly 100 (got %.2f).", float64(totalBasisPoints)/100))
		}
		amounts, err := money.SplitByWeights(in.ParsedAmount, basisPoints)
		if err != nil {
			return nil, httpx.BadRequest("VALIDATION_ERROR", err.Error())
		}
		out := make([]money.ExpenseParticipantInput, len(in.Participants))
		for i, p := range in.Participants {
			out[i] = money.ExpenseParticipantInput{UserID: p.UserID, Amount: amounts[i]}
		}
		return out, nil

	case "SHARES":
		weights := make([]money.MinorUnits, len(in.Participants))
		for i, p := range in.Participants {
			weights[i] = money.MinorUnits(p.Shares)
		}
		amounts, err := money.SplitByWeights(in.ParsedAmount, weights)
		if err != nil {
			return nil, httpx.BadRequest("VALIDATION_ERROR", err.Error())
		}
		out := make([]money.ExpenseParticipantInput, len(in.Participants))
		for i, p := range in.Participants {
			out[i] = money.ExpenseParticipantInput{UserID: p.UserID, Amount: amounts[i]}
		}
		return out, nil

	default:
		return nil, httpx.BadRequest("VALIDATION_ERROR", "unknown splitType")
	}
}

func (s *Service) createParticipants(ctx context.Context, expenseID pgtype.UUID, participants []money.ExpenseParticipantInput) error {
	for _, p := range participants {
		userID, err := idutil.Parse(p.UserID)
		if err != nil {
			return httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
		}
		if _, err := s.q.CreateExpenseParticipant(ctx, db.CreateExpenseParticipantParams{
			ExpenseID: expenseID, UserID: userID, Amount: p.Amount,
		}); err != nil {
			return err
		}
	}
	return nil
}

// notifyParties implements ABRO_PRD.md §34: EXPENSE_ADDED/EDITED/DELETED
// to everyone involved (payer + participants) except the actor.
func (s *Service) notifyParties(ctx context.Context, actorID pgtype.UUID, expense Expense, t notifications.Type, title string, body func(actorName string) string) error {
	recipients := map[pgtype.UUID]bool{expense.PaidByID: true}
	for _, p := range expense.Participants {
		recipients[p.UserID] = true
	}
	delete(recipients, actorID)
	if len(recipients) == 0 {
		return nil
	}

	ids := make([]pgtype.UUID, 0, len(recipients))
	for id := range recipients {
		ids = append(ids, id)
	}

	actorName := "Someone"
	if actor, err := s.q.GetProfileByID(ctx, actorID); err == nil {
		actorName = actor.DisplayName
	}

	return s.notifications.NotifyMany(ctx, ids, t, title, body(actorName))
}

func (s *Service) requireVisible(ctx context.Context, actorID, expenseID pgtype.UUID) (db.Expense, error) {
	expense, err := s.q.GetExpenseByID(ctx, expenseID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && expense.DeletedAt.Valid) {
		return db.Expense{}, httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	if err != nil {
		return db.Expense{}, err
	}

	if expense.PaidByID == actorID {
		return expense, nil
	}

	if _, err := s.q.GetExpenseParticipant(ctx, db.GetExpenseParticipantParams{ExpenseID: expenseID, UserID: actorID}); err == nil {
		return expense, nil
	}

	if expense.GroupID.Valid {
		membership, err := s.q.GetGroupMember(ctx, db.GetGroupMemberParams{GroupID: expense.GroupID, UserID: actorID})
		if err == nil && membership.Status == db.GroupMemberStatusACTIVE {
			return expense, nil
		}
	}

	return db.Expense{}, httpx.Forbidden("NOT_VISIBLE", "Not authorized to view this expense.")
}

func (s *Service) requireEditAuthority(ctx context.Context, actorID pgtype.UUID, expense db.Expense) error {
	if expense.PaidByID == actorID {
		return nil
	}
	if expense.GroupID.Valid {
		membership, err := s.q.GetGroupMember(ctx, db.GetGroupMemberParams{GroupID: expense.GroupID, UserID: actorID})
		if err == nil && membership.Status == db.GroupMemberStatusACTIVE && membership.Role == db.GroupMemberRoleADMIN {
			return nil
		}
	}
	return httpx.Forbidden("NOT_EDIT_AUTHORIZED", "Only the payer or a group admin can edit this expense.")
}

func (s *Service) loadExpense(ctx context.Context, expense db.Expense) (Expense, error) {
	expenses, err := s.loadExpenses(ctx, []db.Expense{expense})
	if err != nil {
		return Expense{}, err
	}
	return expenses[0], nil
}

func (s *Service) loadExpenses(ctx context.Context, rows []db.Expense) ([]Expense, error) {
	if len(rows) == 0 {
		return []Expense{}, nil
	}

	ids := make([]pgtype.UUID, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	participantRows, err := s.q.ListExpenseParticipantsForExpenseIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	byExpense := map[pgtype.UUID][]db.ListExpenseParticipantsForExpenseIDsRow{}
	for _, p := range participantRows {
		byExpense[p.ExpenseID] = append(byExpense[p.ExpenseID], p)
	}

	out := make([]Expense, len(rows))
	for i, r := range rows {
		paidBy, err := s.q.GetProfileByID(ctx, r.PaidByID)
		if err != nil {
			return nil, err
		}
		out[i] = Expense{Expense: r, PaidBy: paidBy, Participants: byExpense[r.ID]}
	}
	return out, nil
}

func optionalText(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}
