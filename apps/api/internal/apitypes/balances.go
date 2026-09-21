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
