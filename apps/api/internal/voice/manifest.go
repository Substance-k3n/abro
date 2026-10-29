package voice

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"reflect"
	"strings"
	"time"
)

// manifest is every voice action the web app declares, written by
// `pnpm --filter @abro/web voice:manifest` (CI checks it's current).
// Tezaz production sessions only allow published actions, so publishing
// it on start makes a new or reworded action live with the deploy.
//
//go:embed manifest.json
var manifest []byte

// publishWaits are the pauses between attempts: the relay may be waking up.
var publishWaits = []time.Duration{0, 15 * time.Second, time.Minute, 5 * time.Minute}

// PublishActions sends the manifest to the relay with the production key.
// A development key needs no manifest (its sessions accept what the page
// declares), so it's skipped. Run it in its own goroutine.
func (s *Service) PublishActions(ctx context.Context) {
	if !s.IsConfigured() || !strings.HasPrefix(s.secretKey, "tz_sec_live_") {
		return
	}
	client := &http.Client{Timeout: time.Minute}
	var err error
	for _, wait := range publishWaits {
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		if err = s.publish(ctx, client); err == nil {
			log.Printf("voice: published the voice actions to the relay")
			return
		}
	}
	log.Printf("voice: publishing the voice actions failed: %v", err)
}

// syncFor is how long a matching manifest is trusted before checking again.
var syncFor = time.Minute

// ensurePublished runs before each token: if the relay's manifest isn't
// ours (an older deploy, a publish from the Tezaz dashboard, or a start-up
// publish that failed), it publishes ours again, so a session never starts
// with actions the relay would refuse. Failures are only logged: the token
// still goes out, and the next one tries again.
func (s *Service) ensurePublished(ctx context.Context) {
	if !strings.HasPrefix(s.secretKey, "tz_sec_live_") {
		return
	}
	s.syncMu.Lock()
	defer s.syncMu.Unlock()
	if time.Since(s.syncedAt) < syncFor {
		return
	}
	same, err := s.relayHasManifest(ctx)
	if err != nil {
		log.Printf("voice: checking the published voice actions: %v", err)
		return
	}
	if !same {
		if err := s.publish(ctx, s.client); err != nil {
			log.Printf("voice: republishing the voice actions: %v", err)
			return
		}
		log.Printf("voice: the relay had other voice actions; published ours again")
	}
	s.syncedAt = time.Now()
}

// relayHasManifest compares the relay's published actions with ours,
// ignoring key order (the relay compares them the same way).
func (s *Service) relayHasManifest(ctx context.Context) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.relayURL+"/v1/manifest", nil)
	if err != nil {
		return false, fmt.Errorf("building manifest request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.secretKey)
	resp, err := s.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("reading manifest: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		reason, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return false, fmt.Errorf("relay answered %d %s", resp.StatusCode, strings.TrimSpace(string(reason)))
	}
	var theirs struct {
		Manifest *struct {
			Capabilities any `json:"capabilities"`
		} `json:"manifest"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&theirs); err != nil {
		return false, fmt.Errorf("decoding manifest: %w", err)
	}
	var ours struct {
		Capabilities any `json:"capabilities"`
	}
	if err := json.Unmarshal(manifest, &ours); err != nil {
		return false, fmt.Errorf("decoding embedded manifest: %w", err)
	}
	return theirs.Manifest != nil && reflect.DeepEqual(theirs.Manifest.Capabilities, ours.Capabilities), nil
}

func (s *Service) publish(ctx context.Context, client *http.Client) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, s.relayURL+"/v1/manifest", bytes.NewReader(manifest))
	if err != nil {
		return fmt.Errorf("building manifest request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.secretKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("sending manifest: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		reason, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("relay answered %d %s", resp.StatusCode, strings.TrimSpace(string(reason)))
	}
	return nil
}
