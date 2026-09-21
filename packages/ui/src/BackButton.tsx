import { ChevronLeft } from 'lucide-react';

/** Ported from the prototype's BackButton (App.tsx). */
export function BackButton({ onBack, label = 'Back' }: { onBack: () => void; label?: string }) {
  return (
    <button
      onClick={onBack}
      className="mb-4 flex items-center gap-1 border-none bg-transparent p-0 text-[0.85rem] font-medium"
      style={{ color: 'var(--accent)' }}
    >
      <ChevronLeft size={16} strokeWidth={2.5} /> {label}
    </button>
  );
}
