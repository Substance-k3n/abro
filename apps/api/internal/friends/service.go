// Package friends implements friend search, requests, accept/decline, and
// unfriend -- ported from apps/api/src/modules/friends.
package friends

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

type Service struct {
	q db.Querier
}

func NewService(q db.Querier) *Service {
	return &Service{q: q}
}

// Search finds a Profile by exact email or phone match only -- never a
// fuzzy name search, so you can't browse the user directory.
func (s *Service) Search(ctx context.Context, query string, excludeUserID pgtype.UUID) ([]db.Profile, error) {
	profile, err := s.q.SearchFriendByEmailOrPhone(ctx, db.SearchFriendByEmailOrPhoneParams{
		ID:    excludeUserID,
		Email: pgtype.Text{String: query, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return []db.Profile{}, nil
	}
	if err != nil {
		return nil, err
	}
	return []db.Profile{profile}, nil
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

	return s.q.CreateFriendship(ctx, db.CreateFriendshipParams{UserID: userID, FriendID: friendID})
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

	return s.q.AcceptFriendship(ctx, friendship.ID)
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
