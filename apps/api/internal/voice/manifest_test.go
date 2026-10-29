package voice

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestManifestIsEmbedded(t *testing.T) {
	var m struct {
		Capabilities []struct {
			Name string `json:"name"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal(manifest, &m); err != nil || len(m.Capabilities) == 0 {
		t.Fatalf("manifest.json: %d actions, err %v", len(m.Capabilities), err)
	}
}

func TestPublishActionsRetriesThenSends(t *testing.T) {
	old := publishWaits
	publishWaits = []time.Duration{0, time.Millisecond, time.Millisecond}
	defer func() { publishWaits = old }()

	var calls atomic.Int32
	var gotMethod, gotPath, gotAuth string
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The first attempt finds the relay still waking up.
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		gotMethod, gotPath, gotAuth = r.Method, r.URL.Path, r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"published":[]}`))
	}))
	defer relay.Close()

	NewService(relay.URL, "tz_sec_live_x", "https://app.test", "").PublishActions(context.Background())
	if calls.Load() != 2 {
		t.Errorf("relay called %d times, want 2", calls.Load())
	}
	if gotMethod != http.MethodPut || gotPath != "/v1/manifest" || gotAuth != "Bearer tz_sec_live_x" {
		t.Errorf("relay got %s %s, auth %q", gotMethod, gotPath, gotAuth)
	}
}

func TestPublishActionsSkipsTheDevelopmentKey(t *testing.T) {
	var calls atomic.Int32
	relay := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls.Add(1) }))
	defer relay.Close()

	NewService(relay.URL, "tz_sec_dev_x", "http://localhost:3200", "").PublishActions(context.Background())
	NewService("", "tz_sec_live_x", "https://app.test", "").PublishActions(context.Background())
	if calls.Load() != 0 {
		t.Errorf("relay called %d times, want 0", calls.Load())
	}
}

// fakeRelay serves GET /v1/manifest with published (raw JSON), records
// each request as "METHOD /path", and issues tokens.
func fakeRelay(t *testing.T, published string) (*httptest.Server, *[]string) {
	var calls []string
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/manifest":
			_, _ = w.Write([]byte(`{"manifest":` + published + `,"proposed":null}`))
		case r.Method == http.MethodPut:
			_, _ = w.Write([]byte(`{"published":[]}`))
		default:
			_, _ = w.Write([]byte(`{"token":"t","expiresAt":1}`))
		}
	}))
	t.Cleanup(relay.Close)
	return relay, &calls
}

func TestTokenRepublishesAStaleManifest(t *testing.T) {
	// The relay has an older list (one action), as after a dashboard publish.
	relay, calls := fakeRelay(t, `{"capabilities":[{"name":"open_page"}],"updatedAt":"x"}`)
	svc := NewService(relay.URL, "tz_sec_live_x", "https://app.test", "*")
	for range 2 {
		if _, err := svc.Token(context.Background(), "u1"); err != nil {
			t.Fatal(err)
		}
	}
	want := []string{"GET /v1/manifest", "PUT /v1/manifest", "POST /v1/tokens", "POST /v1/tokens"}
	if strings.Join(*calls, ", ") != strings.Join(want, ", ") {
		t.Errorf("relay got %v, want %v (the second token trusts the fresh check)", *calls, want)
	}
}

func TestTokenLeavesAMatchingManifest(t *testing.T) {
	var ours struct {
		Capabilities json.RawMessage `json:"capabilities"`
	}
	if err := json.Unmarshal(manifest, &ours); err != nil {
		t.Fatal(err)
	}
	relay, calls := fakeRelay(t, `{"capabilities":`+string(ours.Capabilities)+`}`)
	if _, err := NewService(relay.URL, "tz_sec_live_x", "https://app.test", "*").Token(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(*calls, ", ") != "GET /v1/manifest, POST /v1/tokens" {
		t.Errorf("relay got %v, want no publish", *calls)
	}
}

func TestTokenPublishesWhenNothingIsPublished(t *testing.T) {
	relay, calls := fakeRelay(t, `null`)
	if _, err := NewService(relay.URL, "tz_sec_live_x", "https://app.test", "*").Token(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(*calls, "PUT /v1/manifest") {
		t.Errorf("relay got %v, want a publish", *calls)
	}
}
