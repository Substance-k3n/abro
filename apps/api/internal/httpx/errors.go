// Package httpx holds the shared HTTP plumbing every module's handlers use:
// the API error envelope, JSON helpers, and the session-auth middleware.
// Mirrors apps/api's common/filters/http-exception.filter.ts and
// common/pipes/zod-validation.pipe.ts (see docs/DECISIONS.md ADR-007).
package httpx

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// APIError is every error this API returns to a client. Every handler that
// can fail returns one instead of a bare error, so WriteError always has a
// status/code/message to render -- mirrors ApiErrorResponse (@abro/types).
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func (e *APIError) Error() string { return e.Message }

func NewAPIError(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

func BadRequest(code, message string) *APIError {
	return NewAPIError(http.StatusBadRequest, code, message)
}

func Unauthorized(code, message string) *APIError {
	return NewAPIError(http.StatusUnauthorized, code, message)
}

func Forbidden(code, message string) *APIError {
	return NewAPIError(http.StatusForbidden, code, message)
}

func Conflict(code, message string) *APIError {
	return NewAPIError(http.StatusConflict, code, message)
}

func NotFound(code, message string) *APIError {
	return NewAPIError(http.StatusNotFound, code, message)
}

func TooManyRequests(code, message string) *APIError {
	return NewAPIError(http.StatusTooManyRequests, code, message)
}

func Internal(code, message string) *APIError {
	return NewAPIError(http.StatusInternalServerError, code, message)
}

// apiErrorBody is the wire shape -- matches ApiErrorResponse (@abro/types):
// { statusCode, code, message, details?, path, timestamp }.
type apiErrorBody struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code"`
	Message    string `json:"message"`
	Details    any    `json:"details,omitempty"`
	Path       string `json:"path"`
	Timestamp  string `json:"timestamp"`
}

// WriteError normalizes any error into the API error envelope and writes
// it as JSON. An error that isn't an *APIError becomes a generic 500 --
// mirrors the filter's `catch(exception: unknown)` fallback.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	apiErr, ok := err.(*APIError)
	if !ok {
		apiErr = Internal("INTERNAL_ERROR", "Something went wrong.")
	}

	if apiErr.Status >= http.StatusInternalServerError {
		log.Printf("ERROR %s %s: %v", r.Method, r.URL.Path, err)
	}

	WriteJSON(w, apiErr.Status, apiErrorBody{
		StatusCode: apiErr.Status,
		Code:       apiErr.Code,
		Message:    apiErr.Message,
		Details:    apiErr.Details,
		Path:       r.URL.Path,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	})
}

// WriteJSON writes body as JSON with the given status code.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("ERROR encoding response: %v", err)
	}
}

// WriteRawJSON writes pre-marshaled JSON bytes with the given status code
// -- for handlers that already have a json.RawMessage (e.g. an idempotent
// endpoint's cached-or-fresh response).
func WriteRawJSON(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(body); err != nil {
		log.Printf("ERROR writing response: %v", err)
	}
}

// DecodeJSON parses the request body into v, returning a BadRequest
// *APIError on malformed JSON.
func DecodeJSON(r *http.Request, v any) error {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return BadRequest("INVALID_BODY", "Request body must be valid JSON.")
	}
	return nil
}
