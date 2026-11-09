// ABRO brand mark ("Linked"): two people -- head + a flat-bottomed
// "shoulders" dome each -- overlapping at the shoulder to read as
// connected, not separate. Single color by design (unlike the old
// two-circle "Together" mark), so it holds up at favicon size and as a
// flat app-icon glyph. The dome is a half-circle closed with a straight
// line, not a full circle: two full circles stacked reads as a face
// (two dot eyes + a round chin) at small sizes.
//
// `invert` swaps the fill to white, for the lockup that sits on the
// brand orange itself (orange-on-orange would disappear).

const ORANGE = '#ff5a1f';
const HEAD_R = 6.5;
const HEAD_CY = 25;
const BODY_R = 16;
const BASELINE = 45;

export interface LogomarkProps {
  size?: number;
  invert?: boolean;
  className?: string;
}

function Person({ cx, fill }: { cx: number; fill: string }) {
  return (
    <>
      <circle cx={cx} cy={HEAD_CY} r={HEAD_R} fill={fill} />
      <path
        d={`M ${cx - BODY_R} ${BASELINE} A ${BODY_R} ${BODY_R} 0 0 1 ${cx + BODY_R} ${BASELINE} Z`}
        fill={fill}
      />
    </>
  );
}

export function Logomark({ size = 32, invert = false, className }: LogomarkProps) {
  const fill = invert ? '#ffffff' : ORANGE;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <Person cx={20} fill={fill} />
      <Person cx={44} fill={fill} />
    </svg>
  );
}
