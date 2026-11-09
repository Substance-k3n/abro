'use client';

// Audit log (ADR-028): every change an admin made, newest first --
// suspensions, sign-outs, voice switches, role changes -- with who, to
// whom, when, from which IP, and the details (a suspension's reason, a
// role's from -> to). Filter by admin, action or person (?target= from a
// user's page); 50 at a time with "Load more". The log is append-only:
// nothing here can change it. "Download CSV" saves the rows shown.

import { Download, ScrollText, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { useListLoad } from '~/components/list';
import {
  Badge,
  ErrorCard,
  PageHeader,
  Skeleton,
  cleanIp,
  fullDate,
  relTime,
} from '~/components/ui';
import { type AuditEntry, getUser, listAdmins, listAudit } from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { ACTION_LABELS, auditDetail } from '~/lib/audit';

const TONE: Record<string, 'bad' | 'good' | 'accent' | 'warn' | 'neutral'> = {
  'user.suspend': 'bad',
  'user.unsuspend': 'good',
  'user.sessions.revoke_all': 'warn',
  'user.session.revoke': 'warn',
  'admin.role.set': 'accent',
  'admin.role.remove': 'accent',
};

export default function AuditPage() {
  return (
    <Suspense>
      <Audit />
    </Suspense>
  );
}

function Audit() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const actor = params.get('actor') ?? '';
  const action = params.get('action') ?? '';
  const target = params.get('target') ?? '';

  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const { data: admins } = useListLoad(listAdmins, []);
  const { data: targetUser } = useListLoad(
    () => (target ? getUser(target) : Promise.resolve(null)),
    [target],
  );

  const set = (k: 'actor' | 'action' | 'target', v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) {
      p.set(k, v);
    } else {
      p.delete(k);
    }
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const load = useCallback(
    async (after?: string) => {
      try {
        const page = await listAudit({
          actor: actor || undefined,
          action: action || undefined,
          target: target || undefined,
          cursor: after,
        });
        setEntries((prev) => (after && prev ? [...prev, ...page.entries] : page.entries));
        setCursor(page.nextCursor);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load the audit log.");
      }
    },
    [actor, action, target],
  );

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  const filtered = Boolean(actor || action || target);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every change an admin made. Nobody can edit or delete it."
        actions={
          entries && entries.length > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => downloadCsv(entries)}>
              <Download className="size-4" aria-hidden /> Download CSV
            </button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Filter by admin"
          className="input h-9 w-auto min-w-[200px]"
          value={actor}
          onChange={(e) => set('actor', e.target.value)}
        >
          <option value="">Every admin</option>
          {admins?.map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.displayName}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by action"
          className="input h-9 w-auto min-w-[220px]"
          value={action}
          onChange={(e) => set('action', e.target.value)}
        >
          <option value="">Every action</option>
          {Object.entries(ACTION_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {target && (
          <span className="bg-accent-soft text-accent-strong inline-flex h-9 items-center gap-2 rounded-lg pl-3 pr-1.5 text-sm font-medium">
            About {targetUser?.displayName ?? 'one person'}
            <button
              type="button"
              aria-label="Show everyone"
              className="hover:bg-accent/10 rounded p-1"
              onClick={() => set('target', '')}
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
        {filtered && (
          <button
            type="button"
            className="text-ink-3 hover:text-ink text-sm"
            onClick={() => router.replace(pathname)}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && !entries && <ErrorCard message={error} onRetry={() => void load()} />}

      {!error || entries ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-page/70 text-ink-3 border-line border-b text-left text-xs">
                <tr>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Admin</th>
                  <th className="px-5 py-3 font-medium">What</th>
                  <th className="px-5 py-3 font-medium">About</th>
                  <th className="px-5 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {!entries &&
                  Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="border-line border-t">
                      <td colSpan={5} className="px-5 py-3">
                        <Skeleton className="h-6" />
                      </td>
                    </tr>
                  ))}
                {entries?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-ink-3 px-5 py-14 text-center">
                      <ScrollText className="text-line-strong mx-auto mb-2 size-8" aria-hidden />
                      {filtered
                        ? 'Nothing matches these filters.'
                        : 'No admin has changed anything yet.'}
                    </td>
                  </tr>
                )}
                {entries?.map((e) => (
                  <tr key={e.id} className="border-line border-t align-top">
                    <td
                      className="text-ink-2 whitespace-nowrap px-5 py-3"
                      title={fullDate(e.createdAt)}
                    >
                      <div>{relTime(e.createdAt)}</div>
                      <div className="text-ink-3 text-xs">{fullDate(e.createdAt)}</div>
                    </td>
                    <td className="px-5 py-3">
                      {e.actorId ? (
                        <Link href={`/users/${e.actorId}`} className="font-medium hover:underline">
                          {e.actorName ?? e.actorEmail}
                        </Link>
                      ) : (
                        <span className="text-ink-3">A deleted admin</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={TONE[e.action] ?? 'neutral'}>
                        {ACTION_LABELS[e.action] ?? e.action}
                      </Badge>
                      {auditDetail(e) && (
                        <div className="text-ink-2 mt-1 max-w-md text-xs">{auditDetail(e)}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {e.targetType === 'user' && e.targetId ? (
                        <Link href={`/users/${e.targetId}`} className="hover:underline">
                          <div className="font-medium">{e.targetName ?? 'A deleted account'}</div>
                          {e.targetEmail && (
                            <div className="text-ink-3 text-xs">{e.targetEmail}</div>
                          )}
                        </Link>
                      ) : e.targetType === 'setting' ? (
                        <span className="text-ink-2">App setting</span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="text-ink-3 px-5 py-3 font-mono text-xs">
                      {cleanIp(e.ipAddress)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && (
            <div className="border-line border-t px-5 py-3 text-center">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={more}
                onClick={async () => {
                  setMore(true);
                  await load(cursor);
                  setMore(false);
                }}
              >
                {more ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
          {error && entries && (
            <p className="text-bad border-line border-t px-5 py-3 text-sm">{error}</p>
          )}
        </div>
      ) : null}
    </>
  );
}

/** The rows on screen as a CSV file (Excel-safe: quoted, UTF-8 BOM,
 * and cells starting with = + - @ prefixed so they're never formulas). */
function downloadCsv(entries: AuditEntry[]) {
  const cell = (v: string | null | undefined) => {
    let s = v ?? '';
    if (/^[=+\-@]/.test(s)) {
      s = `'${s}`;
    }
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [
    [
      'When (Addis Ababa)',
      'Admin',
      'Admin email',
      'Action',
      'Details',
      'About',
      'About email',
      'IP',
    ],
    ...entries.map((e) => [
      fullDate(e.createdAt),
      e.actorName,
      e.actorEmail,
      ACTION_LABELS[e.action] ?? e.action,
      auditDetail(e),
      e.targetType === 'setting' ? 'App setting' : e.targetName,
      e.targetEmail,
      cleanIp(e.ipAddress),
    ]),
  ];
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `abro-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  // Freed a moment later: revoking at once can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
