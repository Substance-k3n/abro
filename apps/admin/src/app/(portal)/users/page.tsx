'use client';

// Users (ADR-028): everyone with an ABRO account, newest first, 50 a
// page. Search matches name, email or username; tabs filter to active,
// suspended or admins. Search, tab and page live in the URL, so Back and
// shared links land on the same list. Counts only -- nobody's money.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

import { Pager, SearchBox, SkeletonRows, useListLoad, useListParams } from '~/components/list';
import {
  Avatar,
  Badge,
  ErrorCard,
  PageHeader,
  Segmented,
  dateOnly,
  num,
  relTime,
} from '~/components/ui';
import { type UserStatus, listUsers } from '~/lib/admin-api';
import { ROLE_LABEL } from '~/lib/session';

const TABS: { value: UserStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'admins', label: 'Admins' },
];
const STATUSES = TABS.map((t) => t.value);

export default function UsersPage() {
  return (
    <Suspense>
      <Users />
    </Suspense>
  );
}

function Users() {
  const router = useRouter();
  const { q, status, page, go } = useListParams<UserStatus>(STATUSES, '');
  const { data, error, loading, retry } = useListLoad(
    () => listUsers(q, status, page),
    [q, status, page],
  );
  const what = status
    ? (TABS.find((t) => t.value === status)?.label.toLowerCase() ?? '')
    : 'people';

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={data ? `${num(data.total)} ${what}${q ? ` matching "${q}"` : ''}` : 'Loading…'}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          label="Search users"
          placeholder="Search name, email or username"
          value={q}
          onSearch={(nq) => go({ q: nq })}
        />
        <Segmented
          label="Filter"
          value={status}
          options={TABS}
          onChange={(s) => go({ status: s })}
        />
      </div>

      {error && <ErrorCard message={error} onRetry={retry} />}

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
              {!data && <SkeletonRows cols={6} />}
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
          {data && (
            <Pager
              page={page}
              pageSize={data.pageSize}
              total={data.total}
              busy={loading}
              onPage={(p) => go({ page: p })}
            />
          )}
        </div>
      )}
    </>
  );
}
