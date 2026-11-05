'use client';

// The dashboard's charts, drawn as plain SVG/HTML (no chart library):
//  - ActivityChart: one daily series at a time (tabs pick which), one
//    axis, a 2px line over a faint area, a crosshair + tooltip on hover
//    or arrow keys, and a table view for anyone who'd rather read rows.
//  - BarList: horizontal bars for "how much of each" (categories, group
//    types), one hue, values in text ink beside each bar.
// Colours: the brand accent for the single series; status colours only
// for state (the action queue), always with words.

import { useEffect, useMemo, useRef, useState } from 'react';

import { num, shortDay } from './ui';

export interface Point {
  day: string;
  value: number;
}

function niceMax(v: number): number {
  if (v <= 4) {
    return 4;
  }
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= v) {
      return m * pow;
    }
  }
  return 10 * pow;
}

const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 40 };

export function ActivityChart({ points, unit }: { points: Point[]; unit: [string, string] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
    // The chart's element is new each time the table view closes.
  }, [table]);

  const { max, x, y, line, area, total, peak } = useMemo(() => {
    const maxV = Math.max(0, ...points.map((p) => p.value));
    const max = niceMax(maxV);
    const iw = w - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const n = Math.max(1, points.length - 1);
    const x = (i: number) => PAD.left + (iw * i) / n;
    const y = (v: number) => PAD.top + ih - (ih * v) / max;
    const line = points
      .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join('');
    const area = points.length
      ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
      : '';
    const total = points.reduce((s, p) => s + p.value, 0);
    const peak = points.reduce<Point | null>((b, p) => (!b || p.value > b.value ? p : b), null);
    return { max, x, y, line, area, total, peak };
  }, [points, w]);

  const label = (v: number) => `${num(v)} ${v === 1 ? unit[0] : unit[1]}`;
  const ticks = [0, max / 2, max];
  const xLabels = points.length
    ? [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
        (v, i, a) => a.indexOf(v) === i,
      )
    : [];

  const pick = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || !points.length) {
      return;
    }
    const iw = w - PAD.left - PAD.right;
    const i = Math.round(((clientX - rect.left - PAD.left) / iw) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  const hp = hover !== null ? points[hover] : undefined;

  return (
    <div>
      <div className="text-ink-3 mb-3 flex items-baseline justify-between text-xs">
        <span>
          {peak && peak.value > 0
            ? `Busiest day ${shortDay(peak.day)} · ${label(peak.value)}`
            : 'Nothing yet in this range'}
        </span>
        <span>
          <span className="text-ink font-semibold">{num(total)}</span> in range
        </span>
      </div>
      {table ? (
        <div className="border-line max-h-[240px] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-page text-ink-3 sticky top-0 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-line border-t">
                  <td className="px-3 py-1.5">{shortDay(p.day)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={wrap}
          className="relative outline-none"
          tabIndex={0}
          role="img"
          aria-label={`${label(total)} over ${points.length} days. Use the arrow keys to read each day.`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
              return;
            }
            e.preventDefault();
            const last = points.length - 1;
            setHover((h) =>
              h === null
                ? last
                : Math.min(last, Math.max(0, h + (e.key === 'ArrowRight' ? 1 : -1))),
            );
          }}
        >
          <svg width={w} height={H} className="block overflow-visible">
            <defs>
              <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.16" />
                <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={w - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-line)"
                  strokeDasharray={t ? '3 4' : undefined}
                />
                <text
                  x={PAD.left - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-ink-3 text-[11px]"
                >
                  {num(t)}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                className="fill-ink-3 text-[11px]"
              >
                {points[i] && shortDay(points[i].day)}
              </text>
            ))}
            <path d={area} fill="url(#area)" />
            <path
              d={line}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {hp && hover !== null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={y(0)}
                  stroke="var(--color-ink-3)"
                  strokeWidth={1}
                />
                <circle
                  cx={x(hover)}
                  cy={y(hp.value)}
                  r={4.5}
                  fill="var(--color-accent)"
                  stroke="#fff"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
          {hp && hover !== null && (
            <div
              className="bg-side pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-2 text-xs text-white shadow-lg"
              // Above the point, or below it when the point is near the top, so
              // the tooltip never covers the value it describes.
              style={{
                left: Math.min(w - 70, Math.max(70, x(hover))),
                top: y(hp.value) < 64 ? y(hp.value) + 12 : y(hp.value) - 58,
              }}
            >
              <div className="text-side-muted">{shortDay(hp.day)}</div>
              <div className="font-semibold">{label(hp.value)}</div>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        className="text-accent mt-2 text-xs font-medium"
        onClick={() => setTable((t) => !t)}
      >
        {table ? 'Show chart' : 'Show as table'}
      </button>
    </div>
  );
}

export function BarList({
  rows,
  empty,
  format = num,
}: {
  rows: { key: string; label: string; value: number }[];
  empty: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) {
    return <p className="text-ink-3 py-6 text-center text-sm">{empty}</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${format(r.value)}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="text-ink-2 truncate">{r.label}</span>
            <span className="font-medium tabular-nums">{format(r.value)}</span>
          </div>
          <div className="bg-page h-2 rounded-full">
            <div
              className="bg-accent h-2 rounded-full"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
