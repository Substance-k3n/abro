// The frame the sign-in screens share (Stitch "Terracotta Kin" redesign):
// a centred column on the page canvas, the brand tile above, and a white
// card for the form. Terracotta shows up in the brand tile and the one
// primary button; everything else is neutral.

import { Logomark } from '@abro/ui';
import type { ReactNode } from 'react';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

/** The brand tile: the logo on the terracotta square. `icon` swaps the
 * logo for another glyph (the "check your email" step). */
export function BrandTile({ icon }: { icon?: ReactNode }) {
  return (
    <div
      className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px]"
      style={
        icon
          ? { background: 'var(--accent-light)', color: 'var(--accent)' }
          : { background: '#c2410c', boxShadow: '0 10px 24px -10px rgba(194, 65, 12, 0.55)' }
      }
      aria-hidden
    >
      {icon ?? <Logomark size={34} invert />}
    </div>
  );
}

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <h1
        className="font-display text-[1.7rem] font-semibold leading-tight tracking-tight"
        style={{ color: 'var(--t-primary)' }}
      >
        {title}
      </h1>
      {children && (
        <p className="mt-2 text-[0.9rem] leading-relaxed" style={{ color: 'var(--t-muted)' }}>
          {children}
        </p>
      )}
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="neo-raised rounded-[24px] p-5 sm:p-6">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl px-3.5 py-2.5 text-center text-[0.82rem] font-medium"
      style={{ color: 'var(--c-red-text)', background: 'var(--red-bg)' }}
    >
      {children}
    </p>
  );
}
