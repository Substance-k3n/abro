// Package push sends ABRO's in-app notifications to people's phones and
// browsers as Web Push messages (ADR-021), so they hear about a new
// expense or a payment to confirm without opening the app.
//
// It is a second delivery of the same notification, nothing more:
// notifications.Service decides who gets what (opt-outs included) and
// calls Send after the in-app row is stored. Sending happens in the
// background and never fails the action that caused it -- a lost push
// still leaves the notification in the app.
package push

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// Message is what the service worker (apps/web/public/sw.js) shows.
type Message struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Title string `json:"title"`
	Body  string `json:"body"`
	// Link is the in-app path tapping it opens; empty means the app
	// picks a screen for the type, as the in-app list does.
	Link string `json:"link,omitempty"`
}

// Keys is the browser's {"p256dh": ..., "auth": ...}, stored as JSON in
// push_subscriptions.keys.
type Keys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

type Service struct {
	q          db.Querier
	publicKey  string
	privateKey string
	subject    string
	client     *http.Client
	// inflight lets main wait for pushes still being sent on shutdown.
	inflight sync.WaitGroup
}

// NewService builds the sender from the VAPID key pair (generate one with
// `go run ./cmd/vapidkeys`). subject is a mailto: address or https URL
// push services can contact about abuse.
func NewService(q db.Querier, publicKey, privateKey, subject string) *Service {
	return &Service{
		q: q, publicKey: publicKey, privateKey: privateKey, subject: subject,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// IsConfigured is false when the VAPID keys aren't set: the app then
// hides the push switch and Send does nothing.
func (s *Service) IsConfigured() bool {
	return s != nil && s.publicKey != "" && s.privateKey != ""
}

func (s *Service) PublicKey() string { return s.publicKey }

func (s *Service) Subscribe(ctx context.Context, userID pgtype.UUID, endpoint string, keys Keys) error {
	raw, err := json.Marshal(keys)
	if err != nil {
		return err
	}
	_, err = s.q.UpsertPushSubscription(ctx, db.UpsertPushSubscriptionParams{
		UserID: userID, Endpoint: endpoint, Keys: raw,
	})
	return err
}

// Unsubscribe only removes the caller's own row, so one account can't
// switch off another's device.
func (s *Service) Unsubscribe(ctx context.Context, userID pgtype.UUID, endpoint string) error {
	return s.q.DeletePushSubscription(ctx, db.DeletePushSubscriptionParams{UserID: userID, Endpoint: endpoint})
}

// Send pushes msg to every device of every user in userIDs, in the
// background: it returns at once and logs failures instead of returning
// them. The request that caused it may finish first, so it doesn't use
// the request's context.
func (s *Service) Send(userIDs []pgtype.UUID, msg Message) {
	if !s.IsConfigured() || len(userIDs) == 0 {
		return
	}
	s.inflight.Add(1)
	go func() {
		defer s.inflight.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		s.SendNow(ctx, userIDs, msg)
	}()
}

// Wait blocks until every push Send started has finished.
func (s *Service) Wait() {
	if s != nil {
		s.inflight.Wait()
	}
}

// SendNow is Send without the goroutine. It returns how many devices
// accepted the message.
func (s *Service) SendNow(ctx context.Context, userIDs []pgtype.UUID, msg Message) int {
	subs, err := s.q.ListPushSubscriptionsForUsers(ctx, userIDs)
	if err != nil {
		log.Printf("push: list subscriptions: %v", err)
		return 0
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("push: encode message: %v", err)
		return 0
	}
	delivered := 0
	for _, sub := range subs {
		if s.sendOne(ctx, sub, payload) {
			delivered++
		}
	}
	return delivered
}

func (s *Service) sendOne(ctx context.Context, sub db.PushSubscription, payload []byte) bool {
	var keys Keys
	if err := json.Unmarshal(sub.Keys, &keys); err != nil {
		log.Printf("push: bad keys on subscription %s: %v", idutil.String(sub.ID), err)
		return false
	}
	resp, err := webpush.SendNotificationWithContext(ctx, payload,
		&webpush.Subscription{Endpoint: sub.Endpoint, Keys: webpush.Keys{P256dh: keys.P256dh, Auth: keys.Auth}},
		&webpush.Options{
			HTTPClient:      s.client,
			Subscriber:      s.subject,
			VAPIDPublicKey:  s.publicKey,
			VAPIDPrivateKey: s.privateKey,
			// Held by the push service for up to a day if the phone is
			// off; after that the in-app list still has it.
			TTL:     24 * 60 * 60,
			Urgency: webpush.UrgencyHigh,
		})
	if err != nil {
		log.Printf("push: send to subscription %s: %v", idutil.String(sub.ID), err)
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		// The browser unsubscribed or the app was uninstalled: forget it.
		if err := s.q.DeletePushSubscriptionByEndpoint(ctx, sub.Endpoint); err != nil {
			log.Printf("push: delete expired subscription %s: %v", idutil.String(sub.ID), err)
		}
		return false
	case resp.StatusCode >= 300:
		log.Printf("push: subscription %s answered %d", idutil.String(sub.ID), resp.StatusCode)
		return false
	}
	return true
}
