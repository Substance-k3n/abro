'use client';

// Small shared pieces of the portal: avatars, page headers, empty and
// error states, and plain number/date formatting.

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

const nf = new Intl.NumberFormat('en-US');
export const num = (n: number) => nf.format(n);

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Addis_Ababa',
});
/** "5 Nov" for a YYYY-MM-DD Addis day (read at noon, so no zone can move it). */
export const shortDay = (day: string) => dayFmt.format(new Date(`${day}T12:00:00+03:00`));

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

/** Uploaded photos are API paths (/users/{id}/avatar/...): through /api
 * here. Google photos are full URLs. Falls back to initials if the image
 * won't load. */
export function Avatar({
  name,
  url,
  size = 32,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const src = url ? (url.startsWith('/') ? `/api${url}` : url) : null;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny avatar, no optimizer needed
      <img
        src={src}
        alt=""
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className="bg-accent-soft text-accent-strong inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="text-ink-3 mt-1 text-sm">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex items-center gap-4 p-5" role="alert">
      <AlertTriangle className="text-bad size-5 shrink-0" aria-hidden />
      <div className="text-ink-2 flex-1 text-sm">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-line/70 animate-pulse rounded-lg ${className}`} />;
}

/** A segmented control (e.g. the 7d / 30d / 90d range). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-line inline-flex rounded-lg border bg-white p-0.5"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${
            o.value === value ? 'bg-side text-white' : 'text-ink-2 hover:bg-page'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
