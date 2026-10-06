package apitypes

type FriendBalance struct {
	FriendID   string `json:"friendId"`
	NetBalance string `json:"netBalance"`
}

type GroupBalanceEntry struct {
	UserID     string `json:"userId"`
	NetBalance string `json:"netBalance"`
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
