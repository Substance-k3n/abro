// Package groups implements create/list/detail/update, members, and
// invites -- ported from apps/api/src/modules/groups.
package groups

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

type Service struct {
	q             db.Querier
	friends       *friends.Service
	notifications *notifications.Service
}

func NewService(q db.Querier, friendsSvc *friends.Service, notificationsSvc *notifications.Service) *Service {
	return &Service{q: q, friends: friendsSvc, notifications: notificationsSvc}
}

// Group is a Group row plus its members (each with the nested Profile),
// the same shape the original Prisma `include: { members: { include: {
// user: true } } }` query produced.
type Group struct {
	db.Group
	Members []db.ListGroupMembersWithProfilesRow
}

func (s *Service) Create(ctx context.Context, userID pgtype.UUID, in apitypes.CreateGroupInput) (Group, error) {
	// Deduped once and reused everywhere below -- a duplicate memberId would
	// otherwise both re-check the same friendship redundantly and (worse)
	// hit group_members' (group_id, user_id) unique constraint.
	memberIDs, err := dedupeParsed(in.MemberIDs)
	if err != nil {
		return Group{}, err
	}

	for _, memberID := range memberIDs {
		ok, err := s.friends.AreFriends(ctx, userID, memberID)
		if err != nil {
			return Group{}, err
		}
		if !ok {
			return Group{}, httpx.Conflict("NOT_FRIENDS", fmt.Sprintf("User %s must be a friend before joining a group.", idutil.String(memberID)))
		}
	}

	groupType := "OTHER"
	if in.Type != nil {
		groupType = *in.Type
	}
	currency := "ETB"
	if in.Currency != nil {
		currency = *in.Currency
	}
	simplifyDebts := true
	if in.SimplifyDebts != nil {
		simplifyDebts = *in.SimplifyDebts
	}

	group, err := s.q.CreateGroup(ctx, db.CreateGroupParams{
		Name:          in.Name,
		Type:          db.GroupType(groupType),
		Currency:      currency,
		Description:   optionalText(in.Description),
		SimplifyDebts: simplifyDebts,
		CreatedByID:   userID,
	})
	if err != nil {
		return Group{}, err
	}

	if _, err := s.q.CreateGroupMember(ctx, db.CreateGroupMemberParams{
		GroupID: group.ID, UserID: userID, Role: db.GroupMemberRoleADMIN, Status: db.GroupMemberStatusACTIVE,
	}); err != nil {
		return Group{}, err
	}
	for _, memberID := range memberIDs {
		if _, err := s.q.CreateGroupMember(ctx, db.CreateGroupMemberParams{
			GroupID: group.ID, UserID: memberID, Role: db.GroupMemberRoleMEMBER, Status: db.GroupMemberStatusINVITED,
		}); err != nil {
			return Group{}, err
		}
	}

	if err := s.notifications.NotifyMany(ctx, memberIDs, notifications.TypeGroupInvitation,
		"Group invitation", fmt.Sprintf("You've been invited to join %q.", group.Name)); err != nil {
		return Group{}, err
	}

	return s.loadGroup(ctx, group)
}

func (s *Service) ListMine(ctx context.Context, userID pgtype.UUID) ([]db.Group, error) {
	rows, err := s.q.ListMyActiveGroups(ctx, userID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []db.Group{}
	}
	return rows, nil
}

// ListMineWithStats is ListMine plus each group's ACTIVE member count and
// last-activity timestamp -- backs GET /groups/ (DASH-05's cards). Kept
// separate from ListMine, whose plain rows other callers (balances'
// GetSummary) use without needing the extra per-group subqueries.
func (s *Service) ListMineWithStats(ctx context.Context, userID pgtype.UUID) ([]db.ListMyActiveGroupsWithStatsRow, error) {
	rows, err := s.q.ListMyActiveGroupsWithStats(ctx, userID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []db.ListMyActiveGroupsWithStatsRow{}
	}
	return rows, nil
}

func (s *Service) ListMyInvites(ctx context.Context, userID pgtype.UUID) ([]db.ListMyInvitesRow, error) {
	rows, err := s.q.ListMyInvites(ctx, userID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []db.ListMyInvitesRow{}
	}
	return rows, nil
}

func (s *Service) FindByID(ctx context.Context, userID, groupID pgtype.UUID) (Group, error) {
	if _, err := s.RequireActiveMembership(ctx, groupID, userID); err != nil {
		return Group{}, err
	}

	group, err := s.q.GetGroupByID(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Group{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	if err != nil {
		return Group{}, err
	}
	return s.loadGroup(ctx, group)
}

func (s *Service) Update(ctx context.Context, userID, groupID pgtype.UUID, in apitypes.UpdateGroupInput) (db.Group, error) {
	if _, err := s.requireActiveAdmin(ctx, groupID, userID); err != nil {
		return db.Group{}, err
	}
	before, err := s.q.GetGroupByID(ctx, groupID)
	if err != nil {
		return db.Group{}, err
	}

	params := db.UpdateGroupParams{ID: groupID, Name: optionalText(in.Name), Currency: optionalText(in.Currency), Description: optionalText(in.Description)}
	if in.Type != nil {
		params.Type = db.NullGroupType{GroupType: db.GroupType(*in.Type), Valid: true}
	}
	if in.SimplifyDebts != nil {
		params.SimplifyDebts = pgtype.Bool{Bool: *in.SimplifyDebts, Valid: true}
	}

	updated, err := s.q.UpdateGroup(ctx, params)
	if err != nil {
		return db.Group{}, err
	}

	// ABRO_PRD.md §34 DEBT_SIMPLIFICATION_CHANGE (Assumption: the only
	// concrete trigger for this event, since simplification itself is a
	// computed view, not stored data).
	if in.SimplifyDebts != nil && updated.SimplifyDebts != before.SimplifyDebts {
		others, err := s.q.ListActiveMemberIDsExcept(ctx, db.ListActiveMemberIDsExceptParams{GroupID: groupID, UserID: userID})
		if err != nil {
			return db.Group{}, err
		}
		state := "off"
		if updated.SimplifyDebts {
			state = "on"
		}
		if err := s.notifications.NotifyMany(ctx, others, notifications.TypeDebtSimplificationChange,
			"Debt simplification setting changed", fmt.Sprintf("Debt simplification is now %s for %q.", state, updated.Name)); err != nil {
			return db.Group{}, err
		}
	}

	return updated, nil
}

func (s *Service) AddMember(ctx context.Context, actorID, groupID, targetUserID pgtype.UUID) (db.GroupMember, error) {
	group, err := s.requireGroup(ctx, groupID)
	if err != nil {
		return db.GroupMember{}, err
	}
	if _, err := s.requireActiveAdmin(ctx, groupID, actorID); err != nil {
		return db.GroupMember{}, err
	}

	ok, err := s.friends.AreFriends(ctx, actorID, targetUserID)
	if err != nil {
		return db.GroupMember{}, err
	}
	if !ok {
		return db.GroupMember{}, httpx.Conflict("NOT_FRIENDS", "Can only add an existing friend to a group.")
	}

	existing, err := s.q.GetGroupMember(ctx, db.GetGroupMemberParams{GroupID: groupID, UserID: targetUserID})
	var membership db.GroupMember
	switch {
	case err == nil && existing.Status != db.GroupMemberStatusLEFT:
		return db.GroupMember{}, httpx.Conflict("ALREADY_MEMBER", "Already a member or invited.")
	case err == nil:
		membership, err = s.q.ReinviteGroupMember(ctx, existing.ID)
		if err != nil {
			return db.GroupMember{}, err
		}
	case errors.Is(err, pgx.ErrNoRows):
		membership, err = s.q.CreateGroupMember(ctx, db.CreateGroupMemberParams{
			GroupID: groupID, UserID: targetUserID, Role: db.GroupMemberRoleMEMBER, Status: db.GroupMemberStatusINVITED,
		})
		if err != nil {
			return db.GroupMember{}, err
		}
	default:
		return db.GroupMember{}, err
	}

	if _, err := s.notifications.Notify(ctx, targetUserID, notifications.TypeGroupInvitation,
		"Group invitation", fmt.Sprintf("You've been invited to join %q.", group.Name)); err != nil {
		return db.GroupMember{}, err
	}

	return membership, nil
}

func (s *Service) AcceptInvite(ctx context.Context, userID, groupID pgtype.UUID) (db.GroupMember, error) {
	membership, err := s.requireMembership(ctx, groupID, userID)
	if err != nil {
		return db.GroupMember{}, err
	}
	if membership.Status != db.GroupMemberStatusINVITED {
		return db.GroupMember{}, httpx.Conflict("NOT_INVITED", "No pending invite for this group.")
	}

	updated, err := s.q.UpdateGroupMemberStatus(ctx, db.UpdateGroupMemberStatusParams{ID: membership.ID, Status: db.GroupMemberStatusACTIVE})
	if err != nil {
		return db.GroupMember{}, err
	}

	if err := s.notifyOtherActiveMembers(ctx, groupID, userID, "joined the group"); err != nil {
		return db.GroupMember{}, err
	}
	return updated, nil
}

func (s *Service) RemoveMember(ctx context.Context, actorID, groupID, targetUserID pgtype.UUID) error {
	target, err := s.requireMembership(ctx, groupID, targetUserID)
	if err != nil {
		return err
	}

	if actorID != targetUserID {
		if _, err := s.requireActiveAdmin(ctx, groupID, actorID); err != nil {
			return err
		}
	}

	if target.Status == db.GroupMemberStatusACTIVE && target.Role == db.GroupMemberRoleADMIN {
		remaining, err := s.q.CountActiveAdminsExcept(ctx, db.CountActiveAdminsExceptParams{GroupID: groupID, UserID: targetUserID})
		if err != nil {
			return err
		}
		if remaining == 0 {
			return httpx.Conflict("LAST_ADMIN", "Promote another member to admin before removing the last one.")
		}
	}

	if _, err := s.q.UpdateGroupMemberStatus(ctx, db.UpdateGroupMemberStatusParams{ID: target.ID, Status: db.GroupMemberStatusLEFT}); err != nil {
		return err
	}
	return s.notifyOtherActiveMembers(ctx, groupID, targetUserID, "left the group")
}

func (s *Service) UpdateMemberRole(ctx context.Context, actorID, groupID, targetUserID pgtype.UUID, role string) (db.GroupMember, error) {
	if _, err := s.requireActiveAdmin(ctx, groupID, actorID); err != nil {
		return db.GroupMember{}, err
	}
	target, err := s.requireMembership(ctx, groupID, targetUserID)
	if err != nil {
		return db.GroupMember{}, err
	}

	if target.Status != db.GroupMemberStatusACTIVE {
		return db.GroupMember{}, httpx.Conflict("NOT_ACTIVE_MEMBER", "Member is not active.")
	}

	if target.Role == db.GroupMemberRoleADMIN && role == string(db.GroupMemberRoleMEMBER) {
		remaining, err := s.q.CountActiveAdminsExcept(ctx, db.CountActiveAdminsExceptParams{GroupID: groupID, UserID: targetUserID})
		if err != nil {
			return db.GroupMember{}, err
		}
		if remaining == 0 {
			return db.GroupMember{}, httpx.Conflict("LAST_ADMIN", "Promote another member to admin before demoting the last one.")
		}
	}

	updated, err := s.q.UpdateGroupMemberRole(ctx, db.UpdateGroupMemberRoleParams{ID: target.ID, Role: db.GroupMemberRole(role)})
	if err != nil {
		return db.GroupMember{}, err
	}

	// ABRO_PRD.md §34 GROUP_MEMBERSHIP_CHANGE (Assumption: only the affected
	// member is notified of their own role change, not the whole group).
	if targetUserID != actorID {
		group, err := s.q.GetGroupByID(ctx, groupID)
		if err != nil {
			return db.GroupMember{}, err
		}
		if _, err := s.notifications.Notify(ctx, targetUserID, notifications.TypeGroupMembershipChange,
			"Role changed", fmt.Sprintf("Your role in %q is now %s.", group.Name, role)); err != nil {
			return db.GroupMember{}, err
		}
	}

	return updated, nil
}

// RequireActiveMembership is used by the expenses module to validate
// paidBy/participants are active group members.
func (s *Service) RequireActiveMembership(ctx context.Context, groupID, userID pgtype.UUID) (db.GroupMember, error) {
	membership, err := s.q.GetGroupMember(ctx, db.GetGroupMemberParams{GroupID: groupID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && membership.Status != db.GroupMemberStatusACTIVE) {
		return db.GroupMember{}, httpx.Forbidden("NOT_GROUP_MEMBER", "Not an active member of this group.")
	}
	if err != nil {
		return db.GroupMember{}, err
	}
	return membership, nil
}

func (s *Service) requireActiveAdmin(ctx context.Context, groupID, userID pgtype.UUID) (db.GroupMember, error) {
	membership, err := s.RequireActiveMembership(ctx, groupID, userID)
	if err != nil {
		return db.GroupMember{}, err
	}
	if membership.Role != db.GroupMemberRoleADMIN {
		return db.GroupMember{}, httpx.Forbidden("NOT_GROUP_ADMIN", "Only a group admin can do this.")
	}
	return membership, nil
}

func (s *Service) requireGroup(ctx context.Context, groupID pgtype.UUID) (db.Group, error) {
	group, err := s.q.GetGroupByID(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Group{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	return group, err
}

func (s *Service) requireMembership(ctx context.Context, groupID, userID pgtype.UUID) (db.GroupMember, error) {
	membership, err := s.q.GetGroupMember(ctx, db.GetGroupMemberParams{GroupID: groupID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.GroupMember{}, httpx.NotFound("MEMBERSHIP_NOT_FOUND", "No membership record found.")
	}
	return membership, err
}

// notifyOtherActiveMembers implements ABRO_PRD.md §34 GROUP_MEMBERSHIP_CHANGE:
// tells everyone still active except the member who joined/left.
func (s *Service) notifyOtherActiveMembers(ctx context.Context, groupID, subjectUserID pgtype.UUID, verb string) error {
	group, err := s.q.GetGroupByID(ctx, groupID)
	if err != nil {
		return err
	}
	subject, err := s.q.GetProfileByID(ctx, subjectUserID)
	if err != nil {
		return err
	}
	others, err := s.q.ListActiveMemberIDsExcept(ctx, db.ListActiveMemberIDsExceptParams{GroupID: groupID, UserID: subjectUserID})
	if err != nil {
		return err
	}

	return s.notifications.NotifyMany(ctx, others, notifications.TypeGroupMembershipChange,
		"Group membership changed", fmt.Sprintf("%s %s in %q.", subject.DisplayName, verb, group.Name))
}

func (s *Service) loadGroup(ctx context.Context, group db.Group) (Group, error) {
	members, err := s.q.ListGroupMembersWithProfiles(ctx, group.ID)
	if err != nil {
		return Group{}, err
	}
	if members == nil {
		members = []db.ListGroupMembersWithProfilesRow{}
	}
	return Group{Group: group, Members: members}, nil
}

func optionalText(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}

func dedupeParsed(rawIDs []string) ([]pgtype.UUID, error) {
	seen := make(map[pgtype.UUID]bool, len(rawIDs))
	out := make([]pgtype.UUID, 0, len(rawIDs))
	for _, raw := range rawIDs {
		id, err := idutil.Parse(raw)
		if err != nil {
			return nil, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
		}
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out, nil
}
