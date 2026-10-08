package push_test

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	mathrand "math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/hkdf"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/push"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

// device is a fake browser: its own key pair and auth secret, so the test
// can decrypt what the API sent exactly as a real browser would.
type device struct {
	key  *ecdh.PrivateKey
	auth []byte
	keys push.Keys
}

func newDevice(t *testing.T) device {
	t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	require.NoError(t, err)
	auth := make([]byte, 16)
	_, err = rand.Read(auth)
	require.NoError(t, err)
	return device{key: key, auth: auth, keys: push.Keys{
		P256dh: base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()),
		Auth:   base64.RawURLEncoding.EncodeToString(auth),
	}}
}

// decrypt undoes RFC 8291 (aes128gcm) the way the browser does.
func (d device) decrypt(t *testing.T, body []byte) []byte {
	t.Helper()
	salt, idLen := body[:16], int(body[20])
	serverPub, ciphertext := body[21:21+idLen], body[21+idLen:]

	peer, err := ecdh.P256().NewPublicKey(serverPub)
	require.NoError(t, err)
	secret, err := d.key.ECDH(peer)
	require.NoError(t, err)

	expand := func(prk, info []byte, n int) []byte {
		out := make([]byte, n)
		_, err := io.ReadFull(hkdf.Expand(sha256.New, prk, info), out)
		require.NoError(t, err)
		return out
	}
	keyInfo := append(append([]byte("WebPush: info\x00"), d.key.PublicKey().Bytes()...), serverPub...)
	ikm := expand(hkdf.Extract(sha256.New, secret, d.auth), keyInfo, 32)
	prk := hkdf.Extract(sha256.New, ikm, salt)
	cek := expand(prk, []byte("Content-Encoding: aes128gcm\x00"), 16)
	nonce := expand(prk, []byte("Content-Encoding: nonce\x00"), 12)

	block, err := aes.NewCipher(cek)
	require.NoError(t, err)
	gcm, err := cipher.NewGCM(block)
	require.NoError(t, err)
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	require.NoError(t, err)
	// Strip the padding: the record ends with a 0x02 delimiter then zeros.
	return plain[:bytes.LastIndexByte(plain, 0x02)]
}

// pushServer is a fake push service answering every request with status.
type pushServer struct {
	*httptest.Server
	mu       sync.Mutex
	requests []*http.Request
	bodies   [][]byte
}

func newPushServer(t *testing.T, status int) *pushServer {
	t.Helper()
	ps := &pushServer{}
	ps.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		ps.mu.Lock()
		ps.requests = append(ps.requests, r)
		ps.bodies = append(ps.bodies, body)
		ps.mu.Unlock()
		w.WriteHeader(status)
	}))
	t.Cleanup(ps.Close)
	return ps
}

func testEnv(t *testing.T) (*push.Service, *db.Queries, func(label string) db.Profile) {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres")
	require.NoError(t, pool.Ping(context.Background()))
	t.Cleanup(pool.Close)
	queries := db.New(pool)

	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	require.NoError(t, err)
	svc := push.NewService(queries, publicKey, privateKey, "https://abro.test")

	makeProfile := func(label string) db.Profile {
		email := fmt.Sprintf("test-push-%s-%d-%d@abro.test", label, time.Now().UnixNano(), mathrand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email:       pgtype.Text{String: email, Valid: true},
			DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		t.Cleanup(func() {
			ctx := context.Background()
			pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE user_id = $1`, profile.ID)
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, profile.ID)
		})
		return profile
	}
	return svc, queries, makeProfile
}

func countSubscriptions(t *testing.T, q *db.Queries, userID pgtype.UUID) int {
	t.Helper()
	subs, err := q.ListPushSubscriptionsForUsers(context.Background(), []pgtype.UUID{userID})
	require.NoError(t, err)
	return len(subs)
}

func TestPush(t *testing.T) {
	t.Run("sends an encrypted, VAPID-signed message the device can read", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		user := makeProfile("A")
		server := newPushServer(t, http.StatusCreated)
		phone := newDevice(t)
		ctx := context.Background()
		require.NoError(t, svc.Subscribe(ctx, user.ID, server.URL+"/phone", phone.keys))

		msg := push.Message{ID: "n1", Type: "EXPENSE_ADDED", Title: "Lunch", Body: "You owe 50.00 ETB", Link: "/expenses/e1"}
		assert.Equal(t, 1, svc.SendNow(ctx, []pgtype.UUID{user.ID}, msg))

		require.Len(t, server.requests, 1)
		req := server.requests[0]
		assert.Equal(t, "/phone", req.URL.Path)
		assert.Equal(t, "aes128gcm", req.Header.Get("Content-Encoding"))
		assert.Equal(t, "86400", req.Header.Get("TTL"))
		assert.True(t, strings.HasPrefix(req.Header.Get("Authorization"), "vapid t="), req.Header.Get("Authorization"))

		var got push.Message
		require.NoError(t, json.Unmarshal(phone.decrypt(t, server.bodies[0]), &got))
		assert.Equal(t, msg, got)
	})

	t.Run("reaches every device of every recipient, and nobody else", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		a, b, bystander := makeProfile("A"), makeProfile("B"), makeProfile("C")
		server := newPushServer(t, http.StatusCreated)
		ctx := context.Background()
		require.NoError(t, svc.Subscribe(ctx, a.ID, server.URL+"/a-phone", newDevice(t).keys))
		require.NoError(t, svc.Subscribe(ctx, a.ID, server.URL+"/a-laptop", newDevice(t).keys))
		require.NoError(t, svc.Subscribe(ctx, b.ID, server.URL+"/b-phone", newDevice(t).keys))
		require.NoError(t, svc.Subscribe(ctx, bystander.ID, server.URL+"/c-phone", newDevice(t).keys))

		assert.Equal(t, 3, svc.SendNow(ctx, []pgtype.UUID{a.ID, b.ID}, push.Message{Title: "Hi"}))
		paths := []string{}
		for _, r := range server.requests {
			paths = append(paths, r.URL.Path)
		}
		assert.ElementsMatch(t, []string{"/a-phone", "/a-laptop", "/b-phone"}, paths)
	})

	t.Run("a device the push service says is gone is forgotten", func(t *testing.T) {
		svc, q, makeProfile := testEnv(t)
		user := makeProfile("A")
		gone := newPushServer(t, http.StatusGone)
		ctx := context.Background()
		require.NoError(t, svc.Subscribe(ctx, user.ID, gone.URL+"/old", newDevice(t).keys))

		assert.Equal(t, 0, svc.SendNow(ctx, []pgtype.UUID{user.ID}, push.Message{Title: "Hi"}))
		assert.Equal(t, 0, countSubscriptions(t, q, user.ID))
	})

	t.Run("a temporary push-service error keeps the device", func(t *testing.T) {
		svc, q, makeProfile := testEnv(t)
		user := makeProfile("A")
		flaky := newPushServer(t, http.StatusServiceUnavailable)
		ctx := context.Background()
		require.NoError(t, svc.Subscribe(ctx, user.ID, flaky.URL+"/p", newDevice(t).keys))

		assert.Equal(t, 0, svc.SendNow(ctx, []pgtype.UUID{user.ID}, push.Message{Title: "Hi"}))
		assert.Equal(t, 1, countSubscriptions(t, q, user.ID))
	})

	t.Run("re-subscribing an endpoint moves it to whoever is signed in now", func(t *testing.T) {
		svc, q, makeProfile := testEnv(t)
		first, second := makeProfile("A"), makeProfile("B")
		ctx := context.Background()
		endpoint := "https://fcm.googleapis.com/fcm/send/shared-phone"
		require.NoError(t, svc.Subscribe(ctx, first.ID, endpoint, newDevice(t).keys))
		require.NoError(t, svc.Subscribe(ctx, first.ID, endpoint, newDevice(t).keys))
		assert.Equal(t, 1, countSubscriptions(t, q, first.ID))

		require.NoError(t, svc.Subscribe(ctx, second.ID, endpoint, newDevice(t).keys))
		assert.Equal(t, 0, countSubscriptions(t, q, first.ID))
		assert.Equal(t, 1, countSubscriptions(t, q, second.ID))
	})

	t.Run("unsubscribe only removes the caller's own device", func(t *testing.T) {
		svc, q, makeProfile := testEnv(t)
		owner, other := makeProfile("A"), makeProfile("B")
		ctx := context.Background()
		endpoint := "https://fcm.googleapis.com/fcm/send/owners-phone"
		require.NoError(t, svc.Subscribe(ctx, owner.ID, endpoint, newDevice(t).keys))

		require.NoError(t, svc.Unsubscribe(ctx, other.ID, endpoint))
		assert.Equal(t, 1, countSubscriptions(t, q, owner.ID))
		require.NoError(t, svc.Unsubscribe(ctx, owner.ID, endpoint))
		assert.Equal(t, 0, countSubscriptions(t, q, owner.ID))
	})

	t.Run("does nothing when VAPID keys aren't set", func(t *testing.T) {
		_, q, makeProfile := testEnv(t)
		user := makeProfile("A")
		server := newPushServer(t, http.StatusCreated)
		unconfigured := push.NewService(q, "", "", "")
		ctx := context.Background()
		require.NoError(t, unconfigured.Subscribe(ctx, user.ID, server.URL+"/p", newDevice(t).keys))

		assert.False(t, unconfigured.IsConfigured())
		unconfigured.Send([]pgtype.UUID{user.ID}, push.Message{Title: "Hi"})
		unconfigured.Wait()
		assert.Empty(t, server.requests)
	})
}
