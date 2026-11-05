'use client';

// One person (ADR-028): who they are, what they have in ABRO as counts,
// where they're signed in, their groups, voice, and what admins have done
// to their account. The actions -- suspend / unsuspend, sign out
// everywhere or on one device, voice on / off -- each confirm in a dialog
// first, and each is logged by the API. Never their balances, expenses or
// receipts.

import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  LogOut,
  Mic,
  MicOff,
  MonitorSmartphone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Modal } from '~/components/Modal';
import {
  Avatar,
  Badge,
  ErrorCard,
  Skeleton,
  cleanIp,
  dateOnly,
  deviceName,
  fullDate,
  num,
  relTime,
} from '~/components/ui';
import {
  type AdminSession,
  type AuditEntry,
  type UserDetail,
  type VoiceAccess,
  endAllSessions,
  endSession,
  getUser,
  listAudit,
  suspendUser,
  unsuspendUser,
  voiceOff,
  voiceOn,
} from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { ACTION_LABELS, auditDetail } from '~/lib/audit';
import { ROLE_LABEL, useSession, whyCantActOn } from '~/lib/session';

type Dialog =
  | { kind: 'suspend' }
  | { kind: 'unsuspend' }
  | { kind: 'end-all' }
  | { kind: 'end-one'; session: AdminSession }
  | { kind: 'voice-on' }
  | { kind: 'voice-off' };

const VOICE_TEXT: Record<VoiceAccess, string> = {
  unavailable: "Voice isn't set up on the server.",
  off: 'Voice is switched off for everyone.',
  everyone: 'Has voice: it is on for everyone.',
  tester: 'Has voice: listed in VOICE_TESTERS on the server.',
  granted: 'Has voice: an admin turned it on.',
  none: 'No voice.',
};

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [log, setLog] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLog = useCallback(async () => {
    if (!session.can('audit.view')) {
      return;
    }
    try {
      setLog((await listAudit({ target: id })).entries.slice(0, 8));
    } catch {
      setLog([]);
    }
  }, [id, session]);

  const load = useCallback(async () => {
    try {
      setUser(await getUser(id));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this person.");
    }
    void loadLog();
  }, [id, loadLog]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  /** Runs an action; its answer is the person's fresh detail. */
  const act = async (fn: () => Promise<UserDetail>, done: string) => {
    const fresh = await fn();
    setUser(fresh);
    setDialog(null);
    setNotice(done);
    void loadLog();
  };

  if (error && !user) {
    return (
      <>
        <BackLink />
        <ErrorCard message={error} onRetry={() => void load()} />
      </>
    );
  }
  if (!user) {
    return (
      <>
        <BackLink />
        <Skeleton className="mb-6 h-40" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </>
    );
  }

  const blocked = whyCantActOn(session, user);
  const canSuspend = session.can('users.suspend');
  const canSessions = session.can('users.sessions');
  const canVoice = session.can('voice.manage');
  const live = user.sessions.filter((s) => s.live);

  return (
    <>
      <BackLink />

      {notice && (
        <div
          role="status"
          className="bg-good-soft text-good mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          <CheckCircle2 className="size-4" aria-hidden /> {notice}
        </div>
      )}

      {user.suspendedAt && (
        <div className="bg-bad-soft text-bad border-bad/20 mb-4 flex items-start gap-3 rounded-xl border px-5 py-4">
          <Ban className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="text-sm">
            <div className="font-semibold">Suspended {fullDate(user.suspendedAt)}</div>
            <div className="mt-0.5">Reason: {user.suspensionReason ?? '—'}</div>
            <div className="mt-0.5 opacity-80">
              They can&apos;t sign in until an admin unsuspends them.
            </div>
          </div>
        </div>
      )}

      <section className="card mb-6 flex flex-wrap items-start justify-between gap-6 p-6">
        <div className="flex min-w-0 items-center gap-5">
          <Avatar name={user.displayName} url={user.avatarUrl} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display truncate text-2xl font-semibold">{user.displayName}</h1>
              {user.suspendedAt ? (
                <Badge tone="bad">Suspended</Badge>
              ) : (
                <Badge tone="good">Active</Badge>
              )}
              {user.adminRole && (
                <Badge tone="accent">
                  <ShieldCheck className="size-3" aria-hidden />
                  {ROLE_LABEL[user.adminRole]}
                  {user.owner ? ' · owner' : ''}
                </Badge>
              )}
            </div>
            <div className="text-ink-2 mt-1 text-sm">
              {user.username ? `@${user.username}` : 'No username yet'} · {user.email ?? 'no email'}
            </div>
            <div className="text-ink-3 mt-1 text-xs">
              Joined {dateOnly(user.createdAt)} · Last active {relTime(user.lastActiveAt)}
            </div>
          </div>
        </div>

        {(canSuspend || canSessions) && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              {canSessions && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!!blocked || live.length === 0}
                  title={blocked ?? (live.length === 0 ? 'No live sessions' : undefined)}
                  onClick={() => setDialog({ kind: 'end-all' })}
                >
                  <LogOut className="size-4" aria-hidden /> Sign out everywhere
                </button>
              )}
              {canSuspend &&
                (user.suspendedAt ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!!blocked}
                    title={blocked ?? undefined}
                    onClick={() => setDialog({ kind: 'unsuspend' })}
                  >
                    <CheckCircle2 className="size-4" aria-hidden /> Unsuspend
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!!blocked}
                    title={blocked ?? undefined}
                    onClick={() => setDialog({ kind: 'suspend' })}
                  >
                    <Ban className="size-4" aria-hidden /> Suspend
                  </button>
                ))}
            </div>
            {blocked && <p className="text-ink-3 max-w-xs text-right text-xs">{blocked}</p>}
          </div>
        )}
      </section>

      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Counts">
        <Count label="Groups" value={user.groupCount} />
        <Count label="Friends" value={user.friendCount} />
        <Count label="Expenses" value={user.expenseCount} />
        <Count label="Payments" value={user.settlementCount} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card overflow-hidden">
            <header className="border-line flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-display flex items-center gap-2 font-semibold">
                <MonitorSmartphone className="text-ink-3 size-4" aria-hidden /> Sessions
              </h2>
              <span className="text-ink-3 text-sm">{num(live.length)} signed in</span>
            </header>
            {user.sessions.length === 0 ? (
              <p className="text-ink-3 px-5 py-8 text-center text-sm">Never signed in.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-ink-3 text-left text-xs">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Device</th>
                    <th className="px-5 py-2.5 font-medium">IP address</th>
                    <th className="px-5 py-2.5 font-medium">Last used</th>
                    <th className="px-5 py-2.5 font-medium">Started</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {user.sessions.map((s) => (
                    <tr key={s.id} className="border-line border-t">
                      <td className="px-5 py-3">
                        <div className="font-medium" title={s.userAgent ?? undefined}>
                          {deviceName(s.userAgent)}
                        </div>
                        <div className="mt-0.5">
                          {s.live ? (
                            <Badge tone="good">Signed in</Badge>
                          ) : s.revokedAt ? (
                            <Badge>Ended {relTime(s.revokedAt)}</Badge>
                          ) : (
                            <Badge>Expired</Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-ink-2 px-5 py-3 font-mono text-xs">
                        {cleanIp(s.ipAddress)}
                      </td>
                      <td className="text-ink-2 px-5 py-3" title={fullDate(s.lastUsedAt)}>
                        {relTime(s.lastUsedAt)}
                      </td>
                      <td className="text-ink-2 px-5 py-3">{dateOnly(s.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {s.live && canSessions && !blocked && (
                          <button
                            type="button"
                            className="text-bad text-sm font-medium hover:underline"
                            onClick={() => setDialog({ kind: 'end-one', session: s })}
                          >
                            End
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card overflow-hidden">
            <header className="border-line flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-display flex items-center gap-2 font-semibold">
                <Users className="text-ink-3 size-4" aria-hidden /> Groups
              </h2>
              <span className="text-ink-3 text-sm">Names and sizes only</span>
            </header>
            {user.groups.length === 0 ? (
              <p className="text-ink-3 px-5 py-8 text-center text-sm">Not in any group.</p>
            ) : (
              <ul>
                {user.groups.map((g) => (
                  <li
                    key={g.id}
                    className="border-line flex items-center justify-between gap-4 border-t px-5 py-3 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{g.name}</div>
                      <div className="text-ink-3 text-xs">
                        {g.type.charAt(0) + g.type.slice(1).toLowerCase()} · {num(g.memberCount)}{' '}
                        {g.memberCount === 1 ? 'member' : 'members'} · since {dateOnly(g.joinedAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {g.deleted && <Badge tone="bad">Deleted</Badge>}
                      {g.status === 'INVITED' && <Badge tone="warn">Invited</Badge>}
                      {g.status === 'LEFT' && <Badge>Left</Badge>}
                      {g.role === 'ADMIN' && g.status === 'ACTIVE' && (
                        <Badge tone="accent">Group admin</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-display mb-3 flex items-center gap-2 font-semibold">
              <Mic className="text-ink-3 size-4" aria-hidden /> Voice
            </h2>
            <p className="text-sm">{VOICE_TEXT[user.voice.access]}</p>
            <dl className="text-ink-2 mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-3">Last used</dt>
                <dd>{relTime(user.voice.lastUsedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Sessions, 30 days</dt>
                <dd className="tabular-nums">{num(user.voice.sessions30d)}</dd>
              </div>
            </dl>
            {canVoice && (
              <div className="mt-4">
                {user.voice.grantedAt ? (
                  <button
                    type="button"
                    className="btn btn-ghost w-full"
                    onClick={() => setDialog({ kind: 'voice-off' })}
                  >
                    <MicOff className="size-4" aria-hidden /> Turn voice off
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost w-full"
                    disabled={!!user.suspendedAt || user.voice.access === 'unavailable'}
                    title={user.suspendedAt ? 'Unsuspend them first' : undefined}
                    onClick={() => setDialog({ kind: 'voice-on' })}
                  >
                    <Mic className="size-4" aria-hidden /> Turn voice on
                  </button>
                )}
                {user.voice.access === 'tester' && !user.voice.grantedAt && (
                  <p className="text-ink-3 mt-2 text-xs">
                    To take voice away from a tester, remove them from VOICE_TESTERS on Render.
                  </p>
                )}
              </div>
            )}
          </section>

          {session.can('audit.view') && (
            <section className="card p-5">
              <h2 className="font-display mb-3 font-semibold">Admin actions on this account</h2>
              {log === null ? (
                <Skeleton className="h-16" />
              ) : log.length === 0 ? (
                <p className="text-ink-3 text-sm">None yet.</p>
              ) : (
                <ol className="space-y-3">
                  {log.map((e) => (
                    <li key={e.id} className="text-sm">
                      <div className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</div>
                      {auditDetail(e) && <div className="text-ink-2">{auditDetail(e)}</div>}
                      <div className="text-ink-3 text-xs" title={fullDate(e.createdAt)}>
                        by {e.actorName ?? 'a deleted admin'} · {relTime(e.createdAt)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          <p className="text-ink-3 px-1 text-xs">
            Admins see counts and account facts only, never anyone&apos;s balances, expenses or
            receipts.
          </p>
        </div>
      </div>

      {dialog && (
        <ActionDialog
          dialog={dialog}
          user={user}
          onClose={() => setDialog(null)}
          onSuspend={(reason) =>
            act(() => suspendUser(user.id, reason), 'Account suspended and signed out everywhere.')
          }
          onUnsuspend={() =>
            act(() => unsuspendUser(user.id), 'Account unsuspended. They can sign in again.')
          }
          onEndAll={() => act(() => endAllSessions(user.id), 'Signed out on every device.')}
          onEndOne={(s) =>
            act(() => endSession(user.id, s.id), `Ended the session on ${deviceName(s.userAgent)}.`)
          }
          onVoiceOn={() => act(() => voiceOn(user.id), 'Voice turned on.')}
          onVoiceOff={() => act(() => voiceOff(user.id), 'Voice turned off.')}
        />
      )}
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/users"
      className="text-ink-3 hover:text-ink mb-5 inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeft className="size-4" aria-hidden /> Users
    </Link>
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

function ActionDialog({
  dialog,
  user,
  onClose,
  onSuspend,
  onUnsuspend,
  onEndAll,
  onEndOne,
  onVoiceOn,
  onVoiceOff,
}: {
  dialog: Dialog;
  user: UserDetail;
  onClose: () => void;
  onSuspend: (reason: string) => Promise<void>;
  onUnsuspend: () => Promise<void>;
  onEndAll: () => Promise<void>;
  onEndOne: (s: AdminSession) => Promise<void>;
  onVoiceOn: () => Promise<void>;
  onVoiceOff: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = user.sessions.filter((s) => s.live).length;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Try again.');
      setBusy(false);
    }
  };

  const name = user.displayName;
  const spec = {
    suspend: {
      title: `Suspend ${name}?`,
      body: (
        <>
          <p>
            They&apos;ll be signed out on every device{live ? ` (${live} now)` : ''} and can&apos;t
            sign in until an admin unsuspends them. Their groups, expenses and balances stay as they
            are.
          </p>
          <label htmlFor="reason" className="label mt-4 block">
            Reason (required, shown in the audit log)
          </label>
          <textarea
            id="reason"
            className="input mt-1.5 h-24 resize-none py-2"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Reported for sending spam invites"
          />
          <div className="text-ink-3 mt-1 text-right text-xs">{reason.length}/500</div>
        </>
      ),
      confirm: 'Suspend account',
      tone: 'btn-danger',
      disabled: !reason.trim(),
      go: () => onSuspend(reason.trim()),
    },
    unsuspend: {
      title: `Unsuspend ${name}?`,
      body: <p>They&apos;ll be able to sign in again. Nothing else changes.</p>,
      confirm: 'Unsuspend',
      tone: 'btn-primary',
      disabled: false,
      go: onUnsuspend,
    },
    'end-all': {
      title: `Sign ${name} out everywhere?`,
      body: (
        <p>
          Ends {live} live {live === 1 ? 'session' : 'sessions'}. They can sign straight back in. To
          stop that, suspend the account instead.
        </p>
      ),
      confirm: 'Sign out everywhere',
      tone: 'btn-danger',
      disabled: false,
      go: onEndAll,
    },
    'end-one': {
      title: 'End this session?',
      body:
        dialog.kind === 'end-one' ? (
          <p>
            Signs {name} out on <strong>{deviceName(dialog.session.userAgent)}</strong>
            {dialog.session.ipAddress ? ` (${cleanIp(dialog.session.ipAddress)})` : ''}, last used{' '}
            {relTime(dialog.session.lastUsedAt)}.
          </p>
        ) : null,
      confirm: 'End session',
      tone: 'btn-danger',
      disabled: false,
      go: () => (dialog.kind === 'end-one' ? onEndOne(dialog.session) : Promise.resolve()),
    },
    'voice-on': {
      title: `Turn voice on for ${name}?`,
      body: (
        <p>They&apos;ll see the voice button the next time ABRO opens. Voice uses speech credit.</p>
      ),
      confirm: 'Turn voice on',
      tone: 'btn-primary',
      disabled: false,
      go: onVoiceOn,
    },
    'voice-off': {
      title: `Turn voice off for ${name}?`,
      body: (
        <p>
          The voice button goes away the next time ABRO opens.
          {user.voice.access === 'tester'
            ? ' They stay a tester through VOICE_TESTERS, so they keep voice.'
            : ''}
        </p>
      ),
      confirm: 'Turn voice off',
      tone: 'btn-danger',
      disabled: false,
      go: onVoiceOff,
    },
  }[dialog.kind];

  return (
    <Modal
      title={spec.title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${spec.tone}`}
            disabled={busy || spec.disabled}
            onClick={() => void run(spec.go)}
          >
            {busy ? 'Working…' : spec.confirm}
          </button>
        </>
      }
    >
      {spec.body}
      {error && (
        <p role="alert" className="bg-bad-soft text-bad mt-4 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </Modal>
  );
}
