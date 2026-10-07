// Package friends implements friend search, requests, accept/decline, and
// unfriend -- ported from apps/api/src/modules/friends.
package friends

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

type Service struct {
	q             db.Querier
	notifications *notifications.Service
}

func NewService(q db.Querier, notificationsSvc *notifications.Service) *Service {
	return &Service{q: q, notifications: notificationsSvc}
}

// Search finds a Profile by exact email or phone match only -- never a
// fuzzy name search, so you can't browse the user directory.
// usernameLike matches what a username can contain (apitypes/username.go),
// so anything else in a query can't be a username prefix.
var usernameLike = regexp.MustCompile(`^[a-z0-9_.]+$`)

// maxUsernameResults caps search-as-you-type, so a short prefix lists a
// handful of handles rather than the user directory.
const maxUsernameResults = 8

// Search powers Add Friend. A query with an "@" inside it (not leading) or
// one that looks like a phone number is an exact lookup of an email or
// phone the searcher already knows, and only an exact email match returns
// the email. Anything else is a username prefix, typed as you go ("ali"
// finds @alice_test), with a leading "@" allowed: at most
// maxUsernameResults profiles, emails always removed, display names never
// searched. The searcher is never in their own results.
func (s *Service) Search(ctx context.Context, query string, excludeUserID pgtype.UUID) ([]db.Profile, error) {
	lowered := strings.ToLower(query)

	if strings.Contains(strings.TrimPrefix(lowered, "@"), "@") || looksLikePhone(query) {
		profile, err := s.q.SearchFriendExact(ctx, db.SearchFriendExactParams{
			ExcludeID: excludeUserID,
			Email:     pgtype.Text{String: lowered, Valid: true},
			Phone:     pgtype.Text{String: query, Valid: true},
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return []db.Profile{}, nil
		}
		if err != nil {
			return nil, err
		}
		if profile.Email.String != lowered {
			profile.Email = pgtype.Text{}
		}
		return []db.Profile{profile}, nil
	}

	prefix := strings.TrimPrefix(lowered, "@")
	if !usernameLike.MatchString(prefix) {
		return []db.Profile{}, nil
	}
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(prefix)
	profiles, err := s.q.SearchProfilesByUsernamePrefix(ctx, db.SearchProfilesByUsernamePrefixParams{
		ExcludeID:     excludeUserID,
		PrefixPattern: escaped + "%",
		Exact:         prefix,
		RowLimit:      maxUsernameResults,
	})
	if err != nil {
		return nil, err
	}
	for i := range profiles {
		profiles[i].Email = pgtype.Text{}
	}
	if profiles == nil {
		profiles = []db.Profile{}
	}
	return profiles, nil
}

// looksLikePhone: an optional "+", then only digits, spaces and dashes,
// with at least 7 digits. Usernames can't start with "+" and rarely are
// seven-plus digits.
func looksLikePhone(query string) bool {
	digits := 0
	for i, r := range query {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r == '+' && i == 0, r == ' ', r == '-':
		default:
			return false
		}
	}
	return digits >= 7
}

func (s *Service) List(ctx context.Context, userID pgtype.UUID) ([]db.ListFriendshipsRow, error) {
	return s.q.ListFriendships(ctx, userID)
}

func (s *Service) ListIncomingRequests(ctx context.Context, userID pgtype.UUID) ([]db.ListIncomingFriendRequestsRow, error) {
	return s.q.ListIncomingFriendRequests(ctx, userID)
}

func (s *Service) SendRequest(ctx context.Context, userID pgtype.UUID, friendIDRaw string) (db.Friendship, error) {
	friendID, err := idutil.Parse(friendIDRaw)
	if err != nil {
		return db.Friendship{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	}

	if userID == friendID {
		return db.Friendship{}, httpx.Conflict("CANNOT_FRIEND_SELF", "You cannot friend yourself.")
	}

	if _, err := s.q.GetProfileByID(ctx, friendID); errors.Is(err, pgx.ErrNoRows) {
		return db.Friendship{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	} else if err != nil {
		return db.Friendship{}, err
	}

	existing, err := s.q.FindFriendshipBetween(ctx, db.FindFriendshipBetweenParams{UserID: userID, FriendID: friendID})
	if err == nil {
		return db.Friendship{}, httpx.Conflict("FRIENDSHIP_EXISTS",
			fmt.Sprintf("A friendship already exists with status %s.", existing.Status))
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.Friendship{}, err
	}

	friendship, err := s.q.CreateFriendship(ctx, db.CreateFriendshipParams{UserID: userID, FriendID: friendID})
	if err != nil {
		return db.Friendship{}, err
	}
	if _, err := s.notifications.Notify(ctx, friendID, notifications.TypeFriendRequest,
		"Friend request", fmt.Sprintf("%s wants to be friends.", s.nameOf(ctx, userID))); err != nil {
		return db.Friendship{}, err
	}
	return friendship, nil
}

func (s *Service) AcceptRequest(ctx context.Context, userID pgtype.UUID, friendshipIDRaw string) (db.Friendship, error) {
	friendship, err := s.findOrThrow(ctx, friendshipIDRaw)
	if err != nil {
		return db.Friendship{}, err
	}

	if friendship.FriendID != userID {
		return db.Friendship{}, httpx.Forbidden("NOT_REQUEST_RECIPIENT", "Only the recipient can accept this request.")
	}
	if friendship.Status != db.FriendshipStatusPENDING {
		return db.Friendship{}, httpx.Conflict("NOT_PENDING", "This request is no longer pending.")
	}

	accepted, err := s.q.AcceptFriendship(ctx, friendship.ID)
	if err != nil {
		return db.Friendship{}, err
	}
	// Tell whoever sent the request; the accepter already knows.
	if _, err := s.notifications.Notify(ctx, friendship.UserID, notifications.TypeFriendAccepted,
		"Friend request accepted", fmt.Sprintf("%s accepted your friend request.", s.nameOf(ctx, userID))); err != nil {
		return db.Friendship{}, err
	}
	return accepted, nil
}

// nameOf is how a notification names someone: their display name, plus
// @username when they have one (two people can share a display name).
func (s *Service) nameOf(ctx context.Context, userID pgtype.UUID) string {
	p, err := s.q.GetProfileByID(ctx, userID)
	if err != nil {
		return "Someone"
	}
	if p.Username.Valid {
		return fmt.Sprintf("%s (@%s)", p.DisplayName, p.Username.String)
	}
	return p.DisplayName
}

func (s *Service) DeclineRequest(ctx context.Context, userID pgtype.UUID, friendshipIDRaw string) error {
	friendship, err := s.findOrThrow(ctx, friendshipIDRaw)
	if err != nil {
		return err
	}

	if friendship.FriendID != userID {
		return httpx.Forbidden("NOT_REQUEST_RECIPIENT", "Only the recipient can decline this request.")
	}
	if friendship.Status != db.FriendshipStatusPENDING {
		return httpx.Conflict("NOT_PENDING", "This request is no longer pending.")
	}

	return s.q.DeleteFriendship(ctx, friendship.ID)
}

func (s *Service) Unfriend(ctx context.Context, userID pgtype.UUID, friendshipIDRaw string) error {
	friendship, err := s.findOrThrow(ctx, friendshipIDRaw)
	if err != nil {
		return err
	}

	if friendship.UserID != userID && friendship.FriendID != userID {
		return httpx.Forbidden("NOT_PARTICIPANT", "Not part of this friendship.")
	}
	if friendship.Status != db.FriendshipStatusACCEPTED {
		return httpx.Conflict("NOT_FRIENDS", "Not currently friends.")
	}

	return s.q.DeleteFriendship(ctx, friendship.ID)
}

// AreFriends is used by other modules to enforce "must already be friends"
// invariants (e.g. adding a group member).
func (s *Service) AreFriends(ctx context.Context, userIDA, userIDB pgtype.UUID) (bool, error) {
	if userIDA == userIDB {
		return true, nil
	}
	friendship, err := s.q.FindFriendshipBetween(ctx, db.FindFriendshipBetweenParams{UserID: userIDA, FriendID: userIDB})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	// FindFriendshipBetween doesn't filter by status -- a PENDING/BLOCKED row
	// between the two isn't friendship yet.
	return friendship.Status == db.FriendshipStatusACCEPTED, nil
}

func (s *Service) findOrThrow(ctx context.Context, friendshipIDRaw string) (db.Friendship, error) {
	friendshipID, err := idutil.Parse(friendshipIDRaw)
	if err != nil {
		return db.Friendship{}, httpx.NotFound("FRIENDSHIP_NOT_FOUND", "No such friend request.")
	}
	friendship, err := s.q.GetFriendshipByID(ctx, friendshipID)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Friendship{}, httpx.NotFound("FRIENDSHIP_NOT_FOUND", "No such friend request.")
	}
	return friendship, err
}
