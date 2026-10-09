package apitypes

import "time"

type FriendBalance struct {
	FriendID   string `json:"friendId"`
	NetBalance string `json:"netBalance"`
	// OwingSince is when the oldest unpaid part of the balance was added,
	// whichever way it runs (ADR-023). Only GET /balances/friends/{id}
	// fills it; absent when settled up, and in the summary.
	OwingSince *time.Time `json:"owingSince,omitempty"`
}

type GroupBalanceEntry struct {
	UserID     string `json:"userId"`
	NetBalance string `json:"netBalance"`
	// OwingSince is set for a member who owes the group: when the oldest
	// unpaid part of it was added (ADR-023). Every member sees it.
	OwingSince *time.Time `json:"owingSince"`
}

type SimplifiedTransaction struct {
	FromUserID string `json:"fromUserId"`
	ToUserID   string `json:"toUserId"`
	Amount     string `json:"amount"`
}

// GroupBalance is one group's worth of GroupBalanceEntry collapsed down
// to just the current user's own net position in it -- distinct from
// GroupBalanceEntry (one row per *member*, within one group).
type GroupBalance struct {
	GroupID    string `json:"groupId"`
	NetBalance string `json:"netBalance"`
}

// BalancesSummary is GET /balances/summary's response: every friend's
// and every group's net balance for the current user, in one call --
// Phase 8 (docs/WIRING_PLAN.md, DASH-01/DASH-06) needed this and no
// aggregate endpoint existed; the alternative was the frontend doing an
// N+1 fan-out of GET /balances/friends/{id} and GET /balances/groups/
// {id}, one per friendship/membership, which this avoids.
type BalancesSummary struct {
	Friends []FriendBalance `json:"friends"`
	Groups  []GroupBalance  `json:"groups"`
}
