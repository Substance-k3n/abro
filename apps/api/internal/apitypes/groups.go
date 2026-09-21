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
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Type          string        `json:"type"`
	Currency      string        `json:"currency"`
	Description   *string       `json:"description"`
	SimplifyDebts bool          `json:"simplifyDebts"`
	CreatedByID   string        `json:"createdById"`
	CreatedAt     time.Time     `json:"createdAt"`
	UpdatedAt     time.Time     `json:"updatedAt"`
	Members       []GroupMember `json:"members"`
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
