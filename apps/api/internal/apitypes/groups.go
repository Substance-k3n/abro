package apitypes

import (
	"strings"
	"time"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

var validGroupTypes = map[string]bool{
	"FRIENDS": true, "TRIP": true, "HOUSEHOLD": true, "FAMILY": true, "TEAM": true, "OTHER": true,
}

var validGroupMemberRoles = map[string]bool{"ADMIN": true, "MEMBER": true}

// CreateGroupInput mirrors packages/types' createGroupSchema.
type CreateGroupInput struct {
	Name          string   `json:"name"`
	Type          *string  `json:"type"`
	Currency      *string  `json:"currency"`
	Description   *string  `json:"description"`
	SimplifyDebts *bool    `json:"simplifyDebts"`
	MemberIDs     []string `json:"memberIds"`
}

func (in *CreateGroupInput) Validate() error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 80 {
		return httpx.BadRequest("VALIDATION_ERROR", "name must be 1-80 characters")
	}
	if in.Type != nil && !validGroupTypes[*in.Type] {
		return httpx.BadRequest("VALIDATION_ERROR", "invalid group type")
	}
	if in.Currency != nil && len(*in.Currency) != 3 {
		return httpx.BadRequest("VALIDATION_ERROR", "currency must be a 3-letter code")
	}
	if in.Description != nil && len(*in.Description) > 280 {
		return httpx.BadRequest("VALIDATION_ERROR", "description must be at most 280 characters")
	}
	if len(in.MemberIDs) > 200 {
		return httpx.BadRequest("VALIDATION_ERROR", "memberIds must have at most 200 entries")
	}
	return nil
}

// UpdateGroupInput mirrors packages/types' updateGroupSchema.
type UpdateGroupInput struct {
	Name          *string `json:"name"`
	Type          *string `json:"type"`
	Currency      *string `json:"currency"`
	Description   *string `json:"description"`
	SimplifyDebts *bool   `json:"simplifyDebts"`
	AutoRemind    *bool   `json:"autoRemind"`
}

func (in *UpdateGroupInput) Validate() error {
	if in.Name != nil {
		trimmed := strings.TrimSpace(*in.Name)
		if trimmed == "" || len(trimmed) > 80 {
			return httpx.BadRequest("VALIDATION_ERROR", "name must be 1-80 characters")
		}
		in.Name = &trimmed
	}
	if in.Type != nil && !validGroupTypes[*in.Type] {
		return httpx.BadRequest("VALIDATION_ERROR", "invalid group type")
	}
	if in.Currency != nil && len(*in.Currency) != 3 {
		return httpx.BadRequest("VALIDATION_ERROR", "currency must be a 3-letter code")
	}
	if in.Description != nil && len(*in.Description) > 280 {
		return httpx.BadRequest("VALIDATION_ERROR", "description must be at most 280 characters")
	}
	return nil
}

type AddGroupMemberInput struct {
	UserID string `json:"userId"`
}

func (in *AddGroupMemberInput) Validate() error {
	if strings.TrimSpace(in.UserID) == "" {
		return httpx.BadRequest("VALIDATION_ERROR", "userId is required")
	}
	return nil
}

type UpdateGroupMemberRoleInput struct {
	Role string `json:"role"`
}

func (in *UpdateGroupMemberRoleInput) Validate() error {
	if !validGroupMemberRoles[in.Role] {
		return httpx.BadRequest("VALIDATION_ERROR", "invalid role")
	}
	return nil
}

type GroupMember struct {
	ID       string      `json:"id"`
	UserID   string      `json:"userId"`
	Role     string      `json:"role"`
	Status   string      `json:"status"`
	JoinedAt time.Time   `json:"joinedAt"`
	User     AuthProfile `json:"user"`
}

type AuthGroup struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Type          string  `json:"type"`
	Currency      string  `json:"currency"`
	Description   *string `json:"description"`
	PhotoURL      *string `json:"photoUrl"`
	SimplifyDebts bool    `json:"simplifyDebts"`
	// AutoRemind: the daily job reminds members whose debt to the group
	// is overdue (ADR-023). Admins switch it.
	AutoRemind  bool          `json:"autoRemind"`
	CreatedByID string        `json:"createdById"`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
	Members     []GroupMember `json:"members"`
}

// GroupListItem is GET /groups/'s element shape: an AuthGroup (members
// still always empty here, same as before) with two list-only summary
// fields flattened alongside it, so existing clients reading AuthGroup's
// fields are unaffected.
type GroupListItem struct {
	AuthGroup
	MemberCount    int       `json:"memberCount"`
	LastActivityAt time.Time `json:"lastActivityAt"`
}

type GroupInvite struct {
	Group     AuthGroup `json:"group"`
	InvitedAt time.Time `json:"invitedAt"`
}

type GroupMembershipResult struct {
	ID      string `json:"id"`
	GroupID string `json:"groupId"`
	UserID  string `json:"userId"`
	Role    string `json:"role"`
	Status  string `json:"status"`
}

// PaymentReminder is one payment reminder a group member got (roadmap
// P6): POST /groups/{id}/members/{userId}/remind returns the new one,
// GET /groups/{id}/reminders the latest per member. NextAllowedAt is
// when that member can be reminded in this group again. An automatic
// reminder from the daily job (ADR-023) has no sender.
type PaymentReminder struct {
	GroupID       string    `json:"groupId"`
	RecipientID   string    `json:"recipientId"`
	SenderID      *string   `json:"senderId"`
	Automatic     bool      `json:"automatic"`
	RemindedAt    time.Time `json:"remindedAt"`
	NextAllowedAt time.Time `json:"nextAllowedAt"`
}

// FriendReminder is the latest reminder a friend got for what they owe
// you (ADR-023): POST /friends/{id}/remind returns the new one, GET
// /friends/{id}/reminder the latest (or null). NextAllowedAt is when you
// can remind them again.
type FriendReminder struct {
	FriendID      string    `json:"friendId"`
	Automatic     bool      `json:"automatic"`
	RemindedAt    time.Time `json:"remindedAt"`
	NextAllowedAt time.Time `json:"nextAllowedAt"`
}

// ReminderSettings is GET/PATCH /reminders/settings (ADR-023).
type ReminderSettings struct {
	AutoRemindFriends bool `json:"autoRemindFriends"`
}
