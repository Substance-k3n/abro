'use client';

// Users (ADR-028): everyone with an ABRO account, newest first, 50 a
// page. Search matches name, email or username; tabs filter to active,
// suspended or admins. Search, tab and page live in the URL, so Back and
// shared links land on the same list. Counts only -- nobody's money.

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import {
  Avatar,
  Badge,
  ErrorCard,
  PageHeader,
  Segmented,
  Skeleton,
  dateOnly,
  num,
  relTime,
} from '~/components/ui';
import { type UserPage, type UserStatus, listUsers } from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { ROLE_LABEL } from '~/lib/session';

const TABS: { value: UserStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'admins', label: 'Admins' },
];

export default function UsersPage() {
  return (
    <Suspense>
      <Users />
    </Suspense>
  );
}

function Users() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (TABS.find((t) => t.value === params.get('status'))?.value ?? '') as UserStatus;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [text, setText] = useState(q);
  const box = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<UserPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const go = (next: { q?: string; status?: UserStatus; page?: number }) => {
    const p = new URLSearchParams();
    const nq = next.q ?? q;
    const ns = next.status ?? status;
    const np = next.page ?? 1;
    if (nq) {
      p.set('q', nq);
    }
    if (ns) {
      p.set('status', ns);
    }
    if (np > 1) {
      p.set('page', String(np));
    }
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // Typing searches after a short pause, not on every key.
  useEffect(() => {
    if (text.trim() === q) {
      return;
    }
    const t = setTimeout(() => go({ q: text.trim() }), 300);
    return () => clearTimeout(t);
    // go reads the current URL values; only the text should re-arm it.
  }, [text]);

  // Back/forward changes the URL: the box follows it, unless someone is
  // typing in it (their newer letters win).
  useEffect(() => {
    if (document.activeElement !== box.current) {
      setText(q);
    }
  }, [q]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    listUsers(q, status, page)
      .then((d) => {
        if (!live) {
          return;
        }
        setData(d);
        setError(null);
      })
      .catch(
        (err) => live && setError(err instanceof ApiError ? err.message : "Couldn't load users."),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [q, status, page]);

  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={
          data
            ? `${num(data.total)} ${status ? TABS.find((t) => t.value === status)?.label.toLowerCase() : 'people'}${q ? ` matching "${q}"` : ''}`
            : 'Loading…'
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            className="text-ink-3 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            ref={box}
            type="search"
            aria-label="Search users"
            className="input pl-9"
            placeholder="Search name, email or username"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Segmented
          label="Filter"
          value={status}
          options={TABS}
          onChange={(s) => go({ status: s })}
        />
      </div>

      {error && <ErrorCard message={error} onRetry={() => go({ page })} />}

      {!error && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-page/70 text-ink-3 border-line border-b text-left text-xs">
              <tr>
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Groups</th>
                <th className="px-5 py-3 font-medium">Last active</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className={loading && data ? 'opacity-60' : ''}>
              {!data &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-line border-t">
                    <td colSpan={6} className="px-5 py-3">
                      <Skeleton className="h-6" />
                    </td>
                  </tr>
                ))}
              {data?.users.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-ink-3 px-5 py-12 text-center">
                    {q ? `Nobody matches "${q}".` : 'Nobody here yet.'}
                  </td>
                </tr>
              )}
              {data?.users.map((u) => (
                <tr
                  key={u.id}
                  className="border-line hover:bg-page/60 cursor-pointer border-t"
                  onClick={() => router.push(`/users/${u.id}`)}
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/users/${u.id}`}
                      className="flex items-center gap-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Avatar name={u.displayName} url={u.avatarUrl} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{u.displayName}</span>
                        <span className="text-ink-3 block truncate text-xs">
                          {u.username ? `@${u.username}` : 'no username yet'}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-ink-2 max-w-[260px] truncate px-5 py-3">{u.email ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.suspendedAt ? (
                        <Badge tone="bad">Suspended</Badge>
                      ) : (
                        <Badge tone="good">Active</Badge>
                      )}
                      {u.adminRole && <Badge tone="accent">{ROLE_LABEL[u.adminRole]}</Badge>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{num(u.groupCount)}</td>
                  <td className="text-ink-2 px-5 py-3" title={u.lastActiveAt ?? undefined}>
                    {relTime(u.lastActiveAt)}
                  </td>
                  <td className="text-ink-2 px-5 py-3">{dateOnly(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.total > 0 && (
            <div className="border-line text-ink-3 flex items-center justify-between border-t px-5 py-3 text-sm">
              <span>
                Showing {num(from)}–{num(to)} of {num(data.total)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-2"
                  disabled={page <= 1 || loading}
                  onClick={() => go({ page: page - 1 })}
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
                  disabled={page >= pages || loading}
                  onClick={() => go({ page: page + 1 })}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
