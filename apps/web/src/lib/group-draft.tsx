'use client';

// Phase 5 (create-group wizard) shared state -- docs/WIRING_PLAN.md.
// Same pattern as ~/lib/expense-draft.tsx: the spec's two-step flow
// (GRP-01 Basic Info, GRP-02 Add Members) is separate routes, not the
// prototype's collapsed single-screen state machine (which also adds a
// third "Review" step the spec doesn't call for -- skipped here, same
// reasoning as EXP-08 not adding an extra "Expense Created!" success
// screen beyond what the spec lists).

import { type ReactNode, createContext, useContext, useState } from 'react';

export interface GroupDraft {
  name: string;
  /** A GROUP_TYPES (~/lib/mock-data.ts) id. */
  type: string;
  /** ETB/USD/EUR, per spec's GRP-01 currency selector -- stored as
   * chosen, but only ETB is functionally supported anywhere else in
   * this app (see Balances Overview's header comment on why). Picking
   * USD/EUR here doesn't change any formatting or math downstream. */
  currency: string;
  description: string;
  /** FRIENDS ids -- does not include 'me' (~/lib/expense-draft.ts's ME
   * sentinel), since you're always a group's creator/member implicitly. */
  memberIds: string[];
}

export const emptyGroupDraft = (): GroupDraft => ({
  name: '',
  type: 'Friends',
  currency: 'ETB',
  description: '',
  memberIds: [],
});

interface GroupDraftContextValue {
  draft: GroupDraft;
  update: (patch: Partial<GroupDraft>) => void;
  reset: () => void;
}

const GroupDraftContext = createContext<GroupDraftContextValue | null>(null);

export function GroupDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<GroupDraft>(emptyGroupDraft);

  const update = (patch: Partial<GroupDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const reset = () => setDraft(emptyGroupDraft());

  return (
    <GroupDraftContext.Provider value={{ draft, update, reset }}>
      {children}
    </GroupDraftContext.Provider>
  );
}

export function useGroupDraft(): GroupDraftContextValue {
  const ctx = useContext(GroupDraftContext);
  if (!ctx) {
    throw new Error('useGroupDraft must be used within GroupDraftProvider');
  }
  return ctx;
}
