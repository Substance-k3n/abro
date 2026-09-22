'use client';

// Phase 4 (add-expense wizard) shared state -- docs/WIRING_PLAN.md.
//
// The frontend spec (docs/ABRO_FRONTEND_SPEC.md EXP-01..EXP-08) defines
// the wizard as separate routed screens (/expenses/new, /expenses/new/
// payer, .../participants, .../split, .../split/exact|percentage|shares,
// .../review), but the prototype (App.tsx:2717 AddExpenseScreen)
// collapses all of it into one component with local `useState<step>`.
// Followed the spec's route structure here (same precedent as Phase 2's
// auth flow: separate routes, not a collapsed single-screen state
// machine) since it's more deep-link/back-button friendly and matches
// every other multi-step flow already built in this app. That means the
// draft can't live in one component's local state -- it's lifted into
// this Context, provided by a layout.tsx wrapping every step route
// under /expenses/new, so navigating between steps (real route changes)
// preserves the in-progress draft.
//
// Known limitation, same as any client-only wizard state: a hard
// refresh or closed tab loses the draft. No persistence (localStorage
// or a real backend draft) is built for this phase -- out of scope for
// a mock-data-only phase, and not called out as required by the spec.

import { type ReactNode, createContext, useContext, useState } from 'react';

export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'shares';

/** Sentinel participant/payer id representing the current user -- FRIENDS
 * (~/lib/mock-data) only lists other people, so "you" needs an id that
 * can't collide with a real friend id. */
export const ME = 'me';

export interface ExpenseDraft {
  name: string;
  /** Raw decimal string as typed (e.g. "150.50"), not yet parsed --
   * screens parse via expense-split.ts's parseAmount when they need the
   * MinorUnits value, same as how form inputs work everywhere else in
   * this app (draft-string-until-submit). */
  amountInput: string;
  category: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  groupId: string | null;
  /** ME or a FRIENDS id. */
  payerId: string;
  /** ME and/or FRIENDS ids. */
  participantIds: string[];
  splitMethod: SplitMethod;
  /** Per split method, keyed by participant id. Only the relevant map is
   * read for the draft's current splitMethod, but all three persist
   * across method switches so going back and forth doesn't lose what
   * was already entered. */
  exactAmounts: Record<string, string>;
  percentages: Record<string, string>;
  shares: Record<string, number>;
  note: string;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const emptyDraft = (): ExpenseDraft => ({
  name: '',
  amountInput: '',
  category: 'Food',
  date: todayIso(),
  groupId: null,
  payerId: ME,
  participantIds: [ME],
  splitMethod: 'equal',
  exactAmounts: {},
  percentages: {},
  shares: {},
  note: '',
});

interface ExpenseDraftContextValue {
  draft: ExpenseDraft;
  update: (patch: Partial<ExpenseDraft>) => void;
  reset: () => void;
}

const ExpenseDraftContext = createContext<ExpenseDraftContextValue | null>(null);

export function ExpenseDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft);

  const update = (patch: Partial<ExpenseDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const reset = () => setDraft(emptyDraft());

  return (
    <ExpenseDraftContext.Provider value={{ draft, update, reset }}>
      {children}
    </ExpenseDraftContext.Provider>
  );
}

/** Throws outside the provider rather than returning a fallback -- every
 * step screen under /expenses/new is wrapped by ExpenseDraftProvider via
 * that segment's layout.tsx, so reaching this without a provider is a
 * real bug (a step screen rendered outside the wizard route tree), not
 * a case to silently paper over. */
export function useExpenseDraft(): ExpenseDraftContextValue {
  const ctx = useContext(ExpenseDraftContext);
  if (!ctx) {
    throw new Error('useExpenseDraft must be used within ExpenseDraftProvider');
  }
  return ctx;
}
