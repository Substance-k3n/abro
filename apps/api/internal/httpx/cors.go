package httpx

import "net/http"

// CORS returns middleware allowing exactly one origin (the frontend,
// cfg.WebOrigin) to make credentialed cross-origin requests -- required
// for the browser to send/receive the session cookie set by /auth, since
// apps/web (:3200) and apps/api (:3201) are different origins. Written by
// hand rather than pulling in go-chi/cors: this project deliberately
// keeps its Go dependency footprint minimal (chi + pgx/v5 + sqlc, no ORM
// -- see docs/DECISIONS.md), and a single-origin allowlist with
// credentials is a handful of headers, not worth a new dependency for.
//
// A wildcard origin ("*") is intentionally not supported: browsers reject
// `Access-Control-Allow-Origin: *` combined with
// `Access-Control-Allow-Credentials: true` outright, and this API's only
// consumer is its own frontend, never a public/third-party client.
func CORS(allowedOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && origin == allowedOrigin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
			}

			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key")
				w.Header().Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
