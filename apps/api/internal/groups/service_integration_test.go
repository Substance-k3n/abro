package groups_test

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

type env struct {
	svc         *groups.Service
	notifySvc   *notifications.Service
	pool        *pgxpool.Pool
	makeProfile func(t *testing.T, label string) db.Profile
	makeFriends func(t *testing.T, a, b pgtype.UUID)
	trackGroup  func(id pgtype.UUID)
}

func setup(t *testing.T) env {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres")
	require.NoError(t, pool.Ping(context.Background()))
	t.Cleanup(pool.Close)

	queries := db.New(pool)
	friendsSvc := friends.NewService(queries)
	notifySvc := notifications.NewService(queries)
	svc := groups.NewService(queries, friendsSvc, notifySvc)

	var createdProfiles []pgtype.UUID
	var createdGroups []pgtype.UUID
	t.Cleanup(func() {
		ctx := context.Background()
		for _, g := range createdGroups {
			pool.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1`, g)
			pool.Exec(ctx, `DELETE FROM groups WHERE id = $1`, g)
		}
		for _, p := range createdProfiles {
			pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1`, p)
			pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = $1`, p)
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, p)
		}
	})

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-groups-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email: pgtype.Text{String: email, Valid: true}, DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		createdProfiles = append(createdProfiles, profile.ID)
		return profile
	}

	makeFriendsFn := func(t *testing.T, a, b pgtype.UUID) {
		t.Helper()
		_, err := pool.Exec(context.Background(),
			`INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'ACCEPTED')`, a, b)
		require.NoError(t, err)
	}

	return env{
		svc: svc, notifySvc: notifySvc, pool: pool,
		makeProfile: makeProfile, makeFriends: makeFriendsFn,
		trackGroup: func(id pgtype.UUID) { createdGroups = append(createdGroups, id) },
	}
}

func TestService(t *testing.T) {
	t.Run("creates a group, making the creator the sole ACTIVE admin", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")

		simplify := true
		group, err := e.svc.Create(context.Background(), owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)

		require.Len(t, group.Members, 1)
		assert.Equal(t, owner.ID, group.Members[0].UserID)
		assert.Equal(t, db.GroupMemberRoleADMIN, group.Members[0].Role)
		assert.Equal(t, db.GroupMemberStatusACTIVE, group.Members[0].Status)
	})

	t.Run("rejects a non-friend as an initial member on create", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		stranger := e.makeProfile(t, "Stranger")

		simplify := true
		_, err := e.svc.Create(context.Background(), owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(stranger.ID)},
		})
		assert.Error(t, err)
	})

	t.Run("adds a friend-only initial member as INVITED, who then accepts to become ACTIVE", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, owner.ID, friend.ID)
		ctx := context.Background()

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)

		var friendMember *db.ListGroupMembersWithProfilesRow
		for i := range group.Members {
			if group.Members[i].UserID == friend.ID {
				friendMember = &group.Members[i]
			}
		}
		require.NotNil(t, friendMember)
		assert.Equal(t, db.GroupMemberStatusINVITED, friendMember.Status)

		invites, err := e.svc.ListMyInvites(ctx, friend.ID)
		require.NoError(t, err)
		found := false
		for _, inv := range invites {
			if inv.ID == group.ID {
				found = true
			}
		}
		assert.True(t, found)

		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)
		membership, err := e.svc.RequireActiveMembership(ctx, group.ID, friend.ID)
		require.NoError(t, err)
		assert.Equal(t, db.GroupMemberStatusACTIVE, membership.Status)
	})

	t.Run("blocks addMember for a non-friend even by an admin", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		stranger := e.makeProfile(t, "Stranger")
		ctx := context.Background()

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify})
		require.NoError(t, err)
		e.trackGroup(group.ID)

		_, err = e.svc.AddMember(ctx, owner.ID, group.ID, stranger.ID)
		assert.Error(t, err)
	})

	t.Run("blocks a non-admin from updating the group", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, owner.ID, friend.ID)
		ctx := context.Background()

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)
		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)

		_, err = e.svc.Update(ctx, friend.ID, group.ID, apitypes.UpdateGroupInput{Name: strPtr("Renamed")})
		assert.Error(t, err)
	})

	t.Run("blocks removing the last active admin", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		ctx := context.Background()

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{Name: "Solo", Type: strPtr("OTHER"), Currency: strPtr("ETB"), SimplifyDebts: &simplify})
		require.NoError(t, err)
		e.trackGroup(group.ID)

		err = e.svc.RemoveMember(ctx, owner.ID, group.ID, owner.ID)
		assert.Error(t, err)
	})

	t.Run("blocks demoting the last active admin", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		ctx := context.Background()

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{Name: "Solo", Type: strPtr("OTHER"), Currency: strPtr("ETB"), SimplifyDebts: &simplify})
		require.NoError(t, err)
		e.trackGroup(group.ID)

		_, err = e.svc.UpdateMemberRole(ctx, owner.ID, group.ID, owner.ID, "MEMBER")
		assert.Error(t, err)
	})

	t.Run("allows removing an admin once a second admin exists; leaving is LEFT status not a row delete", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, owner.ID, friend.ID)
		ctx := context.Background()

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)
		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)
		_, err = e.svc.UpdateMemberRole(ctx, owner.ID, group.ID, friend.ID, "ADMIN")
		require.NoError(t, err)

		require.NoError(t, e.svc.RemoveMember(ctx, owner.ID, group.ID, owner.ID))

		var status string
		require.NoError(t, e.pool.QueryRow(ctx,
			`SELECT status FROM group_members WHERE group_id = $1 AND user_id = $2`, group.ID, owner.ID).Scan(&status))
		assert.Equal(t, "LEFT", status)

		_, err = e.svc.RequireActiveMembership(ctx, group.ID, owner.ID)
		assert.Error(t, err)

		stillListed, err := e.svc.ListMine(ctx, owner.ID)
		require.NoError(t, err)
		for _, g := range stillListed {
			assert.NotEqual(t, group.ID, g.ID)
		}
	})

	t.Run("re-inviting a member who left refreshes joinedAt", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, owner.ID, friend.ID)
		ctx := context.Background()

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)

		firstInvites, err := e.svc.ListMyInvites(ctx, friend.ID)
		require.NoError(t, err)
		require.Len(t, firstInvites, 1)
		firstInvitedAt := firstInvites[0].InvitedAt.Time

		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)
		require.NoError(t, e.svc.RemoveMember(ctx, friend.ID, group.ID, friend.ID))
		_, err = e.svc.AddMember(ctx, owner.ID, group.ID, friend.ID)
		require.NoError(t, err)

		secondInvites, err := e.svc.ListMyInvites(ctx, friend.ID)
		require.NoError(t, err)
		require.Len(t, secondInvites, 1)
		assert.True(t, secondInvites[0].InvitedAt.Time.After(firstInvitedAt))
	})

	t.Run("notifies invited members on create, and a re-invited member via addMember", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "NotifyOwner")
		friend := e.makeProfile(t, "NotifyFriend")
		e.makeFriends(t, owner.ID, friend.ID)
		ctx := context.Background()

		countInvitations := func(userID pgtype.UUID) int {
			list, err := e.notifySvc.List(ctx, userID, false, 100, 0)
			require.NoError(t, err)
			count := 0
			for _, n := range list {
				if n.Type == string(notifications.TypeGroupInvitation) {
					count++
				}
			}
			return count
		}

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Notify Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)

		assert.Equal(t, 1, countInvitations(friend.ID))
		assert.Equal(t, 0, countInvitations(owner.ID))

		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)
		require.NoError(t, e.svc.RemoveMember(ctx, friend.ID, group.ID, friend.ID))
		_, err = e.svc.AddMember(ctx, owner.ID, group.ID, friend.ID)
		require.NoError(t, err)

		assert.Equal(t, 2, countInvitations(friend.ID))
	})

	t.Run("notifies other active members when someone joins or leaves, but not the actor", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "NotifyJoinOwner")
		friend := e.makeProfile(t, "NotifyJoinFriend")
		observer := e.makeProfile(t, "NotifyJoinObserver")
		e.makeFriends(t, owner.ID, friend.ID)
		e.makeFriends(t, owner.ID, observer.ID)
		ctx := context.Background()

		countOf := func(userID pgtype.UUID) int {
			list, err := e.notifySvc.List(ctx, userID, false, 100, 0)
			require.NoError(t, err)
			count := 0
			for _, n := range list {
				if n.Type == string(notifications.TypeGroupMembershipChange) {
					count++
				}
			}
			return count
		}

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Notify Household", Type: strPtr("HOUSEHOLD"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID), idutil.String(observer.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)
		_, err = e.svc.AcceptInvite(ctx, observer.ID, group.ID)
		require.NoError(t, err)

		ownerBefore := countOf(owner.ID)
		observerBefore := countOf(observer.ID)

		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)
		assert.Equal(t, 0, countOf(friend.ID))
		assert.Equal(t, ownerBefore+1, countOf(owner.ID))
		assert.Equal(t, observerBefore+1, countOf(observer.ID))

		ownerAfterJoin := countOf(owner.ID)
		require.NoError(t, e.svc.RemoveMember(ctx, friend.ID, group.ID, friend.ID))
		assert.Equal(t, ownerAfterJoin+1, countOf(owner.ID))
	})

	t.Run("notifies only the target member on a role change", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "NotifyRoleOwner")
		friend := e.makeProfile(t, "NotifyRoleFriend")
		e.makeFriends(t, owner.ID, friend.ID)
		ctx := context.Background()

		countOf := func(userID pgtype.UUID) int {
			list, err := e.notifySvc.List(ctx, userID, false, 100, 0)
			require.NoError(t, err)
			count := 0
			for _, n := range list {
				if n.Type == string(notifications.TypeGroupMembershipChange) {
					count++
				}
			}
			return count
		}

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Notify Role Group", Type: strPtr("OTHER"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)
		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)

		friendBefore := countOf(friend.ID)
		ownerBefore := countOf(owner.ID)

		_, err = e.svc.UpdateMemberRole(ctx, owner.ID, group.ID, friend.ID, "ADMIN")
		require.NoError(t, err)

		assert.Equal(t, friendBefore+1, countOf(friend.ID))
		assert.Equal(t, ownerBefore, countOf(owner.ID))
	})

	t.Run("notifies other active members when simplifyDebts is toggled, not on unrelated updates", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "NotifySimplifyOwner")
		friend := e.makeProfile(t, "NotifySimplifyFriend")
		e.makeFriends(t, owner.ID, friend.ID)
		ctx := context.Background()

		countOf := func(userID pgtype.UUID) int {
			list, err := e.notifySvc.List(ctx, userID, false, 100, 0)
			require.NoError(t, err)
			count := 0
			for _, n := range list {
				if n.Type == string(notifications.TypeDebtSimplificationChange) {
					count++
				}
			}
			return count
		}

		simplify := true
		group, err := e.svc.Create(ctx, owner.ID, apitypes.CreateGroupInput{
			Name: "Notify Simplify Group", Type: strPtr("OTHER"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		e.trackGroup(group.ID)
		_, err = e.svc.AcceptInvite(ctx, friend.ID, group.ID)
		require.NoError(t, err)

		_, err = e.svc.Update(ctx, owner.ID, group.ID, apitypes.UpdateGroupInput{Description: strPtr("no simplify change")})
		require.NoError(t, err)
		assert.Equal(t, 0, countOf(friend.ID))

		notSimplify := false
		_, err = e.svc.Update(ctx, owner.ID, group.ID, apitypes.UpdateGroupInput{SimplifyDebts: &notSimplify})
		require.NoError(t, err)
		assert.Equal(t, 1, countOf(friend.ID))
	})
}

func strPtr(s string) *string { return &s }
