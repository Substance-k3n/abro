'use client';

// GRP-07 Group Settings -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1407-
// 1452). Basic Info, Financial Settings, Notifications, Danger Zone.
//
// Deviations:
//  - "(admin only)" (spec's Purpose line): same reasoning as every
//    other admin-gated affordance in this phase -- no real role system
//    exists, "you" are always Admin of every group here.
//  - Notification toggles (spec's §3) are local UI state only, not
//    persisted to Group or wired to any real event -- this app has no
//    notification-generation system that reacts to settings yet
//    (NOTIFICATIONS, ~/lib/mock-data.ts, is a static list). Persisting
//    a setting with zero real effect would be misleading; keeping it
//    local and documenting that honestly is the better trade.
//  - Leave group / Delete group are disabled placeholders, same
//    reasoning as every other destructive mock action in this app
//    (Delete expense, Remove friend, Remove/Make-admin member) -- no
//    real endpoint exists, and spec's own validation rules for these
//    (can't delete with outstanding balances) need real logic this
//    mock-data phase shouldn't fake with no confirmation step.
//  - The one validation spec explicitly asks for that *is* real:
//    "Cannot change currency if expenses exist" -- the currency
//    selector is genuinely disabled when EXPENSES has any row for this
//    group, with an explanatory note, not just documented as a rule.

import { EmptyState } from '@abro/ui';
import { ArrowLeft, LogOut, Trash2, Users } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { EXPENSES, GROUPS, GROUP_TYPES, updateGroup } from '~/lib/mock-data';

const CURRENCIES = ['ETB', 'USD', 'EUR'];
const SPLIT_METHODS = [
  { id: 'equal', label: 'Equal' },
  { id: 'exact', label: 'Exact' },
  { id: 'percentage', label: 'Percentage' },
  { id: 'shares', label: 'Shares' },
] as const;

export default function GroupSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const group = GROUPS.find((g) => g.id === params.id);

  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [type, setType] = useState(group?.type ?? 'Friends');
  const [currency, setCurrency] = useState(group?.currency ?? 'ETB');
  const [simplify, setSimplify] = useState(group?.simplifyDebts ?? true);
  const [splitMethod, setSplitMethod] = useState(group?.defaultSplitMethod ?? 'equal');
  const [notifyExpense, setNotifyExpense] = useState(true);
  const [notifySettlement, setNotifySettlement] = useState(true);
  const [notifyMemberJoin, setNotifyMemberJoin] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!group) {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        <button
          onClick={() => router.push('/groups')}
          className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Groups
        </button>
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title="Group not found"
          description="This group doesn't exist, or the link may be out of date."
        />
      </div>
    );
  }

  const hasExpenses = EXPENSES.some((e) => e.groupId === group.id);
  const groupType = GROUP_TYPES.find((t) => t.id === type) ?? GROUP_TYPES[0]!;

  const save = () => {
    updateGroup(group.id, {
      name: name.trim() || group.name,
      description: description.trim(),
      type,
      icon: groupType.icon,
      color: groupType.color,
      currency,
      simplifyDebts: simplify,
      defaultSplitMethod: splitMethod,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fade-in flex flex-col gap-5 px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}`)}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> {group.name}
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Settings
        </h2>
        <div className="w-[60px]" />
      </div>

      {/* Basic info */}
      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Basic Info
        </p>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Group name
          </label>
          <input
            className="neo-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ color: 'var(--t-primary)' }}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Description
          </label>
          <textarea
            className="neo-input resize-none"
            rows={2}
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ color: 'var(--t-primary)' }}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Group type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {GROUP_TYPES.map((t) => (
              <button
                key={t.id}
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
        </div>
      </section>

      {/* Financial settings */}
      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Financial Settings
        </p>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Currency
          </label>
          <div
            className="neo-inset-sm flex gap-1 rounded-[14px] p-1"
            style={hasExpenses ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            {CURRENCIES.map((c) => (
              <button
                key={c}
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
        </div>

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
            onClick={() => setSimplify((v) => !v)}
            className={`neo-toggle ${simplify ? 'on' : ''}`}
            aria-pressed={simplify}
          >
            <span className="neo-toggle-thumb" />
          </button>
        </div>

        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Default split method
          </label>
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {SPLIT_METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setSplitMethod(m.id)}
                className={`neo-tab flex-1 border-none text-[0.72rem] ${splitMethod === m.id ? 'active' : ''}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="neo-raised-sm flex flex-col gap-3.5 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Notifications
        </p>
        {[
          { label: 'New expense', value: notifyExpense, set: setNotifyExpense },
          { label: 'Settlement', value: notifySettlement, set: setNotifySettlement },
          { label: 'Member joins', value: notifyMemberJoin, set: setNotifyMemberJoin },
        ].map((n) => (
          <div key={n.label} className="flex items-center justify-between">
            <p className="text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
              Notify on {n.label.toLowerCase()}
            </p>
            <button
              onClick={() => n.set((v) => !v)}
              className={`neo-toggle ${n.value ? 'on' : ''}`}
              aria-pressed={n.value}
            >
              <span className="neo-toggle-thumb" />
            </button>
          </div>
        ))}
      </section>

      <button
        onClick={save}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
      >
        {saved ? 'Saved ✓' : 'Save Changes'}
      </button>

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
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2.5 text-[0.85rem] font-medium opacity-50"
          style={{ color: 'var(--t-secondary)' }}
        >
          <LogOut size={16} strokeWidth={2} /> Leave group
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2.5 text-[0.85rem] font-medium opacity-50"
          style={{ color: 'var(--c-red)' }}
        >
          <Trash2 size={16} strokeWidth={2} /> Delete group
        </button>
      </section>
    </div>
  );
}
