// Package balances implements pairwise/group balance derivation and debt
// simplification -- ported from apps/api/src/modules/balances. Always
// computed live from Expense+ExpenseParticipant -- never stored, per
// ABRO_PRD.md §8.2/§16/§45.
package balances

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
)

type Service struct {
	q       db.Querier
	friends *friends.Service
	groups  *groups.Service
}

func NewService(q db.Querier, friendsSvc *friends.Service, groupsSvc *groups.Service) *Service {
	return &Service{q: q, friends: friendsSvc, groups: groupsSvc}
}

// GetPairwiseBalance computes the net balance between exactly two users,
// scoped to personal expenses (groupID zero-value) or one specific
// group's expenses. Positive => userA owes userB. Negative => userB owes
// userA. Works identically for every splitType, including SETTLEMENT: a
// settlement Expense nets against prior debts with no special-casing.
func (s *Service) GetPairwiseBalance(ctx context.Context, userA, userB, groupID pgtype.UUID) (money.MinorUnits, error) {
	var entries []money.LedgerEntry

	if groupID.Valid {
		participants, err := s.q.GetPairwiseParticipantsInGroup(ctx, db.GetPairwiseParticipantsInGroupParams{
			UserB: userB, UserA: userA, GroupID: groupID,
		})
		if err != nil {
			return 0, err
		}
		for _, p := range participants {
			entries = append(entries, money.LedgerEntry{OwedByA: p.UserID == userA, Amount: p.Amount})
		}
	} else {
		participants, err := s.q.GetPairwiseParticipantsPersonal(ctx, db.GetPairwiseParticipantsPersonalParams{
			UserB: userB, UserA: userA,
		})
		if err != nil {
			return 0, err
		}
		for _, p := range participants {
			entries = append(entries, money.LedgerEntry{OwedByA: p.UserID == userA, Amount: p.Amount})
		}
	}

	return money.NetBalance(entries), nil
}

// GetGroupSummary computes each user's net position within a group: what
// they paid across the group's expenses minus what they owe as a
// participant. Positive => the group owes them; negative => they owe the
// group. Includes anyone with paid/owed activity, even a member who has
// since left, so a departed member's outstanding balance is never
// silently hidden (ABRO_PRD.md §20).
func (s *Service) GetGroupSummary(ctx context.Context, groupID pgtype.UUID) ([]money.NetPosition, error) {
	paid, err := s.q.GetGroupPaidSums(ctx, groupID)
	if err != nil {
		return nil, err
	}
	owed, err := s.q.GetGroupOwedSums(ctx, groupID)
	if err != nil {
		return nil, err
	}

	paidByUser := map[pgtype.UUID]money.MinorUnits{}
	for _, p := range paid {
		paidByUser[p.PaidByID] = p.Total
	}
	owedByUser := map[pgtype.UUID]money.MinorUnits{}
	for _, o := range owed {
		owedByUser[o.UserID] = o.Total
	}

	userIDs := map[pgtype.UUID]bool{}
	for id := range paidByUser {
		userIDs[id] = true
	}
	for id := range owedByUser {
		userIDs[id] = true
	}

	summary := make([]money.NetPosition, 0, len(userIDs))
	for id := range userIDs {
		summary = append(summary, money.NetPosition{
			UserID:     idutil.String(id),
			NetBalance: paidByUser[id] - owedByUser[id],
		})
	}
	return summary, nil
}

// GetSimplifiedGroupDebts is ABRO_PRD.md §18's pairwise minimum-transaction
// settlement plan for a group, derived from GetGroupSummary's net
// positions. A display-time projection, never persisted.
func (s *Service) GetSimplifiedGroupDebts(ctx context.Context, groupID pgtype.UUID) ([]money.SimplifiedTransaction, error) {
	summary, err := s.GetGroupSummary(ctx, groupID)
	if err != nil {
		return nil, err
	}
	return money.SimplifyDebts(summary), nil
}

// FriendNetBalance and GroupNetBalance are GetSummary's per-entity
// results, pgtype.UUID rather than apitypes' wire strings -- the router
// does that conversion, same division of labor as everywhere else in
// this package.
type FriendNetBalance struct {
	FriendID   pgtype.UUID
	NetBalance money.MinorUnits
}

type GroupNetBalance struct {
	GroupID    pgtype.UUID
	NetBalance money.MinorUnits
}

// GetSummary computes every one of userID's friend and group balances in
// one call -- Phase 8 (docs/WIRING_PLAN.md) added this because no
// existing endpoint could back Home/Balances Overview without an N+1
// fan-out from the browser (one GetPairwiseBalance/GetGroupSummary call
// per friendship/membership, same as the existing per-entity endpoints
// already do individually -- this just loops over them here instead of
// in N separate HTTP round trips).
func (s *Service) GetSummary(ctx context.Context, userID pgtype.UUID) ([]FriendNetBalance, []GroupNetBalance, error) {
	friendRows, err := s.friends.List(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	friendBalances := make([]FriendNetBalance, 0, len(friendRows))
	for _, row := range friendRows {
		otherID := row.FriendID
		if row.UserID != userID {
			otherID = row.UserID
		}
		balance, err := s.GetPairwiseBalance(ctx, userID, otherID, pgtype.UUID{})
		if err != nil {
			return nil, nil, err
		}
		friendBalances = append(friendBalances, FriendNetBalance{FriendID: otherID, NetBalance: balance})
	}

	myGroups, err := s.groups.ListMine(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	myIDString := idutil.String(userID)
	groupBalances := make([]GroupNetBalance, 0, len(myGroups))
	for _, g := range myGroups {
		summary, err := s.GetGroupSummary(ctx, g.ID)
		if err != nil {
			return nil, nil, err
		}
		var mine money.MinorUnits
		for _, entry := range summary {
			if entry.UserID == myIDString {
				mine = entry.NetBalance
				break
			}
		}
		groupBalances = append(groupBalances, GroupNetBalance{GroupID: g.ID, NetBalance: mine})
	}

	return friendBalances, groupBalances, nil
}
