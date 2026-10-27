package apitypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPushEndpointValidation(t *testing.T) {
	accepted := []string{
		"https://fcm.googleapis.com/fcm/send/abc",                // Chrome, Android
		"https://updates.push.services.mozilla.com/wpush/v2/abc", // Firefox
		"https://web.push.apple.com/QGx",                         // Safari, iPhone
		"https://wns2-par02p.notify.windows.com/w/?token=abc",    // Edge
	}
	for _, endpoint := range accepted {
		assert.NoError(t, validatePushEndpoint(endpoint), endpoint)
	}

	refused := []string{
		"",
		"http://fcm.googleapis.com/fcm/send/abc", // not https
		"https://fcm.googleapis.com:8443/x",      // odd port
		"https://evil.example/fcm.googleapis.com",  // host isn't a push service
		"https://fcm.googleapis.com.evil.example/", // suffix trick
		"https://notfcm.googleapis.com/x",          // not a subdomain
		"https://169.254.169.254/latest/meta-data", // internal address
	}
	for _, endpoint := range refused {
		assert.Error(t, validatePushEndpoint(endpoint), endpoint)
	}
}

func TestPushSubscriptionInputNeedsKeys(t *testing.T) {
	in := PushSubscriptionInput{Endpoint: "https://fcm.googleapis.com/fcm/send/abc"}
	assert.Error(t, in.Validate())
	in.Keys.P256dh, in.Keys.Auth = " BPk ", "c2VjcmV0"
	assert.NoError(t, in.Validate())
	assert.Equal(t, "BPk", in.Keys.P256dh)
}
