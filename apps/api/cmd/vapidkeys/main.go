// Command vapidkeys prints a new VAPID key pair for phone/browser push
// (ADR-021, docs/DEPLOY.md). Run once per environment:
//
//	go run ./cmd/vapidkeys
//
// and put the two lines in that environment's env vars. Changing the
// keys later silently breaks every existing device subscription.
package main

import (
	"fmt"
	"log"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func main() {
	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n", publicKey, privateKey)
}
