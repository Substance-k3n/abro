'use client';

// One group (ADR-028): what it is, how busy it is, and who's in it --
// active members first, then invites and people who left. No balances,
// expense names or amounts: those stay between the group's members.

import { ArrowLeft, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { useListLoad } from '~/components/list';
import {
  Avatar,
  Badge,
  ErrorCard,
  Skeleton,
  dateOnly,
  fullDate,
  num,
  relTime,
} from '~/components/ui';
import { getGroup } from '~/lib/admin-api';
import { groupType } from '~/lib/groups';

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const { data: g, error, retry } = useListLoad(() => getGroup(id), [id]);

  const back = (
    <Link
      href="/groups"
      className="text-ink-3 hover:text-ink mb-5 inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeft className="size-4" aria-hidden /> Groups
    </Link>
  );
  if (error && !g) {
    return (
      <>
        {back}
        <ErrorCard message={error} onRetry={retry} />
      </>
    );
  }
  if (!g) {
    return (
      <>
        {back}
        <Skeleton className="mb-6 h-36" />
        <Skeleton className="h-64" />
      </>
    );
  }

  const t = groupType(g.type);
  const active = g.members.filter((m) => m.status === 'ACTIVE').length;
  const invited = g.members.filter((m) => m.status === 'INVITED').length;

  return (
    <>
      {back}

      {g.deletedAt && (
        <div className="bg-bad-soft text-bad mb-4 rounded-xl px-5 py-3 text-sm font-medium">
          Deleted {fullDate(g.deletedAt)}. Its members no longer see it.
        </div>
      )}

      <section className="card mb-6 flex flex-wrap items-start gap-5 p-6">
        <span
          aria-hidden
          className="bg-page flex size-16 shrink-0 items-center justify-center rounded-2xl text-3xl"
        >
          {t.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold">{g.name}</h1>
          <div className="text-ink-2 mt-1 text-sm">
            {t.label} · {g.currency} · created {dateOnly(g.createdAt)} by{' '}
            <Link
              href={`/users/${g.creatorId}`}
              className="text-accent font-medium hover:underline"
            >
              {g.creatorName}
            </Link>
          </div>
          {g.description && <p className="text-ink-2 mt-3 max-w-2xl text-sm">{g.description}</p>}
        </div>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Counts">
        <Count label="Members" value={active} />
        <Count label="Invited" value={invited} />
        <Count label="Expenses" value={g.expenseCount} />
        <div className="card p-5">
          <div className="text-ink-2 text-sm">Last expense</div>
          <div className="font-display mt-1 text-2xl font-semibold">
            {g.lastActivityAt ? relTime(g.lastActivityAt) : '—'}
          </div>
          <div className="text-ink-3 text-xs">{num(g.settlementCount)} payments settled</div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="border-line flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display flex items-center gap-2 font-semibold">
            <Users className="text-ink-3 size-4" aria-hidden /> Members
          </h2>
          <span className="text-ink-3 text-sm">Balances stay private to the group</span>
        </header>
        <table className="w-full text-sm">
          <thead className="text-ink-3 text-left text-xs">
            <tr>
              <th className="px-5 py-2.5 font-medium">Person</th>
              <th className="px-5 py-2.5 font-medium">Email</th>
              <th className="px-5 py-2.5 font-medium">In the group</th>
              <th className="px-5 py-2.5 font-medium">Since</th>
            </tr>
          </thead>
          <tbody>
            {g.members.map((m) => (
              <tr key={m.userId} className="border-line border-t">
                <td className="px-5 py-3">
                  <Link
                    href={`/users/${m.userId}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <Avatar name={m.displayName} url={m.avatarUrl} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.displayName}</span>
                      {m.username && (
                        <span className="text-ink-3 block text-xs">@{m.username}</span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="text-ink-2 px-5 py-3">{m.email ?? '—'}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {m.status === 'ACTIVE' && m.role === 'ADMIN' && (
                      <Badge tone="accent">Group admin</Badge>
                    )}
                    {m.status === 'ACTIVE' && m.role === 'MEMBER' && <Badge>Member</Badge>}
                    {m.status === 'INVITED' && <Badge tone="warn">Invited</Badge>}
                    {m.status === 'LEFT' && <Badge>Left</Badge>}
                    {m.suspendedAt && <Badge tone="bad">Suspended</Badge>}
                  </div>
                </td>
                <td className="text-ink-2 px-5 py-3">{dateOnly(m.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <div className="text-ink-2 text-sm">{label}</div>
      <div className="font-display mt-1 text-2xl font-semibold tabular-nums">{num(value)}</div>
    </div>
  );
}
