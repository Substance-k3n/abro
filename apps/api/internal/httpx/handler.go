package httpx

import (
	"net/http"
	"runtime/debug"
)

// HandlerFunc is like http.HandlerFunc but can return an error -- Wrap
// turns that into the standard error envelope, so individual handlers
// don't each need their own WriteError call on every failure path.
type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

func Wrap(fn HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			WriteError(w, r, err)
		}
	}
}

// Recoverer catches a panic in any downstream handler and turns it into a
// 500 response instead of crashing the process -- mirrors Nest's default
// unhandled-exception behavior reaching the exception filter.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				debug.PrintStack()
				WriteError(w, r, Internal("INTERNAL_ERROR", "Something went wrong."))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
