'use client';

// Phase 6 (settle-up flow) shared state -- docs/WIRING_PLAN.md, mirroring
// expense-draft.tsx's Context-lifted-into-a-layout pattern (see its header
// comment for the full rationale: routed steps per ABRO_FRONTEND_SPEC.md
// STL-01..05, deep-link/back-button friendly, matches every other
// multi-step flow in this app).
//
// Unlike the expense/group drafts, STL-04 (Success) also reads this
// context directly rather than via query params -- it stays nested under
// the same layout/provider as the rest of the flow, so it can show
// "settled with X, amount Y" straight from `draft` without re-threading
// the same values through the URL. `reset()` is called when the user
// leaves the success screen (not immediately after creating the
// settlement), so the success screen's own render still sees the
// just-submitted values.
//
// Same known limitation as expense-draft.tsx: no persistence across a
// hard refresh -- in-memory only (STL-02 re-derives who/what from its
// URL; STL-03/04 send you back to /settle if the draft is empty).
//
// Phase 8 slice 9b: `method`/`note` are gone -- apps/api stores neither
// (user decision 2026-09-29). `idempotencyKey` makes Confirm safe to
// retry; `recorded` is what STL-04 shows after a successful submit.

import { type ReactNode, createContext, useContext, useState } from 'react';

export interface SettleDraft {
  /** Who you're paying. Never you -- apps/api only lets the debtor
   * record a settlement (ADR-003). */
  toUserId: string | null;
  /** null = personal (no group) settlement. */
  groupId: string | null;
  /** Raw decimal string as typed, parsed with expense-split.ts's
   * parseAmount when needed. */
  amountInput: string;
  idempotencyKey: string;
  /** Set by STL-03 once apps/api has the payment (waiting for the
   * other person to confirm it, ADR-019). */
  recorded: { personName: string; amount: bigint; receiptFailed?: boolean } | null;
}

export const emptySettleDraft = (): SettleDraft => ({
  toUserId: null,
  groupId: null,
  amountInput: '',
  idempotencyKey: crypto.randomUUID(),
  recorded: null,
});

interface SettleDraftContextValue {
  draft: SettleDraft;
  update: (patch: Partial<SettleDraft>) => void;
  reset: () => void;
}

const SettleDraftContext = createContext<SettleDraftContextValue | null>(null);

export function SettleDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SettleDraft>(emptySettleDraft);

  const update = (patch: Partial<SettleDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const reset = () => setDraft(emptySettleDraft());

  return (
    <SettleDraftContext.Provider value={{ draft, update, reset }}>
      {children}
    </SettleDraftContext.Provider>
  );
}

/** Throws outside the provider rather than returning a fallback -- every
 * step screen under /settle is wrapped by SettleDraftProvider via that
 * segment's layout.tsx, so reaching this without a provider is a real
 * bug, not a case to silently paper over. */
export function useSettleDraft(): SettleDraftContextValue {
  const ctx = useContext(SettleDraftContext);
  if (!ctx) {
    throw new Error('useSettleDraft must be used within SettleDraftProvider');
  }
  return ctx;
}
