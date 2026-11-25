/** The small heading above grouped lists (e.g. "Owed to you" / "You owe"),
 * styled by `.section-label` in the web app's globals.css. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="section-label mb-2 pl-1" style={{ color: 'var(--t-dim)' }}>
      {children}
    </p>
  );
}
