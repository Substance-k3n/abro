'use client';

// GRP-01 Create Group - Basic Info -- docs/ABRO_FRONTEND_SPEC.md §5
// (lines 1111-1155). Ported from the prototype's CreateGroupScreen step
// 1 (App.tsx:5252-5338) -- name input, type grid (GROUP_TYPES, ~/lib/
// mock-data.ts), currency segmented control, description textarea.
//
// Deviations:
//  - Quick-name suggestions use concrete examples ("Roommates",
//    "Family", "Road Trip") rather than spec's literal "Trip to [City]"
//    template -- a real placeholder city isn't available, and a plain
//    "Trip" suggestion reads fine without one.
//  - No separate review step (the prototype has a 3rd "Review" step;
//    spec's GRP-01/GRP-02 only describes two screens) -- same reasoning
//    as EXP-08 not adding an extra success screen beyond the spec.

import { useRouter } from 'next/navigation';

import { useGroupDraft } from '~/lib/group-draft';
import { GROUP_TYPES } from '~/lib/mock-data';

const NAME_SUGGESTIONS = ['Roommates', 'Family', 'Road Trip'];
const CURRENCIES = ['ETB', 'USD', 'EUR'];

export default function CreateGroupDetailsPage() {
  const router = useRouter();
  const { draft, update } = useGroupDraft();

  const isValid = draft.name.trim().length > 0 && draft.type.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/groups')}
          className="text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Cancel
        </button>
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          New Group
        </h2>
        <div className="w-[60px]" />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Group name
        </label>
        <input
          className="neo-input"
          placeholder="e.g. Friday Friends"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          style={{ color: 'var(--t-primary)' }}
        />
        <div className="mt-2.5 flex flex-wrap gap-2">
          {NAME_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => update({ name: s })}
              className="neo-flat rounded-[10px] border-none px-3 py-1.5 text-[0.78rem] font-medium"
              style={{ color: 'var(--t-muted)' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Group type
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          {GROUP_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => update({ type: t.id })}
              className="flex items-center gap-2.5 rounded-2xl border-2 px-3.5 py-3 text-left"
              style={{
                borderColor: draft.type === t.id ? t.color : 'transparent',
                background: 'var(--neo-bg)',
                boxShadow:
                  draft.type === t.id
                    ? `inset 2px 2px 6px rgba(0,0,0,0.06), inset -2px -2px 6px rgba(255,255,255,0.6)`
                    : '3px 3px 8px var(--neo-dark), -3px -3px 8px var(--neo-light)',
              }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[1rem]"
                style={{ background: draft.type === t.id ? `${t.color}22` : 'transparent' }}
              >
                {t.icon}
              </span>
              <span
                className="text-[0.85rem] font-semibold"
                style={{ color: draft.type === t.id ? t.color : 'var(--t-secondary)' }}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Default currency
        </label>
        <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => update({ currency: c })}
              className={`neo-tab flex-1 border-none font-mono ${draft.currency === c ? 'active' : ''}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Description <span style={{ fontWeight: 400, color: 'var(--t-dim)' }}>(optional)</span>
        </label>
        <textarea
          className="neo-input resize-none"
          rows={2}
          maxLength={200}
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          style={{ color: 'var(--t-primary)' }}
        />
      </div>

      <button
        onClick={() => router.push('/groups/new/members')}
        disabled={!isValid}
        className="neo-btn-accent font-display mt-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
