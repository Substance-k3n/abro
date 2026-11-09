'use client';

// Security (ADR-028): this sign-in (when it started and ends), your own
// sessions in ABRO and this portal -- end any but this one, or all the
// others at once -- and the rules that protect the portal. Every admin
// can manage their own sessions; each change is in the audit log.

import {
  CheckCircle2,
  Clock,
  Crown,
  Lock,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Modal } from '~/components/Modal';
import {
  Badge,
  ErrorCard,
  PageHeader,
  Skeleton,
  cleanIp,
  dateOnly,
  deviceName,
  fullDate,
  relTime,
} from '~/components/ui';
import {
  type OwnSession,
  endMyOtherSessions,
  endMySession,
  mySessions,
  signOut,
} from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { ROLE_LABEL, useSession } from '~/lib/session';

type Dialog = { kind: 'one'; s: OwnSession } | { kind: 'others'; count: number };

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Addis_Ababa',
});

export default function SecurityPage() {
  const me = useSession();
  const router = useRouter();
  const [sessions, setSessions] = useState<OwnSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions(await mySessions());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your sessions.");
    }
  }, []);
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

  const others = sessions?.filter((s) => s.live && !s.current) ?? [];
  const ends = new Date(me.session.endsAt);

  return (
    <>
      <PageHeader
        title="Security"
        subtitle="Your sign-in, your sessions, and how the portal is protected."
      />

      {notice && (
        <div
          role="status"
          className="bg-good-soft text-good mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          <CheckCircle2 className="size-4" aria-hidden /> {notice}
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="font-display mb-3 flex items-center gap-2 font-semibold">
            <ShieldCheck className="text-ink-3 size-4" aria-hidden /> You
          </h2>
          <div className="font-medium">{me.profile.displayName}</div>
          <div className="text-ink-3 text-sm">{me.profile.email}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="accent">{ROLE_LABEL[me.role]}</Badge>
            {me.owner && (
              <Badge tone="dark">
                <Crown className="size-3" aria-hidden /> Owner
              </Badge>
            )}
          </div>
          <p className="text-ink-3 mt-3 text-xs">
            {me.owner
              ? 'You are an owner through ADMIN_EMAILS on Render. Nobody can change your role here.'
              : 'Your role was given in Roles & Permissions and can be changed there by someone above you.'}
          </p>
        </section>

        <section className="card p-5">
          <h2 className="font-display mb-3 flex items-center gap-2 font-semibold">
            <Clock className="text-ink-3 size-4" aria-hidden /> This sign-in
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Started</dt>
              <dd>{fullDate(me.session.startedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Ends at the latest</dt>
              <dd className="font-medium">
                {timeFmt.format(ends)}
                {dateOnly(me.session.endsAt) !== dateOnly(new Date().toISOString())
                  ? `, ${dateOnly(me.session.endsAt)}`
                  : ' today'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Signs out when idle for</dt>
              <dd>{me.session.idleMinutes} minutes</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn btn-ghost mt-4 w-full"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              await signOut().catch(() => {});
              router.replace('/signin');
            }}
          >
            <LogOut className="size-4" aria-hidden /> {leaving ? 'Signing out…' : 'Sign out now'}
          </button>
        </section>

        <section className="card p-5">
          <h2 className="font-display mb-3 flex items-center gap-2 font-semibold">
            <Lock className="text-ink-3 size-4" aria-hidden /> How the portal is protected
          </h2>
          <ul className="text-ink-2 space-y-2 text-sm">
            <li>
              Sign-ins end after <strong>{me.session.idleMinutes} idle minutes</strong> or{' '}
              <strong>{me.session.maxHours} hours</strong>, whichever comes first.
            </li>
            <li>Only admins get in; anyone else is signed straight out.</li>
            <li>Each role acts only on people below it, never on itself or an owner.</li>
            <li>Every change is in the audit log, which nobody can edit.</li>
            <li>No one&apos;s balances, expenses or receipts are shown here.</li>
            <li>
              The portal can&apos;t be shown inside another site, and search engines don&apos;t list
              it.
            </li>
          </ul>
        </section>
      </div>

      <section className="card overflow-hidden">
        <header className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-display flex items-center gap-2 font-semibold">
              <MonitorSmartphone className="text-ink-3 size-4" aria-hidden /> Your sessions
            </h2>
            <p className="text-ink-3 text-sm">
              Everywhere you&apos;re signed in: the ABRO app and this portal.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={others.length === 0}
            title={others.length === 0 ? 'No other live sessions' : undefined}
            onClick={() => setDialog({ kind: 'others', count: others.length })}
          >
            <LogOut className="size-4" aria-hidden /> Sign out everywhere else
          </button>
        </header>
        {error && !sessions && (
          <div className="p-5">
            <ErrorCard message={error} onRetry={() => void load()} />
          </div>
        )}
        {!sessions && !error && (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}
        {sessions && (
          <div className="overflow-x-auto">
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
                {sessions.map((s) => (
                  <tr key={s.id} className="border-line border-t">
                    <td className="px-5 py-3">
                      <div className="font-medium" title={s.userAgent ?? undefined}>
                        {deviceName(s.userAgent)}
                      </div>
                      <div className="mt-0.5 flex gap-1.5">
                        {s.current ? (
                          <Badge tone="accent">This browser</Badge>
                        ) : s.live ? (
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
                      {s.current ? 'now' : relTime(s.lastUsedAt)}
                    </td>
                    <td className="text-ink-2 px-5 py-3">{dateOnly(s.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {s.live && !s.current && (
                        <button
                          type="button"
                          className="text-bad text-sm font-medium hover:underline"
                          onClick={() => setDialog({ kind: 'one', s })}
                        >
                          End
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog && (
        <SessionDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onDone={(fresh, msg) => {
            setSessions(fresh);
            setDialog(null);
            setNotice(msg);
          }}
        />
      )}
    </>
  );
}

function SessionDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: Dialog;
  onClose: () => void;
  onDone: (fresh: OwnSession[], msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const one = dialog.kind === 'one' ? dialog.s : null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (one) {
        onDone(await endMySession(one.id), `Ended the session on ${deviceName(one.userAgent)}.`);
      } else {
        onDone(await endMyOtherSessions(), 'Signed out everywhere else.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={one ? 'End this session?' : 'Sign out everywhere else?'}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? 'Working…' : one ? 'End session' : 'Sign out everywhere else'}
          </button>
        </>
      }
    >
      {one ? (
        <p>
          Signs you out on <strong>{deviceName(one.userAgent)}</strong>
          {one.ipAddress ? ` (${cleanIp(one.ipAddress)})` : ''}, last used {relTime(one.lastUsedAt)}
          .
        </p>
      ) : (
        <p>
          Ends every other session you have, in the ABRO app and this portal. This browser stays
          signed in. Do this if you lost a phone or signed in somewhere you shouldn&apos;t have.
        </p>
      )}
      {error && (
        <p role="alert" className="bg-bad-soft text-bad mt-4 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </Modal>
  );
}
