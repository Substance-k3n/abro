import Link from 'next/link';

// AUTH-01 (Splash/Landing) — docs/ABRO_FRONTEND_SPEC.md §2.
// Ported from the Figma Make prototype's SplashScreen component, minus its
// fake phone-bezel/status-bar preview chrome — see docs/WIRING_PLAN.md.
// "Get Started" and "Sign In" point at routes Phase 2 hasn't built yet.
//
// Styles below read CSS custom properties that aren't in the Tailwind theme
// yet (--t-primary/--t-muted/--t-dim) — registering the token set into
// Tailwind's @theme is a Phase 1 follow-up; hoisted to module scope for now
// so they aren't recreated every render.

const logoTextStyle = {
  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
} as const;

const primaryTextStyle = { color: 'var(--t-primary)' } as const;
const mutedTextStyle = { color: 'var(--t-muted)' } as const;
const dimTextStyle = { color: 'var(--t-dim)' } as const;

export default function SplashPage() {
  return (
    <main className="fade-in flex min-h-screen flex-col items-center justify-between gap-16 px-8 py-16 sm:py-20">
      <div />

      <div className="flex flex-col items-center gap-6 text-center">
        <div
          className="neo-raised-lg flex h-[100px] w-[100px] items-center justify-center rounded-[32px]"
          aria-hidden
        >
          <span
            className="font-display text-4xl font-extrabold tracking-tighter"
            style={logoTextStyle}
          >
            AB
          </span>
        </div>

        <div>
          <h1
            className="font-display text-[2.6rem] font-extrabold leading-[1.1] tracking-tighter"
            style={primaryTextStyle}
          >
            ABRO
          </h1>
          <p className="mx-auto mt-2 max-w-[240px] text-base" style={mutedTextStyle}>
            Remember every expense.
            <br />
            <span style={dimTextStyle}>Forget the confusion.</span>
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-[340px] flex-col gap-3.5">
        <Link
          href="/onboarding"
          className="neo-btn-accent font-display rounded-[18px] px-4 py-4 text-center text-base font-semibold tracking-wide"
        >
          Get Started
        </Link>
        <Link
          href="/auth/signin"
          className="neo-btn rounded-[18px] px-4 py-4 text-center text-sm font-medium"
          style={mutedTextStyle}
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
