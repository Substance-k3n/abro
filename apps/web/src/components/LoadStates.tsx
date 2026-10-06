// Phase 8 (docs/WIRING_PLAN.md) -- the loading spinner and error-with-
// retry blocks every API-backed screen renders while its first fetch is
// in flight or after it fails. Slices 2-3 grew one private copy per page
// (Home, Friends, Balances, Notifications); extracted here in slice 4
// once Activity, Friend Detail and Groups would have added three more.
//
// `minHeight` is inline style rather than a Tailwind class so callers can
// pass any value without it being purged -- Home uses a taller 60vh since
// it has no page header rendered above the spinner.

export function LoadingState({ minHeight = '50vh' }: { minHeight?: string }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight }}>
      <div
        className="h-8 w-8 rounded-full border-2"
        style={{
          borderColor: 'rgba(99,102,241,0.3)',
          borderTopColor: 'var(--accent)',
          animation: 'spin 0.7s linear infinite',
        }}
        aria-label="Loading"
      />
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  minHeight = '50vh',
}: {
  message: string;
  onRetry: () => void;
  minHeight?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 px-8 text-center"
      style={{ minHeight }}
    >
      <p className="text-[0.9rem]" style={{ color: 'var(--t-muted)' }}>
        {message}
      </p>
      <button
        onClick={onRetry}
        className="neo-btn-accent rounded-2xl px-5 py-2.5 text-[0.85rem] font-semibold"
      >
        Try again
      </button>
    </div>
  );
}
