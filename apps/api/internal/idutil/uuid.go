// Package idutil bridges pgtype.UUID (what sqlc generates for every UUID
// column) and plain strings (what JSON request/response bodies use).
package idutil

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Parse turns a wire-format UUID string into a pgtype.UUID, or an error if
// it isn't a valid UUID.
func Parse(s string) (pgtype.UUID, error) {
	parsed, err := uuid.Parse(s)
	if err != nil {
		return pgtype.UUID{}, err
	}
	return pgtype.UUID{Bytes: parsed, Valid: true}, nil
}

// String renders a pgtype.UUID back to its canonical string form. Returns
// "" for an invalid/null UUID.
func String(id pgtype.UUID) string {
	if !id.Valid {
		return ""
	}
	return uuid.UUID(id.Bytes).String()
}
