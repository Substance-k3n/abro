'use client';

// EXP-02 Add Expense - Select Payer -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 678-712). No prototype reference: the prototype's
// AddExpenseScreen (App.tsx:2717) has no payer-selection UI at all --
// it silently assumes "you" always pays. Built fresh from the spec
// text, matching the neomorphic visual language and component reuse
// (PersonRow, BackButton) already established for prototype-less Phase
// 3 screens (Balances Overview, Search).

import { BackButton, PersonRow } from '@abro/ui';
import { Check, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME, useExpenseDraft } from '~/lib/expense-draft';
import { CURRENT_USER, FRIENDS } from '~/lib/mock-data';

export default function AddExpensePayerPage() {
  const router = useRouter();
  const { draft, update } = useExpenseDraft();
  const [search, setSearch] = useState('');

  const otherPayer = draft.payerId !== ME ? FRIENDS.find((f) => f.id === draft.payerId) : null;
  const [showFriends, setShowFriends] = useState(draft.payerId !== ME);

  const query = search.trim().toLowerCase();
  const filtered = query ? FRIENDS.filter((f) => f.name.toLowerCase().includes(query)) : FRIENDS;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <BackButton onBack={() => router.push('/expenses/new')} />
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Add Expense
        </h2>
        <div className="w-[60px]" />
      </div>

      <p className="text-[0.85rem]" style={{ color: 'var(--t-muted)' }}>
        Who paid for this expense?
      </p>

      <button
        onClick={() => {
          update({ payerId: ME });
          setShowFriends(false);
        }}
        className="neo-raised flex items-center gap-3.5 rounded-[20px] border-2 p-4 text-left"
        style={{ borderColor: draft.payerId === ME ? 'var(--accent)' : 'transparent' }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-mono text-sm font-bold text-white"
          style={{ background: CURRENT_USER.color }}
        >
          {CURRENT_USER.initials}
        </div>
        <div className="flex-1">
          <p className="text-[0.9rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            You paid
          </p>
        </div>
        {draft.payerId === ME && (
          <Check size={20} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
        )}
      </button>

      <button
        onClick={() => setShowFriends((v) => !v)}
        className="neo-raised flex items-center gap-3.5 rounded-[20px] border-2 p-4 text-left"
        style={{ borderColor: otherPayer ? 'var(--accent)' : 'transparent' }}
      >
        {otherPayer ? (
          <>
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-mono text-sm font-bold text-white"
              style={{ background: otherPayer.color }}
            >
              {otherPayer.initials}
            </div>
            <div className="flex-1">
              <p className="text-[0.9rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
                {otherPayer.name} paid
              </p>
            </div>
            <Check size={20} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
          </>
        ) : (
          <p className="text-[0.9rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
            Someone else paid
          </p>
        )}
      </button>

      {showFriends && (
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--t-dim)' }}
            />
            <input
              className="neo-input"
              placeholder="Search friends"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 40 }}
            />
          </div>
          <div className="flex flex-col gap-2">
            {filtered.map((f) => (
              <PersonRow
                key={f.id}
                initials={f.initials}
                color={f.color}
                name={f.name}
                right={
                  draft.payerId === f.id ? (
                    <Check size={18} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
                  ) : undefined
                }
                onClick={() => update({ payerId: f.id })}
              />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => router.push('/expenses/new/participants')}
        className="neo-btn-accent font-display mt-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
      >
        Next
      </button>
    </div>
  );
}
