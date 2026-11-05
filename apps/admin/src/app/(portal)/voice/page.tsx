'use client';

// Voice (ADR-027, admin-controlled since ADR-028): who may use voice
// commands, without a deploy. Three modes: Off (nobody, even testers),
// Listed (VOICE_TESTERS on Render + people turned on here), Everyone.
// Lists everyone who has voice or used it lately, and adds people by
// search. Every change confirms first and is logged by the API.

import { CheckCircle2, Mic, MicOff, Plus, Radio, Server, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useListLoad } from '~/components/list';
import { Modal } from '~/components/Modal';
import { Avatar, Badge, ErrorCard, PageHeader, Skeleton, num, relTime } from '~/components/ui';
import {
  type UserSummary,
  type VoiceAccess,
  type VoiceMode,
  type VoiceSettings,
  getVoice,
  listUsers,
  setVoiceMode,
  voiceOff,
  voiceOn,
} from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { useSession } from '~/lib/session';

const MODES: { value: VoiceMode; label: string; text: string; icon: typeof Mic }[] = [
  { value: 'off', label: 'Off', text: 'Nobody has voice, not even testers.', icon: MicOff },
  {
    value: 'listed',
    label: 'Listed people',
    text: 'Testers set on Render, plus people turned on here.',
    icon: UsersRound,
  },
  { value: 'everyone', label: 'Everyone', text: 'Every signed-in person has voice.', icon: Radio },
];

const ACCESS: Record<VoiceAccess, { label: string; tone: 'good' | 'accent' | 'neutral' | 'bad' }> =
  {
    granted: { label: 'Turned on here', tone: 'accent' },
    tester: { label: 'Tester (Render)', tone: 'good' },
    everyone: { label: 'Everyone mode', tone: 'good' },
    off: { label: 'Voice is off', tone: 'bad' },
    none: { label: 'No voice', tone: 'neutral' },
    unavailable: { label: 'Not set up', tone: 'neutral' },
  };

type Dialog =
  | { kind: 'mode'; mode: VoiceMode }
  | { kind: 'on'; id: string; name: string }
  | { kind: 'off'; id: string; name: string; tester: boolean };

export default function VoicePage() {
  const session = useSession();
  const canManage = session.can('voice.manage');
  const { data: loaded, error, retry } = useListLoad(getVoice, []);
  const [v, setV] = useState<VoiceSettings | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) {
      setV(loaded);
    }
  }, [loaded]);
  useEffect(() => {
    if (!notice) {
      return;
    }
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (error && !v) {
    return <ErrorCard message={error} onRetry={retry} />;
  }
  if (!v) {
    return (
      <>
        <PageHeader title="Voice" subtitle="Loading…" />
        <Skeleton className="mb-6 h-40" />
        <Skeleton className="h-64" />
      </>
    );
  }

  const using = v.users.filter((u) => u.sessions30d > 0).length;

  return (
    <>
      <PageHeader
        title="Voice"
        subtitle="Who can talk to ABRO. Changes apply the next time someone opens the app."
      />

      {notice && (
        <div
          role="status"
          className="bg-good-soft text-good mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          <CheckCircle2 className="size-4" aria-hidden /> {notice}
        </div>
      )}

      {!v.configured && (
        <div className="bg-warn-soft text-warn mb-6 flex items-start gap-3 rounded-xl px-5 py-4 text-sm">
          <Server className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">Voice isn&apos;t set up on the server</div>
            <div className="mt-0.5">
              Nobody gets voice until TEZAZ_RELAY_URL and TEZAZ_SECRET_KEY are set on Render
              (docs/DEPLOY.md). You can still choose who will have it.
            </div>
          </div>
        </div>
      )}

      <section className="mb-6" aria-label="Voice mode">
        <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Who has voice">
          {MODES.map((m) => {
            const on = v.mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!canManage || on}
                onClick={() => setDialog({ kind: 'mode', mode: m.value })}
                className={`card flex items-start gap-4 p-5 text-left transition-colors disabled:cursor-default ${
                  on
                    ? 'border-accent ring-accent/20 ring-4'
                    : canManage
                      ? 'hover:border-line-strong'
                      : ''
                }`}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                    on ? 'bg-accent text-white' : 'bg-page text-ink-2'
                  }`}
                >
                  <m.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="flex items-center gap-2 font-semibold">
                    {m.label}
                    {on && <Badge tone="accent">Now</Badge>}
                  </span>
                  <span className="text-ink-3 mt-1 block text-sm">{m.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        {!canManage && (
          <p className="text-ink-3 mt-2 text-xs">Your role can look but not change voice.</p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <header className="border-line flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-display font-semibold">People with voice</h2>
            <span className="text-ink-3 text-sm">
              {num(v.users.length)} listed · {num(using)} used it in 30 days
            </span>
          </header>
          {v.users.length === 0 ? (
            <p className="text-ink-3 px-5 py-10 text-center text-sm">
              Nobody yet.{canManage ? ' Add someone on the right.' : ''}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-ink-3 text-left text-xs">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Person</th>
                  <th className="px-5 py-2.5 font-medium">Why</th>
                  <th className="px-5 py-2.5 font-medium">Last used</th>
                  <th className="px-5 py-2.5 text-right font-medium">30 days</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {v.users.map((u) => (
                  <tr key={u.userId} className="border-line border-t">
                    <td className="px-5 py-3">
                      <Link
                        href={`/users/${u.userId}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <Avatar name={u.displayName} url={u.avatarUrl} size={30} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{u.displayName}</span>
                          <span className="text-ink-3 block truncate text-xs">{u.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={ACCESS[u.access].tone}>{ACCESS[u.access].label}</Badge>
                        {u.grantedAt && u.access !== 'granted' && <Badge>+ turned on here</Badge>}
                        {u.suspendedAt && <Badge tone="bad">Suspended</Badge>}
                      </div>
                      {u.grantedAt && (
                        <div className="text-ink-3 mt-1 text-xs">
                          by {u.grantedByName ?? 'a deleted admin'} · {relTime(u.grantedAt)}
                        </div>
                      )}
                    </td>
                    <td className="text-ink-2 px-5 py-3">{relTime(u.lastUsedAt)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{num(u.sessions30d)}</td>
                    <td className="px-5 py-3 text-right">
                      {canManage && u.grantedAt && (
                        <button
                          type="button"
                          className="text-bad text-sm font-medium hover:underline"
                          onClick={() =>
                            setDialog({
                              kind: 'off',
                              id: u.userId,
                              name: u.displayName,
                              tester: u.access === 'tester',
                            })
                          }
                        >
                          Turn off
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="space-y-6">
          {canManage && (
            <AddPerson
              have={new Set(v.users.filter((u) => u.grantedAt).map((u) => u.userId))}
              onPick={(u) => setDialog({ kind: 'on', id: u.id, name: u.displayName })}
            />
          )}
          <section className="card p-5">
            <h2 className="font-display mb-1 flex items-center gap-2 font-semibold">
              <Server className="text-ink-3 size-4" aria-hidden /> Testers on Render
            </h2>
            <p className="text-ink-3 mb-3 text-xs">
              VOICE_TESTERS. They have voice in Listed mode; change them on Render.
            </p>
            {v.testersEveryone && (
              <p className="bg-warn-soft text-warn mb-3 rounded-lg px-3 py-2 text-xs">
                It holds &quot;*&quot;, so in Listed mode everyone has voice.
              </p>
            )}
            {v.testers.length === 0 ? (
              <p className="text-ink-3 text-sm">None.</p>
            ) : (
              <ul className="space-y-1">
                {v.testers.map((t) => (
                  <li key={t} className="text-ink-2 truncate font-mono text-xs">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {dialog && (
        <VoiceDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onDone={(fresh, msg) => {
            setV(fresh);
            setDialog(null);
            setNotice(msg);
          }}
        />
      )}
    </>
  );
}

function AddPerson({ have, onPick }: { have: Set<string>; onPick: (u: UserSummary) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<UserSummary[] | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setFound(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      listUsers(term, 'active', 1)
        .then((p) => {
          if (live) {
            setFound(p.users.slice(0, 6));
          }
        })
        .catch(() => {
          if (live) {
            setFound([]);
          }
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <section className="card p-5">
      <h2 className="font-display mb-3 flex items-center gap-2 font-semibold">
        <Plus className="text-ink-3 size-4" aria-hidden /> Turn voice on for someone
      </h2>
      <input
        type="search"
        aria-label="Find a person"
        className="input"
        placeholder="Name, email or username"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {found && (
        <ul className="mt-3 space-y-1">
          {found.length === 0 && (
            <li className="text-ink-3 py-2 text-sm">Nobody active matches.</li>
          )}
          {found.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-1 py-1.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={u.displayName} url={u.avatarUrl} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{u.displayName}</span>
                  <span className="text-ink-3 block truncate text-xs">{u.email}</span>
                </span>
              </span>
              {have.has(u.id) ? (
                <Badge tone="accent">On</Badge>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => onPick(u)}
                >
                  <Mic className="size-3.5" aria-hidden /> Turn on
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MODE_DIALOG: Record<VoiceMode, { title: string; body: string; confirm: string }> = {
  off: {
    title: 'Switch voice off for everyone?',
    body: 'Nobody will have voice, including testers on Render, until it is switched back on.',
    confirm: 'Switch off',
  },
  listed: {
    title: 'Give voice to listed people only?',
    body: 'Testers on Render and people turned on here keep voice. Everyone else loses it.',
    confirm: 'Listed only',
  },
  everyone: {
    title: 'Turn voice on for everyone?',
    body: 'Every signed-in person gets the voice button. Voice uses speech credit, so keep an eye on use.',
    confirm: 'Turn on for everyone',
  },
};

function VoiceDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: Dialog;
  onClose: () => void;
  onDone: (fresh: VoiceSettings, msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let spec: {
    title: string;
    body: string;
    confirm: string;
    tone: string;
    go: () => Promise<{ fresh: VoiceSettings; msg: string }>;
  };
  if (dialog.kind === 'mode') {
    const { mode } = dialog;
    spec = {
      ...MODE_DIALOG[mode],
      tone: mode === 'off' ? 'btn-danger' : 'btn-primary',
      go: async () => ({
        fresh: await setVoiceMode(mode),
        msg: `Voice is now: ${MODES.find((m) => m.value === mode)?.label}.`,
      }),
    };
  } else if (dialog.kind === 'on') {
    spec = {
      title: `Turn voice on for ${dialog.name}?`,
      body: 'They get the voice button the next time ABRO opens (in Listed or Everyone mode).',
      confirm: 'Turn voice on',
      tone: 'btn-primary',
      go: async () => {
        await voiceOn(dialog.id);
        return { fresh: await getVoice(), msg: `Voice turned on for ${dialog.name}.` };
      },
    };
  } else {
    spec = {
      title: `Turn voice off for ${dialog.name}?`,
      body: dialog.tester
        ? 'They stay a tester on Render, so they keep voice in Listed mode.'
        : 'The voice button goes away the next time ABRO opens.',
      confirm: 'Turn voice off',
      tone: 'btn-danger',
      go: async () => {
        await voiceOff(dialog.id);
        return { fresh: await getVoice(), msg: `Voice turned off for ${dialog.name}.` };
      },
    };
  }

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { fresh, msg } = await spec.go();
      onDone(fresh, msg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Try again.');
      setBusy(false);
    }
  };

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
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? 'Working…' : spec.confirm}
          </button>
        </>
      }
    >
      <p>{spec.body}</p>
      {error && (
        <p role="alert" className="bg-bad-soft text-bad mt-4 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </Modal>
  );
}
