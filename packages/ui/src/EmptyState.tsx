export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

/** No prototype reference for this one (none of the 8 dashboard screens'
 * mock data is ever actually empty) — designed fresh, consistent with the
 * neomorphic system: an icon in a raised circle, title, optional
 * description and CTA. docs/ABRO_FRONTEND_SPEC.md §15 requires every
 * screen define an empty state; this is the shared shape for it. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <div
        className="neo-raised-lg flex h-16 w-16 items-center justify-center rounded-[22px]"
        style={{ color: 'var(--t-dim)' }}
        aria-hidden
      >
        {icon}
      </div>
      <h3
        className="font-display text-[1.05rem] font-bold tracking-tight"
        style={{ color: 'var(--t-primary)' }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="max-w-[260px] text-[0.85rem] leading-relaxed"
          style={{ color: 'var(--t-muted)' }}
        >
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="neo-btn-accent font-display mt-2 rounded-2xl px-5 py-2.5 text-sm font-semibold"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
