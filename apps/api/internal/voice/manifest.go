package voice

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"io"
	"log"
	"net/http"
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
