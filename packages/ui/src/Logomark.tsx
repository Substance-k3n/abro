// ABRO brand mark ("Together"): two overlapping circles -- green on the
// left, amber on the right, with the overlap in ink -- reading as "two
// people, one shared space." Built as SVG (not a raster export) so it
// stays crisp from the 16px favicon size up to the landing page hero.
//
// `invertLeft` swaps the left circle to white, for the one lockup that
// sits on the brand-green background itself (green-on-green would
// disappear) -- matches the brand kit's "On brand green" variant.

const GREEN = '#1eba5a';
const AMBER = '#f0a429';
const INK = '#10231c';

export interface LogomarkProps {
  size?: number;
  invertLeft?: boolean;
  className?: string;
}

export function Logomark({ size = 32, invertLeft = false, className }: LogomarkProps) {
  const clipId = `logomark-clip-${invertLeft ? 'inv' : 'std'}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="18" cy="32" r="20" />
        </clipPath>
      </defs>
      <circle cx="18" cy="32" r="20" fill={invertLeft ? '#ffffff' : GREEN} />
      <circle cx="46" cy="32" r="20" fill={AMBER} />
      <g clipPath={`url(#${clipId})`}>
        <circle cx="46" cy="32" r="20" fill={INK} />
      </g>
    </svg>
  );
}
