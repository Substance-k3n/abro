'use client';

// Group admin dashboard (roadmap P6; no ABRO_FRONTEND_SPEC.md screen).
// One page for a group's admins:
//  - Health: who owes the group (most first) with a Remind button
//    (ADR-018: once per member per group every 24 hours), who is owed,
//    and the suggested payments.
//  - Pending invites: resend (once every 24 hours) or cancel.
//  - Spending: totals, what each person paid vs. their share, spending
//    by category, and the last six months.
//
// Nets and suggested payments are the same derived values every group
// screen uses (~/lib/group-view.tsx, GET /balances/groups/{id}); the
// spending figures are GET /analytics/groups/{id}, where settlements
// count only as "settled", never as spending. Members who aren't admins
// get a short "admins only" note -- the role/remove controls stay on
// Members and Settings, linked from the header.

import { ETB, abs, formatMoney } from '@abro/types';
import { EmptyState } from '@abro/ui';
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock,
  Send,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { PaymentRow } from '~/components/PaymentRow';
import { ApiError } from '~/lib/api-client';
import { type SimplifiedPayment, getSimplifiedPayments } from '~/lib/balances-api';
import {
  type GroupStats,
  INVITE_RESEND_COOLDOWN_MS,
  type PaymentReminder,
  getGroupStats,
  listReminders,
  remindMember,
  resendInvite,
  shortDuration,
} from '~/lib/group-admin-api';
import { type GroupView, GroupViewLoader, PersonAvatar, nameIn } from '~/lib/group-view';
import { type GroupMember, removeGroupMember } from '~/lib/groups-api';

interface AdminData {
  stats: GroupStats | null;
  payments: SimplifiedPayment[];
  reminders: PaymentReminder[];
}

export default function GroupAdminPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<AdminData>({ stats: null, payments: [], reminders: [] });

  // Reminders are admins-only (403 otherwise); a member still gets the
  // page shell and the "admins only" note rather than "Group not found".
  const load = async () => {
    const [stats, payments, reminders] = await Promise.all([
      getGroupStats(params.id),
      getSimplifiedPayments(params.id),
      listReminders(params.id).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          return [];
        }
        throw err;
      }),
    ]);
    setData({ stats, payments, reminders });
  };

  return (
    <GroupViewLoader groupId={params.id} extra={load}>
      {(view, reload) =>
        view.myMembership.role === 'ADMIN' && data.stats ? (
          <Dashboard view={view} data={{ ...data, stats: data.stats }} reload={reload} />
        ) : (
          <NotAdmin view={view} />
        )
      }
    </GroupViewLoader>
  );
}

function Header({ view }: { view: GroupView }) {
  const router = useRouter();
  const { group } = view;
  return (
    <div className="mb-5 flex items-center justify-between gap-2">
      <button
        onClick={() => router.push(`/groups/${group.id}`)}
        className="flex min-w-0 items-center gap-1 text-[0.85rem] font-medium"
        style={{ color: 'var(--accent)' }}
      >
        <ArrowLeft size={16} strokeWidth={2} className="shrink-0" />
        <span className="truncate">{group.name}</span>
      </button>
      <h2
        className="font-display shrink-0 px-2 text-[1.05rem] font-bold"
        style={{ color: 'var(--t-primary)' }}
      >
        Admin dashboard
      </h2>
      <div className="flex shrink-0 gap-2">
        <Link
          href={`/groups/${group.id}/members`}
          aria-label="Members"
          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
        >
          <Users size={17} strokeWidth={2} />
        </Link>
        <Link
          href={`/groups/${group.id}/settings`}
          aria-label="Group settings"
          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
        >
          <Settings size={17} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function NotAdmin({ view }: { view: GroupView }) {
  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <Header view={view} />
      <EmptyState
        icon={<ShieldCheck size={26} strokeWidth={1.5} />}
        title="For group admins"
        description="Only this group's admins can see its dashboard. Ask an admin if you need something changed."
      />
    </div>
  );
}

function Dashboard({
  view,
  data,
  reload,
}: {
  view: GroupView;
  data: { stats: GroupStats; payments: SimplifiedPayment[]; reminders: PaymentReminder[] };
  reload: () => void;
}) {
  const { stats, payments, reminders } = data;
  const { group, nets } = view;
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<GroupMember | null>(null);
  const now = Date.now();

  const owing = [...nets.entries()]
    .filter(([, n]) => n < 0n)
    .sort(([, a], [, b]) => (a < b ? -1 : 1));
  const owed = [...nets.entries()]
    .filter(([, n]) => n > 0n)
    .sort(([, a], [, b]) => (a > b ? -1 : 1));
  const outstanding = owing.reduce((sum, [, n]) => sum + abs(n), 0n);
  const invited = group.members.filter((m) => m.status === 'INVITED');
  const nextReminder = new Map(reminders.map((r) => [r.recipientId, Date.parse(r.nextAllowedAt)]));

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    done: string,
    fallback: string,
  ) => {
    setBusy(key);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      setConfirmCancel(null);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    }
    setBusy(null);
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-5xl md:px-8 md:py-8">
      <Header view={view} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total spent" value={formatMoney(stats.totalSpent, ETB)} />
        <StatTile
          label="Expenses"
          value={String(stats.expenseCount)}
          sub={
            stats.expenseCount > 0
              ? `Avg ${formatMoney(stats.totalSpent / BigInt(stats.expenseCount), ETB)}`
              : undefined
          }
        />
        <StatTile
          label="Still owed"
          value={outstanding === 0n ? 'Nothing' : formatMoney(outstanding, ETB)}
          sub={
            owing.length > 0
              ? `${owing.length} member${owing.length === 1 ? '' : 's'} owe`
              : 'All settled up'
          }
        />
        <StatTile label="Settled so far" value={formatMoney(stats.settledTotal, ETB)} />
      </div>

      {(actionError || notice) && (
        <p
          role={actionError ? 'alert' : 'status'}
          className="mb-4 rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={
            actionError
              ? { background: 'var(--red-bg)', color: 'var(--c-red)' }
              : { background: 'var(--green-bg)', color: 'var(--c-green-text)' }
          }
        >
          {actionError ?? notice}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Who owes" sub="Their balance in this group, biggest first.">
          {owing.length === 0 ? (
            <div
              className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3"
              style={{ background: 'var(--green-bg)', color: 'var(--c-green-text)' }}
            >
              <CheckCircle2 size={18} strokeWidth={2} />
              <span className="text-[0.85rem] font-semibold">
                All settled up. Nobody owes the group.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {owing.map(([userId, net]) => {
                const allowedAt = nextReminder.get(userId) ?? 0;
                const waiting = allowedAt > now;
                const key = `remind:${userId}`;
                return (
                  <div
                    key={userId}
                    className="neo-flat flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
                  >
                    <PersonAvatar view={view} userId={userId} size={36} />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[0.85rem] font-semibold"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        {nameIn(view, userId)}
                      </p>
                      <p
                        className="font-mono text-[0.75rem] font-semibold"
                        style={{ color: 'var(--c-red-text)' }}
                      >
                        owes {formatMoney(abs(net), ETB)}
                      </p>
                    </div>
                    {userId === view.profile.id ? (
                      <span className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                        That&apos;s you
                      </span>
                    ) : waiting ? (
                      <span
                        className="flex items-center gap-1 text-[0.72rem] font-medium"
                        style={{ color: 'var(--t-dim)' }}
                        title={`Reminded. You can remind again in ${shortDuration(allowedAt - now)}.`}
                      >
                        <Clock size={13} strokeWidth={2} /> Reminded · again in{' '}
                        {shortDuration(allowedAt - now)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            key,
                            () => remindMember(group.id, userId),
                            `Reminder sent to ${nameIn(view, userId)}.`,
                            'Could not send the reminder.',
                          )
                        }
                        className="neo-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.78rem] font-semibold disabled:opacity-50"
                        style={{ color: 'var(--accent)' }}
                      >
                        <BellRing size={14} strokeWidth={2} />
                        {busy === key ? 'Sending…' : 'Remind'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {owed.length > 0 && (
            <div className="mt-4">
              <SubHeading>Owed by the group</SubHeading>
              <div className="flex flex-col gap-1.5">
                {owed.map(([userId, net]) => (
                  <div key={userId} className="flex items-center gap-2.5 px-1 py-1">
                    <PersonAvatar view={view} userId={userId} size={28} />
                    <span
                      className="flex-1 truncate text-[0.82rem]"
                      style={{ color: 'var(--t-secondary)' }}
                    >
                      {nameIn(view, userId)}
                    </span>
                    <span
                      className="font-mono text-[0.78rem] font-semibold"
                      style={{ color: 'var(--c-green-text)' }}
                    >
                      +{formatMoney(net, ETB)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {payments.length > 0 && (
            <div className="mt-4">
              <SubHeading>Suggested payments</SubHeading>
              <div className="flex flex-col gap-2">
                {payments.map((p) => (
                  <PaymentRow key={`${p.fromUserId}-${p.toUserId}`} view={view} payment={p} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="Pending invites" sub="People invited who haven't joined yet.">
          {invited.length === 0 ? (
            <p className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
              No pending invites.{' '}
              <Link
                href={`/groups/${group.id}/members`}
                className="font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                Invite someone
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {invited.map((m) => {
                const invitedAt = Date.parse(m.joinedAt);
                const resendAt = invitedAt + INVITE_RESEND_COOLDOWN_MS;
                const canResend = resendAt <= now;
                const key = `resend:${m.userId}`;
                if (confirmCancel?.userId === m.userId) {
                  return (
                    <div key={m.id} className="neo-raised-sm flex flex-col gap-3 rounded-2xl p-3.5">
                      <p className="text-[0.85rem]" style={{ color: 'var(--t-primary)' }}>
                        Cancel the invite for <strong>{nameIn(view, m.userId)}</strong>?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(null)}
                          disabled={busy !== null}
                          className="neo-btn flex-1 rounded-xl px-4 py-2 text-[0.82rem] font-semibold"
                          style={{ color: 'var(--t-secondary)' }}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              `cancel:${m.userId}`,
                              () => removeGroupMember(group.id, m.userId),
                              `Invite for ${nameIn(view, m.userId)} cancelled.`,
                              'Could not cancel the invite.',
                            )
                          }
                          disabled={busy !== null}
                          className="flex-1 rounded-xl px-4 py-2 text-[0.82rem] font-semibold text-white disabled:opacity-50"
                          style={{ background: 'var(--c-red)' }}
                        >
                          {busy === `cancel:${m.userId}` ? 'Cancelling…' : 'Cancel invite'}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={m.id}
                    className="neo-flat flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
                  >
                    <PersonAvatar view={view} userId={m.userId} size={36} />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[0.85rem] font-semibold"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        {nameIn(view, m.userId)}
                      </p>
                      <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                        Invited {shortDuration(now - invitedAt)} ago
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canResend || busy !== null}
                      title={
                        canResend
                          ? 'Send the invite again'
                          : `You can resend in ${shortDuration(resendAt - now)}`
                      }
                      onClick={() =>
                        run(
                          key,
                          () => resendInvite(group.id, m.userId),
                          `Invite sent to ${nameIn(view, m.userId)} again.`,
                          'Could not resend the invite.',
                        )
                      }
                      className="neo-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.75rem] font-semibold disabled:opacity-50"
                      style={{ color: canResend ? 'var(--accent)' : 'var(--t-dim)' }}
                    >
                      <Send size={13} strokeWidth={2} />
                      {busy === key
                        ? 'Sending…'
                        : canResend
                          ? 'Resend'
                          : `In ${shortDuration(resendAt - now)}`}
                    </button>
                    <button
                      type="button"
                      aria-label={`Cancel the invite for ${nameIn(view, m.userId)}`}
                      disabled={busy !== null}
                      onClick={() => {
                        setActionError(null);
                        setNotice(null);
                        setConfirmCancel(m);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ color: 'var(--c-red)' }}
                    >
                      <X size={16} strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Paid vs. share" sub="What each person paid, and their part of the expenses.">
          {stats.members.length === 0 ? (
            <NoSpending />
          ) : (
            <PaidShareChart view={view} stats={stats} />
          )}
        </Card>

        <Card title="By category">
          {stats.categories.length === 0 ? <NoSpending /> : <CategoryChart stats={stats} />}
        </Card>

        <div className="md:col-span-2">
          <Card title="Last 6 months" sub="Spending per month, settlements not included.">
            <TrendChart stats={stats} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="neo-raised-sm rounded-2xl px-4 py-3.5">
      <p className="mb-1 text-[0.72rem] font-medium" style={{ color: 'var(--t-dim)' }}>
        {label}
      </p>
      <p
        className="font-display truncate text-[1.15rem] font-extrabold tracking-tight md:text-[1.3rem]"
        style={{ color: 'var(--t-primary)' }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[0.72rem]" style={{ color: 'var(--t-muted)' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="neo-raised-sm h-full rounded-3xl p-4 md:p-5">
      <h3 className="font-display text-[0.95rem] font-bold" style={{ color: 'var(--t-primary)' }}>
        {title}
      </h3>
      {sub && (
        <p className="mt-0.5 text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
          {sub}
        </p>
      )}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-2 pl-1 text-[0.7rem] font-bold uppercase tracking-[0.06em]"
      style={{ color: 'var(--t-dim)' }}
    >
      {children}
    </p>
  );
}

function NoSpending() {
  return (
    <p className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
      No expenses yet.
    </p>
  );
}

/** Width of `value` as a share of `max`, for a bar. A non-zero value
 * always shows at least a sliver. */
function barPercent(value: bigint, max: bigint): string {
  if (max <= 0n || value <= 0n) {
    return '0%';
  }
  return `${Math.max(1.5, (Number(value) / Number(max)) * 100)}%`;
}

function Bar({ width, color, label }: { width: string; color: string; label: string }) {
  return (
    <div className="h-2" title={label}>
      <div className="h-full rounded-r-[4px]" style={{ width, background: color }} />
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-3 flex gap-4 text-[0.72rem]" style={{ color: 'var(--t-muted)' }}>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-1)' }} /> Paid
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-2)' }} /> Share
      </span>
    </div>
  );
}

function PaidShareChart({ view, stats }: { view: GroupView; stats: GroupStats }) {
  const max = stats.members.reduce((m, s) => (s.paid > m ? s.paid : s.share > m ? s.share : m), 0n);
  return (
    <div>
      <Legend />
      <div className="flex flex-col gap-3.5">
        {stats.members.map((m) => {
          const name = nameIn(view, m.userId);
          return (
            <div key={m.userId}>
              <div className="mb-1.5 flex items-center gap-2">
                <PersonAvatar view={view} userId={m.userId} size={22} />
                <span
                  className="flex-1 truncate text-[0.8rem] font-medium"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  {name}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-[2px]">
                <Bar
                  width={barPercent(m.paid, max)}
                  color="var(--viz-1)"
                  label={`${name} paid ${formatMoney(m.paid, ETB)}`}
                />
                <span className="font-mono text-[0.7rem]" style={{ color: 'var(--t-secondary)' }}>
                  {formatMoney(m.paid, ETB)}
                </span>
                <Bar
                  width={barPercent(m.share, max)}
                  color="var(--viz-2)"
                  label={`${name}'s share ${formatMoney(m.share, ETB)}`}
                />
                <span className="font-mono text-[0.7rem]" style={{ color: 'var(--t-muted)' }}>
                  {formatMoney(m.share, ETB)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>What each person paid and their share</caption>
        <thead>
          <tr>
            <th>Person</th>
            <th>Paid</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {stats.members.map((m) => (
            <tr key={m.userId}>
              <td>{nameIn(view, m.userId)}</td>
              <td>{formatMoney(m.paid, ETB)}</td>
              <td>{formatMoney(m.share, ETB)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryChart({ stats }: { stats: GroupStats }) {
  const max = stats.categories[0]?.amount ?? 0n;
  return (
    <div className="flex flex-col gap-3">
      {stats.categories.map((c) => {
        const percent =
          stats.totalSpent > 0n
            ? Math.round((Number(c.amount) / Number(stats.totalSpent)) * 100)
            : 0;
        return (
          <div key={c.category}>
            <div className="mb-1 flex items-baseline gap-2">
              <span
                className="flex-1 truncate text-[0.8rem] font-medium"
                style={{ color: 'var(--t-secondary)' }}
              >
                {c.category}
              </span>
              <span className="font-mono text-[0.72rem]" style={{ color: 'var(--t-secondary)' }}>
                {formatMoney(c.amount, ETB)}
              </span>
              <span className="w-9 text-right text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
                {percent}%
              </span>
            </div>
            <Bar
              width={barPercent(c.amount, max)}
              color="var(--viz-1)"
              label={`${c.category}: ${formatMoney(c.amount, ETB)} (${percent}%)`}
            />
          </div>
        );
      })}
    </div>
  );
}

function monthLabel(year: number, month: number, style: 'short' | 'long'): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

function TrendChart({ stats }: { stats: GroupStats }) {
  const [hover, setHover] = useState<number | null>(null);
  const months = stats.monthlyTrend;
  const max = months.reduce((m, x) => (x.total > m ? x.total : m), 0n);
  const latest = months.length - 1;
  // Direct labels only on the latest month and the biggest one; every
  // month's value is in the tooltip and the table.
  const labelled = new Set([latest, months.findIndex((m) => max > 0n && m.total === max)]);

  return (
    <div>
      <div
        className="relative flex h-40 items-end gap-2 border-b md:gap-4"
        style={{ borderColor: 'var(--border-med)' }}
        onMouseLeave={() => setHover(null)}
      >
        {months.map((m, i) => {
          const label = `${monthLabel(m.year, m.month, 'long')}: ${formatMoney(m.total, ETB)}`;
          const height =
            max > 0n && m.total > 0n ? Math.max(3, (Number(m.total) / Number(max)) * 100) : 0;
          return (
            <button
              key={`${m.year}-${m.month}`}
              type="button"
              aria-label={label}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
            >
              {(hover === i || (hover === null && labelled.has(i))) && m.total > 0n && (
                <span
                  className="mb-1 whitespace-nowrap font-mono text-[0.68rem] font-semibold"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  {formatMoney(m.total, ETB)}
                </span>
              )}
              <span
                className="w-full max-w-[56px] rounded-t-[4px] transition-opacity"
                style={{
                  height: `${height}%`,
                  background: 'var(--viz-1)',
                  opacity: hover === null || hover === i ? 1 : 0.45,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2 md:gap-4">
        {months.map((m, i) => (
          <span
            key={`${m.year}-${m.month}`}
            className="flex-1 text-center text-[0.7rem]"
            style={{ color: i === latest ? 'var(--t-secondary)' : 'var(--t-dim)' }}
          >
            {monthLabel(m.year, m.month, 'short')}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Spending per month</caption>
        <tbody>
          {months.map((m) => (
            <tr key={`${m.year}-${m.month}`}>
              <td>{monthLabel(m.year, m.month, 'long')}</td>
              <td>{formatMoney(m.total, ETB)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
