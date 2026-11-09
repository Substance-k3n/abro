'use client';

// Roles & Permissions (ADR-028): what each admin rank may do, who holds
// which rank, and -- for super admins -- giving, changing and removing
// roles. The ladder: Support < Admin < Super admin < Owner (ADMIN_EMAILS
// on Render). You only manage people below you and only give roles below
// your own, so only an owner makes or unmakes a super admin. The API
// enforces all of it; this page explains it and hides what you can't do.

import { Check, Crown, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useListLoad } from '~/components/list';
import { Modal } from '~/components/Modal';
import { Avatar, Badge, ErrorCard, PageHeader, Skeleton, relTime } from '~/components/ui';
import {
  type AdminRole,
  type SiteAdmin,
  type UserSummary,
  listAdmins,
  listUsers,
  removeAdminRole,
  setAdminRole,
} from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { ROLE_LABEL, grantableRoles, useSession, whyCantActOn } from '~/lib/session';

// Mirrors apps/api/internal/admin/roles.go's rolePermissions.
const COLUMNS = ['SUPPORT', 'ADMIN', 'SUPER_ADMIN', 'OWNER'] as const;
const ABILITIES: { label: string; hint?: string; from: (typeof COLUMNS)[number] }[] = [
  { label: 'See the dashboard, users and groups', from: 'SUPPORT' },
  { label: 'See the audit log and who the admins are', from: 'SUPPORT' },
  { label: 'Suspend and unsuspend accounts', hint: 'Only people with a lower role', from: 'ADMIN' },
  { label: "End someone's sessions", hint: 'Only people with a lower role', from: 'ADMIN' },
  { label: 'Give and remove Support and Admin roles', from: 'SUPER_ADMIN' },
  { label: 'Give and remove the Super admin role', from: 'OWNER' },
];

const ROLE_TEXT: Record<AdminRole, string> = {
  SUPPORT: 'Looks only: helps people without changing anything.',
  ADMIN: 'Acts on accounts: suspends and signs people out.',
  SUPER_ADMIN: 'Also manages Support and Admin roles.',
};

type Dialog =
  | { kind: 'add'; user: UserSummary; role: AdminRole }
  | { kind: 'change'; admin: SiteAdmin; role: AdminRole }
  | { kind: 'remove'; admin: SiteAdmin };

export default function RolesPage() {
  const session = useSession();
  const canManage = session.can('admins.manage');
  const grantable = grantableRoles(session);
  const { data: loaded, error, retry } = useListLoad(listAdmins, []);
  const [admins, setAdmins] = useState<SiteAdmin[] | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) {
      setAdmins(loaded);
    }
  }, [loaded]);
  useEffect(() => {
    if (!notice) {
      return;
    }
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Who can run ABRO, and what each role may do. Every change is in the audit log."
      />

      {notice && (
        <div
          role="status"
          className="bg-good-soft text-good mb-4 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          {notice}
        </div>
      )}

      <section className="card mb-6 overflow-hidden">
        <header className="border-line border-b px-5 py-4">
          <h2 className="font-display font-semibold">What each role can do</h2>
          <p className="text-ink-3 text-sm">Each role has everything the one before it has.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink-3 text-xs">
              <tr>
                <th className="px-5 py-3 text-left font-medium" />
                {COLUMNS.map((c) => (
                  <th key={c} className="px-4 py-3 text-center font-medium">
                    {c === 'OWNER' ? (
                      <span className="inline-flex items-center gap-1">
                        <Crown className="size-3.5" aria-hidden /> Owner
                      </span>
                    ) : (
                      ROLE_LABEL[c]
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ABILITIES.map((a) => (
                <tr key={a.label} className="border-line border-t">
                  <td className="px-5 py-3">
                    <div className="font-medium">{a.label}</div>
                    {a.hint && <div className="text-ink-3 text-xs">{a.hint}</div>}
                  </td>
                  {COLUMNS.map((c) => {
                    const yes = COLUMNS.indexOf(c) >= COLUMNS.indexOf(a.from);
                    return (
                      <td key={c} className="px-4 py-3 text-center">
                        {yes ? (
                          <Check className="text-good mx-auto size-4" aria-label="Yes" />
                        ) : (
                          <Minus className="text-line-strong mx-auto size-4" aria-label="No" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-3 border-line border-t px-5 py-3 text-xs">
          Owners are the emails in ADMIN_EMAILS on Render. Nobody can change or suspend an owner
          from here, and nobody can act on their own account.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <header className="border-line flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-display flex items-center gap-2 font-semibold">
              <ShieldCheck className="text-ink-3 size-4" aria-hidden /> Admins
            </h2>
            {admins && (
              <span className="text-ink-3 text-sm">
                {admins.length} {admins.length === 1 ? 'person' : 'people'}
              </span>
            )}
          </header>
          {error && !admins && (
            <div className="p-5">
              <ErrorCard message={error} onRetry={retry} />
            </div>
          )}
          {!admins && !error && (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          )}
          {admins && (
            <table className="w-full text-sm">
              <thead className="text-ink-3 text-left text-xs">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Person</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  <th className="px-5 py-2.5 font-medium">Given</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const blocked = whyCantActOn(session, {
                    id: a.userId,
                    owner: a.owner,
                    adminRole: a.role,
                  });
                  const choices = grantable.filter((r) => r !== a.role);
                  return (
                    <tr key={a.userId} className="border-line border-t">
                      <td className="px-5 py-3">
                        <Link
                          href={`/users/${a.userId}`}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <Avatar name={a.displayName} url={a.avatarUrl} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {a.displayName}
                              {a.userId === session.profile.id && (
                                <span className="text-ink-3 font-normal"> (you)</span>
                              )}
                            </span>
                            <span className="text-ink-3 block truncate text-xs">{a.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="accent">{ROLE_LABEL[a.role]}</Badge>
                          {a.owner && (
                            <Badge tone="dark">
                              <Crown className="size-3" aria-hidden /> Owner
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-ink-2 px-5 py-3 text-xs">
                        {a.owner
                          ? 'Server settings'
                          : `${a.grantedByName ? `by ${a.grantedByName} · ` : ''}${relTime(a.grantedAt)}`}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canManage && !blocked && (
                          <div className="flex items-center justify-end gap-2">
                            {choices.length > 0 && (
                              <select
                                aria-label={`Change ${a.displayName}'s role`}
                                className="input h-8 w-auto py-0 pr-8 text-xs"
                                value=""
                                onChange={(e) =>
                                  e.target.value &&
                                  setDialog({
                                    kind: 'change',
                                    admin: a,
                                    role: e.target.value as AdminRole,
                                  })
                                }
                              >
                                <option value="">Change role…</option>
                                {choices.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABEL[r]}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              type="button"
                              className="text-bad hover:bg-bad-soft rounded-md p-1.5"
                              aria-label={`Remove ${a.displayName}'s role`}
                              title="Remove role"
                              onClick={() => setDialog({ kind: 'remove', admin: a })}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        )}
                        {canManage && blocked && a.userId !== session.profile.id && (
                          <span className="text-ink-3 text-xs" title={blocked}>
                            {a.owner ? 'Owner' : 'Higher than you'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <div className="space-y-6">
          {canManage && admins && (
            <AddAdmin
              grantable={grantable}
              existing={new Set(admins.map((a) => a.userId))}
              onPick={(user, role) => setDialog({ kind: 'add', user, role })}
            />
          )}
          <section className="card p-5">
            <h2 className="font-display mb-3 font-semibold">The roles</h2>
            <dl className="space-y-3 text-sm">
              {(['SUPPORT', 'ADMIN', 'SUPER_ADMIN'] as const).map((r) => (
                <div key={r}>
                  <dt className="font-medium">{ROLE_LABEL[r]}</dt>
                  <dd className="text-ink-3">{ROLE_TEXT[r]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {dialog && (
        <RoleDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onDone={(fresh, msg) => {
            setAdmins(fresh);
            setDialog(null);
            setNotice(msg);
          }}
        />
      )}
    </>
  );
}

function AddAdmin({
  grantable,
  existing,
  onPick,
}: {
  grantable: AdminRole[];
  existing: Set<string>;
  onPick: (u: UserSummary, role: AdminRole) => void;
}) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<AdminRole>(grantable[0] ?? 'SUPPORT');
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
        <Plus className="text-ink-3 size-4" aria-hidden /> Add an admin
      </h2>
      <label htmlFor="new-role" className="label">
        Role
      </label>
      <select
        id="new-role"
        className="input mb-3 mt-1.5"
        value={role}
        onChange={(e) => setRole(e.target.value as AdminRole)}
      >
        {grantable.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
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
              {existing.has(u.id) ? (
                <Badge tone="accent">Admin</Badge>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => onPick(u, role)}
                >
                  Make {ROLE_LABEL[role]}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoleDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: Dialog;
  onClose: () => void;
  onDone: (fresh: SiteAdmin[], msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { title, body, confirm, danger, go } = roleDialogSpec(dialog);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { fresh, msg } = await go();
      onDone(fresh, msg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? 'Working…' : confirm}
          </button>
        </>
      }
    >
      {body}
      {error && (
        <p role="alert" className="bg-bad-soft text-bad mt-4 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </Modal>
  );
}

interface DialogSpec {
  title: string;
  body: React.ReactNode;
  confirm: string;
  danger: boolean;
  go: () => Promise<{ fresh: SiteAdmin[]; msg: string }>;
}

function roleDialogSpec(dialog: Dialog): DialogSpec {
  if (dialog.kind === 'add') {
    const { user, role } = dialog;
    return {
      title: `Make ${user.displayName} ${ROLE_LABEL[role]}?`,
      body: (
        <p>
          {ROLE_TEXT[role]} They can sign in to this portal with {user.email ?? 'their email'}.
        </p>
      ),
      confirm: `Make ${ROLE_LABEL[role]}`,
      danger: false,
      go: async () => ({
        fresh: await setAdminRole(user.id, role),
        msg: `${user.displayName} is now ${ROLE_LABEL[role]}.`,
      }),
    };
  }
  if (dialog.kind === 'change') {
    const { admin, role } = dialog;
    return {
      title: `Change ${admin.displayName} to ${ROLE_LABEL[role]}?`,
      body: (
        <p>
          From {ROLE_LABEL[admin.role]} to {ROLE_LABEL[role]}. {ROLE_TEXT[role]}
        </p>
      ),
      confirm: 'Change role',
      danger: false,
      go: async () => ({
        fresh: await setAdminRole(admin.userId, role),
        msg: `${admin.displayName} is now ${ROLE_LABEL[role]}.`,
      }),
    };
  }
  const { admin } = dialog;
  return {
    title: `Remove ${admin.displayName}'s role?`,
    body: (
      <p>
        They stop being {ROLE_LABEL[admin.role]} at once: their next step in this portal is refused.
        Their ABRO account isn&apos;t affected.
      </p>
    ),
    confirm: 'Remove role',
    danger: true,
    go: async () => ({
      fresh: await removeAdminRole(admin.userId),
      msg: `${admin.displayName} is no longer an admin.`,
    }),
  };
}
