package apitypes

import (
	"net/url"
	"strings"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// PushSubscriptionInput is the browser's PushSubscription.toJSON() as-is
// (ADR-021): the push service endpoint plus its encryption keys.
type PushSubscriptionInput struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

func (in *PushSubscriptionInput) Validate() error {
	if err := validatePushEndpoint(in.Endpoint); err != nil {
		return err
	}
	in.Keys.P256dh = strings.TrimSpace(in.Keys.P256dh)
	in.Keys.Auth = strings.TrimSpace(in.Keys.Auth)
	if in.Keys.P256dh == "" || in.Keys.Auth == "" || len(in.Keys.P256dh) > 256 || len(in.Keys.Auth) > 256 {
		return httpx.BadRequest("VALIDATION_ERROR", "keys.p256dh and keys.auth are required")
	}
	return nil
}

// PushUnsubscribeInput names the device to stop pushing to.
type PushUnsubscribeInput struct {
	Endpoint string `json:"endpoint"`
}

func (in *PushUnsubscribeInput) Validate() error {
	return validatePushEndpoint(in.Endpoint)
}

// pushServiceHosts are the browsers' push services (Chrome/Android,
// Firefox, Safari/iOS, Edge). The API posts to whatever endpoint is
// stored, so anything else is refused rather than letting a caller point
// it at an address of their choosing.
var pushServiceHosts = []string{
	"fcm.googleapis.com",
	"push.services.mozilla.com",
	"push.apple.com",
	"notify.windows.com",
}

func validatePushEndpoint(endpoint string) error {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Port() != "" || len(endpoint) > 2048 {
		return httpx.BadRequest("VALIDATION_ERROR", "endpoint must be an https URL")
	}
	host := strings.ToLower(u.Hostname())
	for _, known := range pushServiceHosts {
		if host == known || strings.HasSuffix(host, "."+known) {
			return nil
		}
	}
	return httpx.BadRequest("PUSH_SERVICE_NOT_SUPPORTED", "This browser's push service isn't supported.")
}
