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

	"github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/config"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/dbpool"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
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
	authSvc := auth.NewService(queries, google, auth.ConsoleOTPMailer{}, cfg.SessionTTLDays)
	authHandler := auth.NewHandler(authSvc, google, queries, cfg.IsProduction(), cfg.WebOrigin)

	usersSvc := users.NewService(queries)
	usersHandler := users.NewHandler(usersSvc, queries)

	friendsSvc := friends.NewService(queries)
	friendsHandler := friends.NewHandler(friendsSvc, queries)

	notificationsSvc := notifications.NewService(queries)
	notificationsHandler := notifications.NewHandler(notificationsSvc, queries)

	groupsSvc := groups.NewService(queries, friendsSvc, notificationsSvc)
	groupsHandler := groups.NewHandler(groupsSvc, queries)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(httpx.Recoverer)

	r.Route("/auth", authHandler.Mount)
	r.Route("/users", usersHandler.Mount)
	r.Route("/friends", friendsHandler.Mount)
	r.Route("/notifications", notificationsHandler.Mount)
	r.Route("/groups", groupsHandler.Mount)

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
