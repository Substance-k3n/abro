// Phase 8 (docs/WIRING_PLAN.md) -- the shared fetch wrapper every real
// apps/api call goes through, starting with auth (~/lib/auth-api.ts).
// Later Phase 8 slices (dashboard, expenses, groups, settlements,
// profile/settings) add their own typed `~/lib/*-api.ts` files on top of
// this same client rather than each rolling their own fetch logic.
//
// `credentials: 'include'` on every request -- apps/api's session is an
// HttpOnly cookie (apps/api/internal/auth/router.go's setSessionCookie),
// unreadable from JS by design, so the browser must be told to send/
// accept it cross-origin. This only works because apps/api now has CORS
// configured for exactly this origin (apps/api/internal/httpx/cors.go).
//
// Error shape mirrors apps/api/internal/httpx/errors.go's APIError JSON
// envelope: {statusCode, code, message, path, timestamp}.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3201';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (body?.code as string) ?? 'UNKNOWN_ERROR',
      (body?.message as string) ?? 'Something went wrong. Please try again.',
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
};

/** `${API_URL}/auth/google` is a real page navigation (the OAuth
 * redirect dance), never a `fetch` -- exported so signin/setup-profile
 * link to it directly instead of hardcoding the API origin twice. */
export function googleSignInUrl(): string {
  return `${API_URL}/auth/google`;
}
