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
// On the free-tier deploy (ADR-012) NEXT_PUBLIC_API_URL is `/api`, a
// same-origin path next.config.mjs forwards to the API, so the same code
// runs without any cross-origin request at all.
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
  const isRead = (init?.method ?? 'GET') === 'GET';
  if (!isRead) {
    // Anything that changes data can change balances anywhere, so nothing
    // read before it may be reused after it.
    clearApiCache();
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    // FormData sets its own multipart Content-Type (with the boundary).
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!isRead) {
    // Again on completion: a read that started during the change could
    // otherwise cache what the server had before it.
    clearApiCache();
  }

  if (res.status === 401 && redirectToSignIn(body?.code as string | undefined)) {
    // Never settles: the page keeps its loading state while the browser
    // leaves, instead of flashing its error card first.
    return new Promise<T>(() => {});
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (body?.code as string) ?? 'UNKNOWN_ERROR',
      (body?.message as string) ?? 'Something went wrong. Please try again.',
    );
  }

  return body as T;
}

/** A signed-out or expired session (apps/api/internal/auth/middleware.go's
 * NO_SESSION / INVALID_SESSION) sends the browser to sign-in from any
 * protected screen, so no page has to handle it itself. The /auth/*
 * pages are left alone: they expect "not signed in" and handle it.
 * Returns whether it redirected. */
function redirectToSignIn(code: string | undefined): boolean {
  if (
    typeof window === 'undefined' ||
    (code !== 'NO_SESSION' && code !== 'INVALID_SESSION') ||
    window.location.pathname.startsWith('/auth/')
  ) {
    return false;
  }
  window.location.replace('/auth/signin');
  return true;
}

// ---- Read cache (roadmap Phase 2b) ----------------------------------------
// Every screen builds itself from the same few reads (profile, friends,
// groups, balances, expenses, notifications), and used to refetch all of
// them on every tap. A read made in the last CACHE_TTL_MS is now answered
// from memory, and identical reads in flight are shared, so moving between
// screens is instant. Correctness rules:
//  - Any POST/PATCH/DELETE clears it (before and after), so after you add,
//    edit, settle or delete, every screen reads fresh balances.
//  - Coming back to the app (tab or installed app becomes visible again)
//    clears it, so a friend's new expense shows up when you return.
//  - `generation` stops a read that was in flight across a clear from
//    writing its older answer back into the fresh cache.
//  - Memory only, per tab: nothing is stored on the device, and a reload,
//    sign-out (a POST) or the sign-in redirect starts empty.

const CACHE_TTL_MS = 30_000;
const readCache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
let generation = 0;

export function clearApiCache(): void {
  generation += 1;
  readCache.clear();
  inFlight.clear();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearApiCache();
    }
  });
}

function cachedGet<T>(path: string): Promise<T> {
  const hit = readCache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Promise.resolve(hit.data as T);
  }
  const pending = inFlight.get(path);
  if (pending) {
    return pending as Promise<T>;
  }
  const startedIn = generation;
  const promise = request<T>(path)
    .then((data) => {
      if (startedIn === generation) {
        readCache.set(path, { at: Date.now(), data });
      }
      return data;
    })
    .finally(() => {
      if (inFlight.get(path) === promise) {
        inFlight.delete(path);
      }
    });
  inFlight.set(path, promise);
  return promise;
}

export const api = {
  get: <T>(path: string) => cachedGet<T>(path),
  post: <T>(path: string, data?: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
      headers,
    }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** An API-relative path (e.g. a photo's `/users/{id}/avatar/{version}`,
 * ADR-017) as a URL the browser can load: same-origin `/api/...` on the
 * free-tier deploy, the API's origin in dev. Absolute URLs (a Google
 * profile picture) pass through. */
export function apiUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith('/') ? `${API_URL}${pathOrUrl}` : pathOrUrl;
}

/** `${API_URL}/auth/google` is a real page navigation (the OAuth
 * redirect dance), never a `fetch` -- exported so signin/setup-profile
 * link to it directly instead of hardcoding the API origin twice. */
export function googleSignInUrl(): string {
  return `${API_URL}/auth/google`;
}
