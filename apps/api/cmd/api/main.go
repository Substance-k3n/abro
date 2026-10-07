package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/Substance-k3n/abro/apps/api/internal/analytics"
	"github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/balances"
	"github.com/Substance-k3n/abro/apps/api/internal/config"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/dbpool"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idempotency"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
	"github.com/Substance-k3n/abro/apps/api/internal/photos"
	"github.com/Substance-k3n/abro/apps/api/internal/recurring"
	"github.com/Substance-k3n/abro/apps/api/internal/settlements"
	"github.com/Substance-k3n/abro/apps/api/internal/storage"
	"github.com/Substance-k3n/abro/apps/api/internal/users"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.Load()

	pool, err := dbpool.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	queries := db.New(pool)

	google := auth.GoogleOAuthClient{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		CallbackURL:  cfg.GoogleCallbackURL,
	}

	// Resend needs a verified domain; Brevo works from a single verified
	// sender address (ADR-013). First configured one wins.
	var otpMailer auth.OTPMailer = auth.ConsoleOTPMailer{}
	resendMailer := auth.NewResendOTPMailer(cfg.ResendAPIKey, cfg.ResendFromEmail)
	brevoMailer := auth.NewBrevoOTPMailer(cfg.BrevoAPIKey, cfg.BrevoSenderEmail, cfg.BrevoSenderName)
	switch {
	case resendMailer.IsConfigured():
		otpMailer = resendMailer
		log.Println("OTP email: Resend")
	case brevoMailer.IsConfigured():
		otpMailer = brevoMailer
		log.Println("OTP email: Brevo")
	default:
		log.Println("No OTP mailer configured (RESEND_* or BREVO_*) -- OTP codes will be logged to the console, not emailed")
	}

	authSvc := auth.NewService(queries, google, otpMailer, cfg.SessionTTLDays)
	authHandler := auth.NewHandler(authSvc, google, queries, cfg.IsProduction(), cfg.WebOrigin)

	usersSvc := users.NewService(queries)
	usersHandler := users.NewHandler(usersSvc, queries)

	notificationsSvc := notifications.NewService(queries)
	notificationsHandler := notifications.NewHandler(notificationsSvc, queries)

	friendsSvc := friends.NewService(queries, notificationsSvc)
	friendsHandler := friends.NewHandler(friendsSvc, queries)

	groupsSvc := groups.NewService(queries, friendsSvc, notificationsSvc)
	groupsHandler := groups.NewHandler(groupsSvc, queries)

	receiptStore, err := storage.NewReceiptStorage(cfg.S3Endpoint, cfg.S3Region, cfg.S3AccessKeyID, cfg.S3SecretAccessKey, cfg.ReceiptsBucket)
	if err != nil {
		log.Fatalf("receipt storage: %v", err)
	}
	idempotencySvc := idempotency.NewService(queries)
	expensesSvc := expenses.NewService(queries, groupsSvc, friendsSvc, notificationsSvc, receiptStore)
	// Profile and group photos share the receipts bucket (ADR-017).
	photosHandler := photos.NewHandler(photos.NewService(queries, receiptStore, groupsSvc))
	expensesHandler := expenses.NewHandler(expensesSvc, idempotencySvc, queries)

	balancesSvc := balances.NewService(queries, friendsSvc, groupsSvc)
	balancesHandler := balances.NewHandler(balancesSvc, groupsSvc, queries)

	settlementsSvc := settlements.NewService(queries, balancesSvc, groupsSvc, notificationsSvc, expensesSvc)
	settlementsHandler := settlements.NewHandler(settlementsSvc, idempotencySvc, queries)

	analyticsSvc := analytics.NewService(queries)
	analyticsHandler := analytics.NewHandler(analyticsSvc, groupsSvc, queries)

	recurringSvc := recurring.NewService(queries, expensesSvc, notificationsSvc)
	recurringHandler := recurring.NewHandler(recurringSvc, queries)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(httpx.Recoverer)
	r.Use(httpx.CORS(cfg.WebOrigin))

	// Liveness only: answers without touching the database, so the
	// keep-awake ping (.github/workflows/keep-awake.yml) and Render's
	// health check never keep Neon's free-tier compute running.
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/auth", authHandler.Mount)
	r.Route("/users", func(r chi.Router) {
		usersHandler.Mount(r)
		photosHandler.MountUsers(r)
	})
	r.Route("/friends", friendsHandler.Mount)
	r.Route("/notifications", notificationsHandler.Mount)
	r.Route("/groups", func(r chi.Router) {
		groupsHandler.Mount(r)
		photosHandler.MountGroups(r)
	})
	r.Route("/expenses", expensesHandler.Mount)
	r.Route("/balances", balancesHandler.Mount)
	r.Route("/settlements", settlementsHandler.Mount)
	r.Route("/analytics", analyticsHandler.Mount)
	r.Route("/recurring", recurringHandler.Mount)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()

	log.Printf("abro api listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("listen: %v", err)
	}
}
