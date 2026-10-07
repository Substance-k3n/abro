package groups_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

func TestResendInvite(t *testing.T) {
	ctx := context.Background()

	invitations := func(t *testing.T, e env, user db.Profile) int {
		t.Helper()
		list, err := e.notifySvc.List(ctx, user.ID, false, 100, 0)
		require.NoError(t, err)
		n := 0
		for _, item := range list {
			if item.Type == string(notifications.TypeGroupInvitation) {
				n++
			}
		}
		return n
	}

	// setupInvite makes an active group with a pending invite to a friend,
	// with the invite backdated by age.
	setupInvite := func(t *testing.T, e env, age time.Duration) (db.Profile, db.Profile, db.Profile, groups.Group) {
		t.Helper()
		owner := e.makeProfile(t, "Owner")
		member := e.makeProfile(t, "Member")
		invited := e.makeProfile(t, "Invited")
		group := activeGroup(t, e, owner, member)
		e.makeFriends(t, owner.ID, invited.ID)
		_, err := e.svc.AddMember(ctx, owner.ID, group.ID, invited.ID)
		require.NoError(t, err)
		_, err = e.pool.Exec(ctx, `UPDATE group_members SET joined_at = now() - $3::interval
			WHERE group_id = $1 AND user_id = $2`, group.ID, invited.ID, age.String())
		require.NoError(t, err)
		return owner, member, invited, group
	}

	t.Run("an admin resends an invite older than 24 hours; it's fresh again", func(t *testing.T) {
		e := setup(t)
		owner, _, invited, group := setupInvite(t, e, 25*time.Hour)
		require.Equal(t, 1, invitations(t, e, invited))

		membership, err := e.svc.ResendInvite(ctx, owner.ID, group.ID, invited.ID)
		require.NoError(t, err)
		assert.Equal(t, db.GroupMemberStatusINVITED, membership.Status)
		assert.WithinDuration(t, time.Now(), membership.JoinedAt.Time, time.Minute)
		assert.Equal(t, 2, invitations(t, e, invited))

		// The invitee still sees one invite, now dated as new.
		invites, err := e.svc.ListMyInvites(ctx, invited.ID)
		require.NoError(t, err)
		require.Len(t, invites, 1)
		assert.WithinDuration(t, time.Now(), invites[0].InvitedAt.Time, time.Minute)

		// And can't be resent again straight away.
		_, err = e.svc.ResendInvite(ctx, owner.ID, group.ID, invited.ID)
		assertAPIError(t, err, "INVITE_RESENT_RECENTLY")
	})

	t.Run("too soon after the invite: 429 with when it's allowed", func(t *testing.T) {
		e := setup(t)
		owner, _, invited, group := setupInvite(t, e, 2*time.Hour)

		_, err := e.svc.ResendInvite(ctx, owner.ID, group.ID, invited.ID)
		var apiErr *httpx.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, "INVITE_RESENT_RECENTLY", apiErr.Code)
		assert.Equal(t, http.StatusTooManyRequests, apiErr.Status)
		details, ok := apiErr.Details.(map[string]time.Time)
		require.True(t, ok)
		assert.WithinDuration(t, time.Now().Add(22*time.Hour), details["nextAllowedAt"], time.Minute)
		assert.Equal(t, 1, invitations(t, e, invited))
	})

	t.Run("admins only; only pending invites", func(t *testing.T) {
		e := setup(t)
		owner, member, invited, group := setupInvite(t, e, 25*time.Hour)

		_, err := e.svc.ResendInvite(ctx, member.ID, group.ID, invited.ID)
		assertAPIError(t, err, "NOT_GROUP_ADMIN")

		_, err = e.svc.ResendInvite(ctx, owner.ID, group.ID, member.ID)
		assertAPIError(t, err, "NOT_INVITED")

		// A cancelled invite (RemoveMember -> LEFT) can't be resent.
		require.NoError(t, e.svc.RemoveMember(ctx, owner.ID, group.ID, invited.ID))
		_, err = e.svc.ResendInvite(ctx, owner.ID, group.ID, invited.ID)
		assertAPIError(t, err, "NOT_INVITED")
		invites, err := e.svc.ListMyInvites(ctx, invited.ID)
		require.NoError(t, err)
		assert.Empty(t, invites)

		stranger := e.makeProfile(t, "Stranger")
		_, err = e.svc.ResendInvite(ctx, owner.ID, group.ID, stranger.ID)
		assertAPIError(t, err, "MEMBERSHIP_NOT_FOUND")
	})
}
