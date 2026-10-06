// Ported from the Figma Make prototype's Avatar (App.tsx) per
// docs/WIRING_PLAN.md Phase 3 — initials-on-gradient, neomorphic raised
// shadow. Converted from inline styles to Tailwind arbitrary values,
// matching the Phase 1/2 auth screens' convention.

export interface AvatarProps {
  initials: string;
  /** A CSS color value, or a `var(--token)` reference (the prototype's mock
   * data uses both, e.g. "#6366f1" and "var(--c-amber)"). */
  color: string;
  size?: number;
  className?: string;
}

export function Avatar({ initials, color, size = 40, className = '' }: AvatarProps) {
  return (
    <div
      className={`neo-avatar flex shrink-0 items-center justify-center font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        background: `linear-gradient(145deg, ${color}dd, ${color})`,
        fontSize: size * 0.35,
        fontFamily: 'var(--font-display)',
      }}
    >
      {initials}
    </div>
  );
}
