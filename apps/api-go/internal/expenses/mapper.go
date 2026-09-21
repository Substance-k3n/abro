package expenses

import (
	"strconv"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

func toAuthExpense(e Expense) apitypes.AuthExpense {
	out := apitypes.AuthExpense{
		ID: idutil.String(e.ID), Name: e.Name, Category: e.Category,
		Amount: strconv.FormatInt(e.Amount, 10), Currency: e.Currency,
		PaidBy: profileFromExpenseFields(e.PaidBy), SplitType: string(e.SplitType),
		ExpenseDate: e.ExpenseDate.Time, CreatedAt: e.CreatedAt.Time, UpdatedAt: e.UpdatedAt.Time,
		Participants: make([]apitypes.ExpenseParticipantOut, len(e.Participants)),
	}
	if e.GroupID.Valid {
		id := idutil.String(e.GroupID)
		out.GroupID = &id
	}
	if e.ReceiptPath.Valid {
		out.ReceiptPath = &e.ReceiptPath.String
	}
	if e.Notes.Valid {
		out.Notes = &e.Notes.String
	}
	if e.DeletedAt.Valid {
		out.DeletedAt = &e.DeletedAt.Time
	}
	for i, p := range e.Participants {
		user := apitypes.AuthProfile{
			ID: idutil.String(p.UserID), DisplayName: p.DisplayName,
			PreferredCurrency: p.PreferredCurrency, Locale: p.Locale,
		}
		if p.AvatarUrl.Valid {
			user.AvatarURL = &p.AvatarUrl.String
		}
		if p.Email.Valid {
			user.Email = &p.Email.String
		}
		out.Participants[i] = apitypes.ExpenseParticipantOut{
			ID: idutil.String(p.ID), Amount: strconv.FormatInt(p.Amount, 10), User: user,
		}
	}
	return out
}

func toAuthExpenseNote(n db.ListExpenseNotesWithAuthorRow) apitypes.AuthExpenseNote {
	author := apitypes.AuthProfile{
		ID: idutil.String(n.AuthorID), DisplayName: n.AuthorDisplayName,
		PreferredCurrency: n.AuthorPreferredCurrency, Locale: n.AuthorLocale,
	}
	if n.AuthorAvatarUrl.Valid {
		author.AvatarURL = &n.AuthorAvatarUrl.String
	}
	if n.AuthorEmail.Valid {
		author.Email = &n.AuthorEmail.String
	}
	return apitypes.AuthExpenseNote{
		ID: idutil.String(n.ID), ExpenseID: idutil.String(n.ExpenseID), Content: n.Content,
		CreatedAt: n.CreatedAt.Time, Author: author,
	}
}

func profileFromExpenseFields(p db.Profile) apitypes.AuthProfile {
	out := apitypes.AuthProfile{
		ID: idutil.String(p.ID), DisplayName: p.DisplayName,
		PreferredCurrency: p.PreferredCurrency, Locale: p.Locale,
	}
	if p.AvatarUrl.Valid {
		out.AvatarURL = &p.AvatarUrl.String
	}
	if p.Email.Valid {
		out.Email = &p.Email.String
	}
	return out
}
