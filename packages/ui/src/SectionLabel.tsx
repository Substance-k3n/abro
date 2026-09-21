/** Ported from the prototype's SectionLabel (App.tsx) — small uppercase
 * heading used above grouped lists (e.g. "Owed to you" / "You owe"). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-2 pl-1 text-[0.72rem] font-bold uppercase tracking-[0.09em]"
      style={{ color: 'var(--t-dim)' }}
    >
      {children}
    </p>
  );
}
