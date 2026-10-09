'use client';

// GRP-07 Group Settings -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1407-
// 1452). Basic Info, Financial Settings, Danger Zone. Phase 8 slice 8d:
// saves with PATCH /groups/{id}; Leave and Delete call apps/api
// (~/lib/groups-api.ts). Rules are apps/api's (ADR-009) -- this screen
// explains them up front and shows its message when it refuses.
//
// Deviations:
//  - Open to every member, not admin-only: Leave group lives here.
//    Only admins can edit and save (apps/api: NOT_GROUP_ADMIN); others
//    see the settings read-only.
//  - "Default split method" and the Notifications toggles are hidden
//    (user decision 2026-09-29): apps/api has no field for them, and a
//    setting that doesn't persist or do anything would mislead.
//  - Currency is locked once the group has any expense -- checked here
//    with GET /expenses?groupId=&limit=1, enforced by apps/api
//    (CURRENCY_LOCKED).
//  - Leave: blocked by apps/api while your balance here isn't 0
//    (OUTSTANDING_BALANCE) or if you're the last admin (LAST_ADMIN).
//  - Delete: shown to the creator only; blocked until everyone is
//    settled. It's a soft delete -- expenses stay, the group is gone.
//  - Both ask for confirmation inline (no modal library), then go to
//    /groups.
//  - Group photo (roadmap Phase 4c, ADR-017): admins add, change or
//    remove it at the top; it saves straight away, separately from the
//    form's Save. Everyone sees it on the group's pages.
//  - "Automatic reminders" (ADR-023): admins switch the daily job's
//    reminders to overdue members, saved with the form.

import { ETB, abs, formatMoney } from '@abro/types';
import { ArrowLeft, LogOut, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { PhotoPicker } from '~/components/PhotoPicker';
import { ApiError } from '~/lib/api-client';
import { listExpenses } from '~/lib/expenses-api';
import { type GroupView, GroupViewLoader } from '~/lib/group-view';
import { deleteGroup, groupTypeFor, removeGroupMember, updateGroup } from '~/lib/groups-api';
import { initialsOf } from '~/lib/identity';
import { photoSrc, removeGroupPhoto, uploadGroupPhoto } from '~/lib/photos';
import { GROUP_TYPES } from '~/lib/reference-data';

const CURRENCIES = ['ETB', 'USD', 'EUR'];

export default function GroupSettingsPage() {
  const params = useParams<{ id: string }>();
  const [hasExpenses, setHasExpenses] = useState(false);

  return (
    <GroupViewLoader
      groupId={params.id}
      extra={() =>
        listExpenses({ groupId: params.id, limit: 1 }).then((rows) =>
          setHasExpenses(rows.length > 0),
        )
      }
    >
      {(view) => <GroupSettings view={view} hasExpenses={hasExpenses} />}
    </GroupViewLoader>
  );
}

type Confirming = 'leave' | 'delete' | null;

function GroupSettings({ view, hasExpenses }: { view: GroupView; hasExpenses: boolean }) {
  const router = useRouter();
  const { profile, myMembership, nets } = view;
  // What's saved on the server: starts as the loaded group, replaced by
  // PATCH's response, so "unsaved changes" compares against the latest.
  const [group, setGroup] = useState(view.group);
  const isAdmin = myMembership.role === 'ADMIN';
  const isCreator = group.createdById === profile.id;
  const myNet = nets.get(profile.id) ?? 0n;
  const unsettled = [...nets.values()].some((n) => n !== 0n);

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [type, setType] = useState(groupTypeFor(group.type).id);
  const [currency, setCurrency] = useState(group.currency);
  const [simplify, setSimplify] = useState(group.simplifyDebts);
  const [autoRemind, setAutoRemind] = useState(group.autoRemind);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [confirming, setConfirming] = useState<Confirming>(null);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);

  const dirty =
    name.trim() !== group.name ||
    description.trim() !== (group.description ?? '') ||
    type.toUpperCase() !== group.type ||
    currency !== group.currency ||
    simplify !== group.simplifyDebts ||
    autoRemind !== group.autoRemind;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateGroup(group.id, {
        name: name.trim(),
        description: description.trim(),
        type: type.toUpperCase(),
        ...(currency !== group.currency ? { currency } : {}),
        simplifyDebts: simplify,
        autoRemind,
      });
      setGroup({ ...updated, members: group.members }); // PATCH returns members: []
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    }
    setSaving(false);
  };

  const confirm = async () => {
    setDangerBusy(true);
    setDangerError(null);
    try {
      if (confirming === 'leave') {
        await removeGroupMember(group.id, profile.id);
      } else {
        await deleteGroup(group.id);
      }
      router.push('/groups');
    } catch (err) {
      setDangerError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
      setDangerBusy(false);
    }
  };

  return (
    <div className="fade-in flex flex-col gap-5 px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="flex items-center justify-between">
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
          Settings
        </h2>
        <div className="w-[60px]" />
      </div>

      {!isAdmin && (
        <p
          className="neo-inset-sm rounded-[14px] px-3.5 py-2.5 text-[0.78rem]"
          style={{ color: 'var(--t-muted)' }}
        >
          Only admins can change these settings.
        </p>
      )}

      {isAdmin && (
        <section className="neo-raised-sm flex flex-col items-center gap-2 rounded-3xl px-4 py-5">
          <PhotoPicker
            src={photoSrc(group.photoUrl)}
            initials={initialsOf(group.name)}
            color={groupTypeFor(group.type).color}
            size={80}
            label="group photo"
            onUpload={async (image) => {
              const updated = (await uploadGroupPhoto(group.id, image)) as {
                photoUrl: string | null;
              };
              setGroup((g) => ({ ...g, photoUrl: updated.photoUrl }));
            }}
            onRemove={async () => {
              await removeGroupPhoto(group.id);
              setGroup((g) => ({ ...g, photoUrl: null }));
            }}
          />
        </section>
      )}

      <fieldset disabled={!isAdmin || saving} className="flex flex-col gap-5">
        {/* Basic info */}
        <Section title="Basic Info">
          <Field label="Group name">
            <input
              className="neo-input"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              style={{ color: 'var(--t-primary)' }}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="neo-input resize-none"
              rows={2}
              maxLength={280}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ color: 'var(--t-primary)' }}
            />
          </Field>
          <Field label="Group type">
            <div className="grid grid-cols-2 gap-2">
              {GROUP_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className="flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left"
                  style={{
                    borderColor: type === t.id ? t.color : 'transparent',
                    background: 'var(--neo-bg)',
                    boxShadow:
                      type === t.id
                        ? 'inset 2px 2px 6px rgba(0,0,0,0.06), inset -2px -2px 6px rgba(255,255,255,0.6)'
                        : '3px 3px 8px var(--neo-dark), -3px -3px 8px var(--neo-light)',
                  }}
                >
                  <span className="text-[0.9rem]">{t.icon}</span>
                  <span
                    className="text-[0.8rem] font-semibold"
                    style={{ color: type === t.id ? t.color : 'var(--t-secondary)' }}
                  >
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Financial settings */}
        <Section title="Financial Settings">
          <Field label="Currency">
            <div
              className="neo-inset-sm flex gap-1 rounded-[14px] p-1"
              style={hasExpenses ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
            >
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`neo-tab flex-1 border-none font-mono ${currency === c ? 'active' : ''}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {hasExpenses && (
              <p className="mt-1.5 pl-1 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                Currency can&apos;t change once a group has expenses.
              </p>
            )}
          </Field>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.85rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
                Simplify debts
              </p>
              <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                Offer a minimum-transaction payment plan in Balances.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSimplify((v) => !v)}
              className={`neo-toggle ${simplify ? 'on' : ''}`}
              aria-pressed={simplify}
              aria-label="Simplify debts"
            >
              <span className="neo-toggle-thumb" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.85rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
                Automatic reminders
              </p>
              <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                Privately remind members who owe for 30 days, then every 2 weeks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoRemind((v) => !v)}
              className={`neo-toggle shrink-0 ${autoRemind ? 'on' : ''}`}
              aria-pressed={autoRemind}
              aria-label="Automatic reminders"
            >
              <span className="neo-toggle-thumb" />
            </button>
          </div>
        </Section>
      </fieldset>

      {isAdmin && (
        <>
          {saveError && (
            <p
              role="alert"
              className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
              style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
            >
              {saveError}
            </p>
          )}
          <button
            onClick={save}
            disabled={!dirty || !name.trim() || saving}
            className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : saved && !dirty ? 'Saved ✓' : 'Save Changes'}
          </button>
        </>
      )}

      {/* Danger zone */}
      <section
        className="flex flex-col gap-2.5 rounded-3xl border p-4"
        style={{ borderColor: 'var(--c-red)' }}
      >
        <p
          className="text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--c-red)' }}
        >
          Danger Zone
        </p>

        {confirming ? (
          <div className="flex flex-col gap-3">
            <p className="text-[0.85rem]" style={{ color: 'var(--t-primary)' }}>
              {confirming === 'leave' ? (
                <>
                  Leave <strong>{group.name}</strong>? You&apos;ll lose access to it until an admin
                  invites you back.
                </>
              ) : (
                <>
                  Delete <strong>{group.name}</strong> for everyone? Its expenses are kept, but
                  nobody can open the group again.
                </>
              )}
            </p>
            {dangerError && (
              <p
                role="alert"
                className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
                style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
              >
                {dangerError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirming(null);
                  setDangerError(null);
                }}
                disabled={dangerBusy}
                className="neo-btn flex-1 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold"
                style={{ color: 'var(--t-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={dangerBusy}
                className="flex-1 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--c-red)' }}
              >
                {dangerBusy ? 'Working…' : confirming === 'leave' ? 'Leave' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming('leave')}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[0.85rem] font-medium"
              style={{ color: 'var(--t-secondary)' }}
            >
              <LogOut size={16} strokeWidth={2} /> Leave group
            </button>
            {myNet !== 0n && (
              <p className="-mt-1.5 pl-3 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                You&apos;ll need to settle your {formatMoney(abs(myNet), ETB)} balance first.
              </p>
            )}
            {isCreator && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming('delete')}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[0.85rem] font-medium"
                  style={{ color: 'var(--c-red)' }}
                >
                  <Trash2 size={16} strokeWidth={2} /> Delete group
                </button>
                {unsettled && (
                  <p className="-mt-1.5 pl-3 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                    Everyone must be settled up first.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
      <p
        className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
        style={{ color: 'var(--t-dim)' }}
      >
        {title}
      </p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
        style={{ color: 'var(--t-muted)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
