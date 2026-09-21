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
	if len(in.Query) < 3 {
		return httpx.BadRequest("VALIDATION_ERROR", "query must be at least 3 characters")
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
