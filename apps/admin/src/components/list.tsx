'use client';

// What every searchable list page shares: its search text, filter and
// page live in the URL (so Back and shared links keep them), a search
// box that waits for a pause in typing, and a pager.

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Skeleton, num } from './ui';

export interface ListParams<S extends string> {
  q: string;
  status: S;
  page: number;
  /** Change some of them; anything but `page` resets to page 1. */
  go: (next: { q?: string; status?: S; page?: number }) => void;
}

export function useListParams<S extends string>(
  statuses: readonly S[],
  fallback: S,
): ListParams<S> {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const raw = params.get('status') as S | null;
  const status = raw && statuses.includes(raw) ? raw : fallback;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const go = (next: { q?: string; status?: S; page?: number }) => {
    const p = new URLSearchParams();
    const nq = next.q ?? q;
    const ns = next.status ?? status;
    const np = next.page ?? 1;
    if (nq) {
      p.set('q', nq);
    }
    if (ns && ns !== fallback) {
      p.set('status', ns);
    }
    if (np > 1) {
      p.set('page', String(np));
    }
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  return { q, status, page, go };
}

export function SearchBox({
  value,
  onSearch,
  placeholder,
  label,
}: {
  value: string;
  onSearch: (q: string) => void;
  placeholder: string;
  label: string;
}) {
  const [text, setText] = useState(value);
  const box = useRef<HTMLInputElement>(null);
  const search = useRef(onSearch);
  search.current = onSearch;

  // Searches after a short pause in typing, not on every key.
  useEffect(() => {
    if (text.trim() === value) {
      return;
    }
    const t = setTimeout(() => search.current(text.trim()), 300);
    return () => clearTimeout(t);
    // Only new text re-arms it; `value` catching up must not.
  }, [text]);

  // Back/forward changes the URL: the box follows, unless someone is
  // typing in it (their newer letters win).
  useEffect(() => {
    if (document.activeElement !== box.current) {
      setText(value);
    }
  }, [value]);

  return (
    <div className="relative w-full max-w-sm">
      <Search
        className="text-ink-3 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        ref={box}
        type="search"
        aria-label={label}
        className="input pl-9"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  busy,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  onPage: (p: number) => void;
}) {
  if (total === 0) {
    return null;
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="border-line text-ink-3 flex items-center justify-between border-t px-5 py-3 text-sm">
      <span>
        Showing {num(from)}–{num(to)} of {num(total)}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost h-8 px-2"
          disabled={page <= 1 || busy}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          className="btn btn-ghost h-8 px-2"
          disabled={page >= pages || busy}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Loads a page of something whenever its params change; the last
 * answer stays on screen while the next one loads. */
export function useListLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const fn = useRef(load);
  fn.current = load;

  useEffect(() => {
    let live = true;
    setLoading(true);
    fn.current()
      .then((d) => {
        if (!live) {
          return;
        }
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (live) {
          setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
    // The caller's params are the deps.
  }, [...deps, nonce]);

  return { data, error, loading, retry: () => setNonce((n) => n + 1) };
}

export function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-line border-t">
          <td colSpan={cols} className="px-5 py-3">
            <Skeleton className="h-6" />
          </td>
        </tr>
      ))}
    </>
  );
}
