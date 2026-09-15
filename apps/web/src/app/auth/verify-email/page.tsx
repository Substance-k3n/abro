'use client';

// AUTH-05 (Email OTP Verification) — docs/ABRO_FRONTEND_SPEC.md §2.
// Ported from the prototype's OTPScreen: auto-advances focus per digit,
// auto-submits once all 6 digits are filled.

import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (otp.every((digit) => digit)) {
      const timer = setTimeout(() => router.push('/auth/setup-profile'), 400);
      return () => clearTimeout(timer);
    }
  }, [otp, router]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) {
      return;
    }
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <main className="fade-in flex min-h-screen flex-col items-center px-7 py-16 sm:py-20">
      <div
        className="neo-raised-lg mb-7 flex h-[72px] w-[72px] items-center justify-center rounded-[24px]"
        aria-hidden
      >
        <Mail size={32} strokeWidth={1.5} color="var(--accent)" />
      </div>

      <h2
        className="font-display text-center text-[1.8rem] font-bold tracking-tight"
        style={{ color: 'var(--t-primary)' }}
      >
        Check your email
      </h2>
      <p
        className="mb-10 mt-2 text-center text-sm leading-relaxed"
        style={{ color: 'var(--t-muted)' }}
      >
        We sent a 6-digit code to
        <br />
        <strong style={{ color: 'var(--t-secondary)' }}>you@example.com</strong>
      </p>

      <div className="mb-8 flex gap-2.5">
        {otp.map((digit, index) => (
          <input
            // Fixed 6-slot positional layout that never reorders — index is the
            // correct, stable identity for "digit N of the code", not a code smell here.
            key={`otp-digit-${index}`}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            className="otp-box"
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            aria-label={`Digit ${index + 1} of 6`}
          />
        ))}
      </div>

      <button
        onClick={() => router.push('/auth/setup-profile')}
        className="neo-btn-accent font-display mb-4 w-full max-w-[340px] rounded-[18px] px-4 py-4 text-base font-semibold"
      >
        Verify Code
      </button>
      <button
        type="button"
        className="text-[0.85rem] font-medium"
        style={{ color: 'var(--accent)' }}
      >
        Resend code (0:48)
      </button>
    </main>
  );
}
