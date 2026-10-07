package apitypes

import (
	"time"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

type Notification struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Title string `json:"title"`
	Body  string `json:"body"`
	// Link is the in-app path of what it's about (e.g. /expenses/<id>),
	// when there is one.
	Link      *string    `json:"link"`
	ReadAt    *time.Time `json:"readAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

func ToNotification(n db.Notification) Notification {
	out := Notification{
		ID:        idutil.String(n.ID),
		Type:      n.Type,
		Title:     n.Title,
		Body:      n.Body,
		CreatedAt: n.CreatedAt.Time,
	}
	if n.Link.Valid {
		out.Link = &n.Link.String
	}
	if n.ReadAt.Valid {
		out.ReadAt = &n.ReadAt.Time
	}
	return out
}
