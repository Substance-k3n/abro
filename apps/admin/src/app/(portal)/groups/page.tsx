'use client';

// Groups (ADR-028): every group, newest first, 50 a page -- name, type,
// size, open invites, how many expenses and when the last one was added.
// Live groups by default; Deleted and All show the rest. Never amounts.

import { GroupIcon } from '@abro/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

import { Pager, SearchBox, SkeletonRows, useListLoad, useListParams } from '~/components/list';
import { Badge, ErrorCard, PageHeader, Segmented, dateOnly, num, relTime } from '~/components/ui';
import { type GroupStatus, listGroups } from '~/lib/admin-api';
import { groupType } from '~/lib/groups';

const TABS: { value: GroupStatus; label: string }[] = [
  { value: '', label: 'Live' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'all', label: 'All' },
];
const STATUSES = TABS.map((t) => t.value);

export default function GroupsPage() {
  return (
    <Suspense>
      <Groups />
    </Suspense>
  );
}

function Groups() {
  const router = useRouter();
  const { q, status, page, go } = useListParams<GroupStatus>(STATUSES, '');
  const { data, error, loading, retry } = useListLoad(
    () => listGroups(q, status, page),
    [q, status, page],
  );
  const what = { '': 'live groups', deleted: 'deleted groups', all: 'groups' }[status];

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle={data ? `${num(data.total)} ${what}${q ? ` matching "${q}"` : ''}` : 'Loading…'}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          label="Search groups"
          placeholder="Search group name"
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-page/70 text-ink-3 border-line border-b text-left text-xs">
                <tr>
                  <th className="px-5 py-3 font-medium">Group</th>
                  <th className="px-5 py-3 font-medium">Created by</th>
                  <th className="px-5 py-3 text-right font-medium">Members</th>
                  <th className="px-5 py-3 text-right font-medium">Expenses</th>
                  <th className="px-5 py-3 font-medium">Last expense</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className={loading && data ? 'opacity-60' : ''}>
                {!data && <SkeletonRows cols={6} />}
                {data?.groups.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-ink-3 px-5 py-12 text-center">
                      {q ? `No group matches "${q}".` : 'No groups here.'}
                    </td>
                  </tr>
                )}
                {data?.groups.map((g) => {
                  const t = groupType(g.type);
                  return (
                    <tr
                      key={g.id}
                      className="border-line hover:bg-page/60 cursor-pointer border-t"
                      onClick={() => router.push(`/groups/${g.id}`)}
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/groups/${g.id}`}
                          className="flex items-center gap-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            aria-hidden
                            className="bg-page text-ink-2 flex size-8 shrink-0 items-center justify-center rounded-lg"
                          >
                            <GroupIcon icon={t.icon} size={16} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-medium">{g.name}</span>
                              {g.deletedAt && <Badge tone="bad">Deleted</Badge>}
                            </span>
                            <span className="text-ink-3 block text-xs">
                              {t.label} · {g.currency}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-ink-2 px-5 py-3">
                        <Link
                          href={`/users/${g.creatorId}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {g.creatorName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {num(g.memberCount)}
                        {g.invitedCount > 0 && (
                          <span
                            className="text-warn ml-1.5 text-xs"
                            title="Invited, not joined yet"
                          >
                            +{num(g.invitedCount)} invited
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{num(g.expenseCount)}</td>
                      <td className="text-ink-2 px-5 py-3">
                        {g.lastActivityAt ? relTime(g.lastActivityAt) : 'none yet'}
                      </td>
                      <td className="text-ink-2 px-5 py-3">{dateOnly(g.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
