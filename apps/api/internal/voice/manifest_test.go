package voice

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
