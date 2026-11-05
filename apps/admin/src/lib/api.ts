// Every call the portal makes goes to this site's own /api, which
// next.config.mjs forwards to apps/api (so the session cookie is this
// site's). Errors carry apps/api's envelope: {statusCode, code, message}.
// No read cache on purpose: an admin acting on an account must see what
// is true now, not what was true 30 seconds ago.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Codes that mean "not signed in": the portal shows sign-in. */
export const SIGNED_OUT = new Set(['NO_SESSION', 'INVALID_SESSION']);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  }).catch(() => {
    throw new ApiError(0, 'OFFLINE', "Can't reach ABRO. Check your connection and try again.");
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const body = await res.json().catch(() => null);
  if (
    res.status === 401 &&
    SIGNED_OUT.has(body?.code) &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/signin')
  ) {
    // Expired, or ended by another admin: back to sign-in, then here.
    // Never settles, so the page keeps its state while the browser leaves.
    const here = window.location.pathname + window.location.search;
    window.location.replace(`/signin?next=${encodeURIComponent(here)}`);
    return new Promise<T>(() => {});
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (body?.code as string) ?? 'UNKNOWN_ERROR',
      (body?.message as string) ??
        (res.status >= 500
          ? 'ABRO had a problem. Try again in a minute.'
          : 'Something went wrong. Please try again.'),
      body?.details,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** A query string from the set values only. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
