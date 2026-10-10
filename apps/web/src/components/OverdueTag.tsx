// "Overdue · 36 days" -- a debt open OVERDUE_AFTER_DAYS or longer
// (ADR-023). Renders nothing for a debt that isn't overdue yet.

import { debtAge } from '~/lib/balances-api';

export function OverdueTag({ owingSince }: { owingSince: string | undefined }) {
  if (!owingSince) {
    return null;
  }
  const { days, overdue } = debtAge(owingSince);
  if (!overdue) {
    return null;
  }
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
      style={{ background: 'var(--red-bg)', color: 'var(--c-red-text)' }}
      title={`Owed since ${formatSince(owingSince)}`}
    >
      Overdue · {days} days
    </span>
  );
}

/** "3 Sep 2026", the reminder messages' format. */
export function formatSince(owingSince: string): string {
  return new Date(owingSince).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
