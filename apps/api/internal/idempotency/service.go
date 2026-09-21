// Package idempotency implements docs/BACKEND_PLAN.md item 5's hardening
// pass: a request that fails after its DB write commits but before the
// response reaches the client (a timeout, a dropped connection) currently
// leaves the client with a 500 and no way to know the create actually
// happened -- retrying blindly creates a duplicate financial record. An
// Idempotency-Key header, scoped per (user, key, endpoint), lets a retried
// request return the original result instead of re-running the write.
//
// Reserve-then-fill, not "run then try to remember": the key row is
// created (with a null response) *before* fn runs, so a second, genuinely
// concurrent request with the same key fails fast on the unique
// constraint instead of racing to run fn twice. If fn errors, the
// reservation is deleted so a legitimate retry isn't permanently blocked.
package idempotency

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

const uniqueViolation = "23505"

type Service struct {
	q db.Querier
}

func NewService(q db.Querier) *Service {
	return &Service{q: q}
}

// Run executes fn and returns its JSON-marshaled result. If key is empty,
// fn runs unguarded, same as before this existed. Unlike the original
// NestJS implementation, no BigInt->string wire-shape juggling is needed:
// Go's json.Marshal already round-trips int64 amounts exactly.
func (s *Service) Run(ctx context.Context, userID pgtype.UUID, key, endpoint string, fn func() (any, error)) (json.RawMessage, error) {
	if key == "" {
		result, err := fn()
		if err != nil {
			return nil, err
		}
		return json.Marshal(result)
	}

	reservationID, cached, err := s.reserve(ctx, userID, key, endpoint)
	if err != nil {
		return nil, err
	}
	if cached != nil {
		return cached, nil
	}

	result, err := fn()
	if err != nil {
		_ = s.q.DeleteIdempotencyKey(ctx, reservationID)
		return nil, err
	}

	wireShape, err := json.Marshal(result)
	if err != nil {
		_ = s.q.DeleteIdempotencyKey(ctx, reservationID)
		return nil, err
	}
	if err := s.q.SetIdempotencyKeyResponse(ctx, db.SetIdempotencyKeyResponseParams{ID: reservationID, Response: wireShape}); err != nil {
		return nil, err
	}
	return wireShape, nil
}

func (s *Service) reserve(ctx context.Context, userID pgtype.UUID, key, endpoint string) (pgtype.UUID, json.RawMessage, error) {
	row, err := s.q.CreateIdempotencyKey(ctx, db.CreateIdempotencyKeyParams{UserID: userID, Key: key, Endpoint: endpoint})
	if err == nil {
		return row.ID, nil, nil
	}

	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != uniqueViolation {
		return pgtype.UUID{}, nil, err
	}

	existing, err := s.q.GetIdempotencyKeyByUserKeyEndpoint(ctx, db.GetIdempotencyKeyByUserKeyEndpointParams{UserID: userID, Key: key, Endpoint: endpoint})
	if errors.Is(err, pgx.ErrNoRows) {
		// The concurrent request that won the race hadn't committed yet when
		// we looked -- vanishingly rare, and correct to surface as in-flight.
		return pgtype.UUID{}, nil, httpx.Conflict("DUPLICATE_REQUEST_IN_FLIGHT", "A request with this idempotency key is already being processed.")
	}
	if err != nil {
		return pgtype.UUID{}, nil, err
	}
	if existing.Response == nil {
		return pgtype.UUID{}, nil, httpx.Conflict("DUPLICATE_REQUEST_IN_FLIGHT", "A request with this idempotency key is already being processed.")
	}
	return pgtype.UUID{}, existing.Response, nil
}
