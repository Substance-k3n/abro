package balances

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

// NextPayer is one place in a group's "who pays next" line (ADR-025).
type NextPayer struct {
	UserID     pgtype.UUID
	Owes       money.MinorUnits
	OwingSince *time.Time
}

// NextPayers is who should pay the group's next bill, in order: the
// active members who owe the group, the most first; on a tie, whoever
// has owed the longest. Derived from balances like everything else, so
// whoever actually pays drops down the line by itself -- and a member
// who owes and pays the next bill pays off their debt with it.
func (s *Service) NextPayers(ctx context.Context, groupID pgtype.UUID) ([]NextPayer, error) {
	summary, err := s.GetGroupSummary(ctx, groupID)
	if err != nil {
		return nil, err
	}
	owingSince, err := s.GroupOwingSince(ctx, groupID)
	if err != nil {
		return nil, err
	}
	active, err := s.q.ListActiveMemberIDs(ctx, groupID)
	if err != nil {
		return nil, err
	}
	isActive := map[string]bool{}
	for _, id := range active {
		isActive[idutil.String(id)] = true
	}

	line := []NextPayer{}
	for _, pos := range summary {
		if pos.NetBalance >= 0 || !isActive[pos.UserID] {
			continue
		}
		id, err := idutil.Parse(pos.UserID)
		if err != nil {
			return nil, err
		}
		p := NextPayer{UserID: id, Owes: -pos.NetBalance}
		if since, ok := owingSince[pos.UserID]; ok {
			p.OwingSince = &since
		}
		line = append(line, p)
	}
	sort.SliceStable(line, func(i, j int) bool {
		a, b := line[i], line[j]
		if a.Owes != b.Owes {
			return a.Owes > b.Owes
		}
		switch {
		case a.OwingSince != nil && b.OwingSince != nil && !a.OwingSince.Equal(*b.OwingSince):
			return a.OwingSince.Before(*b.OwingSince)
		case (a.OwingSince == nil) != (b.OwingSince == nil):
			return a.OwingSince != nil
		}
		// Stable across calls, so the line doesn't shuffle on a refresh.
		return idutil.String(a.UserID) < idutil.String(b.UserID)
	})
	return line, nil
}

// nextPayerNamesShown is how many of the line a notification names.
const nextPayerNamesShown = 3

// NextPayerNotifier tells a group who pays next once an expense leaves
// its payer covering at least the group's next_payer_threshold
// (ADR-025). Only when the expense takes them across it -- not on every
// expense after -- so a group isn't told the same thing over and over.
type NextPayerNotifier struct {
	q             db.Querier
	balances      *Service
	notifications *notifications.Service
}

func NewNextPayerNotifier(q db.Querier, balancesSvc *Service, notificationsSvc *notifications.Service) *NextPayerNotifier {
	return &NextPayerNotifier{q: q, balances: balancesSvc, notifications: notificationsSvc}
}

// AfterGroupExpense runs after a new group expense is saved. payerShare
// is what the payer owes of it themselves. Never fails the expense: an
// error is logged and the expense stands.
func (n *NextPayerNotifier) AfterGroupExpense(ctx context.Context, groupID, payerID pgtype.UUID, amount, payerShare money.MinorUnits) {
	if err := n.afterGroupExpense(ctx, groupID, payerID, amount, payerShare); err != nil {
		log.Printf("next payer: group %s: %v", idutil.String(groupID), err)
	}
}

func (n *NextPayerNotifier) afterGroupExpense(ctx context.Context, groupID, payerID pgtype.UUID, amount, payerShare money.MinorUnits) error {
	group, err := n.q.GetGroupByID(ctx, groupID)
	if err != nil {
		return err
	}
	threshold := group.NextPayerThreshold
	if threshold <= 0 {
		return nil
	}

	summary, err := n.balances.GetGroupSummary(ctx, groupID)
	if err != nil {
		return err
	}
	var after money.MinorUnits
	payerKey := idutil.String(payerID)
	for _, pos := range summary {
		if pos.UserID == payerKey {
			after = pos.NetBalance
			break
		}
	}
	// The expense moved the payer up by what they covered for others.
	before := after - (amount - payerShare)
	if after < threshold || before >= threshold {
		return nil
	}

	line, err := n.balances.NextPayers(ctx, groupID)
	if err != nil || len(line) == 0 {
		return err
	}
	names := make([]string, 0, nextPayerNamesShown)
	for _, p := range line[:min(len(line), nextPayerNamesShown)] {
		names = append(names, n.nameOf(ctx, p.UserID))
	}

	members, err := n.q.ListActiveMemberIDs(ctx, groupID)
	if err != nil {
		return err
	}
	body := fmt.Sprintf("%s is covering %s in %q. Next to pay: %s.",
		n.nameOf(ctx, payerID), money.Format(after, group.Currency), group.Name, strings.Join(names, ", then "))
	return n.notifications.NotifyManyLink(ctx, members, notifications.TypeNextPayer,
		"Whose turn to pay", body, "/groups/"+idutil.String(groupID))
}

func (n *NextPayerNotifier) nameOf(ctx context.Context, userID pgtype.UUID) string {
	if p, err := n.q.GetProfileByID(ctx, userID); err == nil {
		return p.DisplayName
	}
	return "Someone"
}
