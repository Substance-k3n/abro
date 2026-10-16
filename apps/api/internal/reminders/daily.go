package reminders

import (
	"context"
	"log"
	"time"
)

// DailyHour is when, in Addis Ababa time, the automatic reminders go out:
// mid-morning, not in the night.
const DailyHour = 10

// checkEvery is how often the daily job looks at the clock. Looking
// doesn't touch the database, so Neon still sleeps in between (ADR-012).
const checkEvery = 15 * time.Minute

// DailyJob is another job for the same daily run, e.g. late fees
// (latefees.ChargeDue, ADR-026); n is what it did, for the log.
type DailyJob func(ctx context.Context, now time.Time) (n int, err error)

// RunDaily sends the due automatic reminders once a day, from DailyHour
// on, until ctx ends (ADR-023), then runs each of jobs. In-process: the API is kept awake around
// the clock (keep-awake), and a restart that day just runs the sweep
// again -- harmless, because a reminder is only sent once per AutoEvery.
func (s *Service) RunDaily(ctx context.Context, jobs ...DailyJob) {
	lastDay := ""
	check := func(now time.Time) {
		local := now.In(eat)
		day := local.Format(time.DateOnly)
		if local.Hour() < DailyHour || day == lastDay {
			return
		}
		lastDay = day
		// Late fees first: a reminder sent today then includes today's fee.
		for i, job := range jobs {
			n, err := job(ctx, now)
			if err != nil {
				log.Printf("daily job %d: %v", i, err)
				continue
			}
			log.Printf("daily job %d: %d done", i, n)
		}
		sent, err := s.SendDue(ctx, now)
		if err != nil {
			log.Printf("reminders: daily run: %v", err)
			return
		}
		log.Printf("reminders: daily run sent %d automatic reminders", sent)
	}

	check(time.Now())
	ticker := time.NewTicker(checkEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			check(now)
		}
	}
}
