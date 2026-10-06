'use client';

// Ported from the Figma Make prototype's Avatar (App.tsx) per
// docs/WIRING_PLAN.md Phase 3 — initials-on-gradient, neomorphic raised
// shadow. Converted from inline styles to Tailwind arbitrary values,
// matching the Phase 1/2 auth screens' convention.
//
// Roadmap Phase 4: an optional photo (`src`), layered over the initials.
// While it loads, and if it fails (it removes itself), the initials show
// underneath -- no state needed, so this file stays free of React imports.

export interface AvatarProps {
  initials: string;
  /** A CSS color value, or a `var(--token)` reference (the prototype's mock
   * data uses both, e.g. "#6366f1" and "var(--c-amber)"). */
  color: string;
  size?: number;
  className?: string;
  /** Photo URL, already absolute (the app resolves API paths). */
  src?: string | null;
  /** Alt text for the photo; empty by default, since a name is usually
   * shown right next to the avatar. */
  alt?: string;
}

export function Avatar({ initials, color, size = 40, className = '', src, alt = '' }: AvatarProps) {
  const radius = size / 3;
  return (
    <div
      className={`neo-avatar relative flex shrink-0 items-center justify-center overflow-hidden font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(145deg, ${color}dd, ${color})`,
        fontSize: size * 0.35,
        fontFamily: 'var(--font-display)',
      }}
    >
      {initials}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={(e) => e.currentTarget.remove()}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
