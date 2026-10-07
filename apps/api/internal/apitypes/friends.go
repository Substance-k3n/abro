package apitypes

import (
	"strings"
	"time"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

type FriendListItem struct {
	FriendshipID string      `json:"friendshipId"`
	Since        time.Time   `json:"since"`
	Friend       AuthProfile `json:"friend"`
}

type IncomingFriendRequestItem struct {
	FriendshipID string      `json:"friendshipId"`
	SentAt       time.Time   `json:"sentAt"`
	From         AuthProfile `json:"from"`
}

type FriendRequestResult struct {
	FriendshipID string `json:"friendshipId"`
	Status       string `json:"status"`
}

// SearchFriendInput mirrors packages/types' searchFriendSchema.
type SearchFriendInput struct {
	Query string
}

func (in *SearchFriendInput) Validate() error {
	in.Query = strings.TrimSpace(in.Query)
	// Search-as-you-type on usernames starts at the first letter ("n"
	// lists handles starting with n, "na" narrows it); results are
	// capped server-side, so one letter can't list the directory.
	if len(strings.TrimPrefix(in.Query, "@")) < 1 {
		return httpx.BadRequest("VALIDATION_ERROR", "query must be at least 1 character")
	}
	return nil
}

// SendFriendRequestInput mirrors packages/types' sendFriendRequestSchema.
type SendFriendRequestInput struct {
	FriendID string `json:"friendId"`
}

func (in *SendFriendRequestInput) Validate() error {
	if strings.TrimSpace(in.FriendID) == "" {
		return httpx.BadRequest("VALIDATION_ERROR", "friendId is required")
	}
	return nil
}
