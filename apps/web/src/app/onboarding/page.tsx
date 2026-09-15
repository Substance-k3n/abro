'use client';

// AUTH-02 (Onboarding, 3 slides) — docs/ABRO_FRONTEND_SPEC.md §2.
// Ported from the prototype's OnboardingScreen. "Skip" and reaching the
// last slide both continue to sign-in, matching the original behavior.

import { BarChart2, Handshake, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SLIDES = [
  {
    icon: <Receipt size={52} strokeWidth={1.25} color="#6366f1" />,
    title: 'Track Expenses',
    desc: 'Record shared expenses between friends, family, and groups in seconds.',
  },
  {
    icon: <BarChart2 size={52} strokeWidth={1.25} color="#ec4899" />,
    title: 'Know Your Balance',
    desc: 'See exactly who owes you and who you owe — always up to date.',
  },
  {
    icon: <Handshake size={52} strokeWidth={1.25} color="#22c55e" />,
    title: 'Settle Up Easily',
    desc: 'Clear debts while keeping a complete, auditable history.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide]!;
  const isLast = slide === SLIDES.length - 1;

  const goToSignIn = () => router.push('/auth/signin');
  const advance = () => (isLast ? goToSignIn() : setSlide((s) => s + 1));

  return (
    <main className="fade-in flex min-h-screen flex-col items-center justify-between gap-10 px-8 py-12 sm:py-16">
      <div className="flex w-full justify-end">
        <button
          onClick={goToSignIn}
          className="text-sm font-medium"
          style={{ color: 'var(--t-dim)' }}
        >
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div
          className="neo-raised-lg flex h-[120px] w-[120px] items-center justify-center rounded-[40px]"
          aria-hidden
        >
          {current.icon}
        </div>
        <div className="max-w-[280px] text-center">
          <h2
            className="font-display text-[1.8rem] font-bold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            {current.title}
          </h2>
          <p className="mt-3 text-[0.95rem] leading-[1.65]" style={{ color: 'var(--t-muted)' }}>
            {current.desc}
          </p>
        </div>

        <div className="flex gap-2" role="tablist" aria-label="Onboarding slides">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              role="tab"
              aria-selected={i === slide}
              aria-label={`Slide ${i + 1}: ${s.title}`}
              onClick={() => setSlide(i)}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === slide ? 24 : 8,
                background: i === slide ? 'var(--accent)' : 'var(--neo-dark)',
                boxShadow: i === slide ? '0 0 8px rgba(99,102,241,0.4)' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <button
        onClick={advance}
        className="neo-btn-accent font-display w-full rounded-[18px] px-4 py-4 text-base font-semibold"
      >
        {isLast ? 'Get Started' : 'Next'}
      </button>
    </main>
  );
}
