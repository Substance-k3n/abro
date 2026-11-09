'use client';

// Dashboard (ADR-028): how ABRO is doing over 7, 30 or 90 Addis Ababa
// days, from GET /admin/overview. Headline tiles, a queue of what's
// waiting on someone (open now, whatever the range; "stale" = over 7
// days), daily activity, and where the spending goes. All app-wide: no
// one person's money appears anywhere.

import { formatMoney } from '@abro/types';
import { Clock, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { ActivityChart, BarList } from '~/components/charts';
import { ErrorCard, PageHeader, Segmented, Skeleton, num } from '~/components/ui';
import { type Overview, type OverviewDay, type OverviewRange, getOverview } from '~/lib/admin-api';
import { ApiError } from '~/lib/api';

const RANGES: { value: OverviewRange; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

const SERIES: { key: keyof Omit<OverviewDay, 'day'>; label: string; unit: [string, string] }[] = [
  { key: 'expenses', label: 'Expenses', unit: ['expense', 'expenses'] },
  { key: 'settlements', label: 'Payments', unit: ['payment', 'payments'] },
  { key: 'signups', label: 'Sign-ups', unit: ['sign-up', 'sign-ups'] },
];

const REFRESH_MS = 60_000;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const money = (total: bigint, code: string) =>
  formatMoney(total, { code, symbol: code, nativeSymbol: code, decimalDigits: 2 });

function useAgo(at: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);
  if (at === null) {
    return '';
  }
  const s = Math.round((Date.now() - at) / 1000);
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

export default function DashboardPage() {
  const [range, setRange] = useState<OverviewRange>(30);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [series, setSeries] = useState<(typeof SERIES)[number]['key']>('expenses');
  const ago = useAgo(at);

  const load = useCallback(async (r: OverviewRange) => {
    setLoading(true);
    try {
      const o = await getOverview(r);
      setData(o);
      setError(null);
      setAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
    // Quietly fresh while the tab is open and visible.
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(range);
      }
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [range, load]);

  const shown = data && data.rangeDays === range ? data : null;
  const s = SERIES.find((x) => x.key === series) ?? SERIES[0]!;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={at ? `Updated ${ago}` : 'Loading…'}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void load(range)}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </button>
            <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
          </>
        }
      />

      {error && !shown && <ErrorCard message={error} onRetry={() => void load(range)} />}
      {error && shown && (
        <p className="text-warn mb-4 text-sm" role="status">
          Couldn&apos;t refresh just now: {error} Showing the last numbers.
        </p>
      )}

      {!shown && !error && <DashboardSkeleton />}

      {shown && (
        <div className="space-y-6">
          <section
            className="grid grid-cols-2 gap-4 lg:grid-cols-5 [&>:last-child]:col-span-2 lg:[&>:last-child]:col-span-1"
            aria-label="Headline numbers"
          >
            <Tile label="People" value={shown.users.total} sub={`+${num(shown.users.new)} new`} />
            <Tile
              label="Active"
              value={shown.users.active}
              sub={`signed in during ${range} days`}
            />
            <Tile label="Groups" value={shown.groups.total} sub={`+${num(shown.groups.new)} new`} />
            <Tile label="Expenses added" value={shown.activity.expenses} sub={`in ${range} days`} />
            <Tile
              label="Payments settled"
              value={shown.activity.settlements}
              sub={`in ${range} days`}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-12">
            <Queue o={shown} />
            <div className="card p-6 xl:col-span-7">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Activity</h2>
                  <p className="text-ink-3 text-sm">
                    Per day, last {range} days (Addis Ababa time)
                  </p>
                </div>
                <Segmented
                  label="Series"
                  value={series}
                  onChange={setSeries}
                  options={SERIES.map((x) => ({ value: x.key, label: x.label }))}
                />
              </div>
              <ActivityChart
                points={shown.series.map((d) => ({ day: d.day, value: d[s.key] }))}
                unit={s.unit}
              />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold">Spending</h2>
              <p className="text-ink-3 mb-5 text-sm">
                All expenses in range, whole app, per currency
              </p>
              {shown.volume.length ? (
                <ul className="space-y-4">
                  {shown.volume.map((v) => (
                    <li key={v.currency}>
                      <div className="font-display text-2xl font-semibold tabular-nums">
                        {money(v.total, v.currency)}
                      </div>
                      <div className="text-ink-3 text-sm">
                        across {num(v.expenses)} {v.expenses === 1 ? 'expense' : 'expenses'}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3 py-6 text-center text-sm">No expenses in this range.</p>
              )}
              <p className="text-ink-3 border-line mt-5 border-t pt-4 text-xs">
                Payments between people aren&apos;t spending and aren&apos;t counted.
              </p>
            </div>
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold">Expenses by category</h2>
              <p className="text-ink-3 mb-5 text-sm">Number of expenses in range</p>
              <BarList
                empty="No expenses in this range."
                rows={shown.categories.slice(0, 8).map((c) => ({
                  key: c.category,
                  label: titleCase(c.category),
                  value: c.expenses,
                }))}
              />
            </div>
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold">Groups by type</h2>
              <p className="text-ink-3 mb-5 text-sm">All live groups</p>
              <BarList
                empty="No groups yet."
                rows={shown.groupTypes.map((g) => ({
                  key: g.type,
                  label: titleCase(g.type),
                  value: g.groups,
                }))}
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="card border-t-accent border-t-[3px] p-5">
      <div className="text-ink-2 text-sm">{label}</div>
      <div className="font-display mt-2 text-3xl font-semibold tabular-nums">{num(value)}</div>
      <div className="text-ink-3 mt-1 text-xs">{sub}</div>
    </div>
  );
}

function Queue({ o }: { o: Overview }) {
  const rows = [
    {
      label: 'Disputed shares',
      hint: 'Someone said "I wasn\'t part of this"',
      count: o.queue.openDisputes,
      stale: 0,
    },
    {
      label: 'Payments to confirm',
      hint: 'Recorded by the payer, waiting for the person paid',
      count: o.queue.pendingConfirmations,
      stale: o.queue.staleConfirmations,
    },
    {
      label: 'Group invites',
      hint: 'Not accepted yet',
      count: o.queue.pendingInvites,
      stale: o.queue.staleInvites,
    },
    {
      label: 'Suspended accounts',
      hint: "Can't sign in",
      count: o.users.suspended,
      stale: 0,
    },
  ];
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-6 xl:col-span-5">
      <h2 className="font-display text-lg font-semibold">Waiting on someone</h2>
      <p className="text-ink-3 mb-5 text-sm">Open right now, whatever the range</p>
      <ul className="space-y-5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-ink-3 truncate text-xs" title={r.hint}>
                  {r.hint}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.stale > 0 && (
                  <span className="bg-warn-soft text-warn inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                    <Clock className="size-3" aria-hidden />
                    {num(r.stale)} over 7 days
                  </span>
                )}
                <span className="font-display w-10 text-right text-lg font-semibold tabular-nums">
                  {num(r.count)}
                </span>
              </div>
            </div>
            <div className="bg-page mt-2 h-1.5 rounded-full">
              <div
                className="bg-ink-2 h-1.5 rounded-full"
                style={{ width: r.count ? `${Math.max(3, (r.count / max) * 100)}%` : '0%' }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 [&>:last-child]:col-span-2 lg:[&>:last-child]:col-span-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[118px]" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[380px] xl:col-span-5" />
        <Skeleton className="h-[380px] xl:col-span-7" />
      </div>
    </div>
  );
}
