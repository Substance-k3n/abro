'use client';

// AUTH-06 (Setup Profile) — docs/ABRO_FRONTEND_SPEC.md §2.
// Ported from the prototype's SetUsernameScreen. Username availability is
// still a client-side mock (a hardcoded TAKEN list + a fake 600ms check) —
// Phase 8 replaces this with a real apps/api call.

import { CheckCircle2, Hash, PenLine, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const TAKEN_USERNAMES = ['abel', 'hana', 'nesredin', 'meron', 'dawit', 'abro'];
const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#14b8a6', '#8b5cf6', '#f43f5e'];

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9_.]/g, '');

const initialsOf = (fullName: string) => {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed
    .split(' ')
    .map((word) => word[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
};

export default function SetupProfilePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [avatarIndex, setAvatarIndex] = useState(0);

  const isValidFormat = username.length >= 3;
  const canContinue = isValidFormat && fullName.trim().length >= 2 && available === true;
  const avatarColor = AVATAR_COLORS[avatarIndex]!;

  const checkUsername = (value: string) => {
    const slug = slugify(value);
    setUsername(slug);
    setAvailable(null);
    if (slug.length < 3) {
      return;
    }
    setChecking(true);
    setTimeout(() => {
      setAvailable(!TAKEN_USERNAMES.includes(slug));
      setChecking(false);
    }, 600);
  };

  return (
    <main className="fade-in flex min-h-screen flex-col px-7 py-12 sm:py-16">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="mb-8">
          <h2
            className="font-display text-[2rem] font-extrabold tracking-tighter"
            style={{ color: 'var(--t-primary)' }}
          >
            Set up your profile
          </h2>
          <p className="mt-1.5 text-sm leading-snug" style={{ color: 'var(--t-muted)' }}>
            Pick a username so friends can find and pay you easily.
          </p>
        </div>

        <div className="mb-8 flex items-center gap-5">
          <div className="relative shrink-0">
            <div
              className="neo-raised flex h-[72px] w-[72px] items-center justify-center rounded-[24px]"
              style={{
                background: avatarColor,
                boxShadow: `6px 6px 16px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.8), 0 0 0 3px var(--neo-bg), 0 0 0 5px ${avatarColor}55`,
              }}
            >
              <span className="font-display text-2xl font-extrabold tracking-tight text-white">
                {initialsOf(fullName)}
              </span>
            </div>
            <div className="neo-flat absolute -bottom-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-[9px]">
              <PenLine size={12} strokeWidth={2} color="var(--t-muted)" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p
              className="mb-0.5 text-[0.72rem] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--t-dim)' }}
            >
              Avatar color
            </p>
            <div className="flex gap-2">
              {AVATAR_COLORS.map((color, index) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Avatar color ${index + 1}`}
                  onClick={() => setAvatarIndex(index)}
                  className="h-[26px] w-[26px] rounded-[9px] transition-transform duration-200"
                  style={{
                    background: color,
                    boxShadow:
                      avatarIndex === index
                        ? `0 0 0 2px var(--neo-bg), 0 0 0 4px ${color}, 3px 3px 8px rgba(0,0,0,0.15)`
                        : '2px 2px 6px rgba(0,0,0,0.12), -1px -1px 4px rgba(255,255,255,0.6)',
                    transform: avatarIndex === index ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5">
          <div>
            <label
              htmlFor="fullName"
              className="mb-2 block pl-1 text-[0.8rem] font-semibold"
              style={{ color: 'var(--t-muted)' }}
            >
              Full name
            </label>
            <input
              id="fullName"
              className="neo-input"
              placeholder="Nesredin Haile"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="username"
              className="mb-2 block pl-1 text-[0.8rem] font-semibold"
              style={{ color: 'var(--t-muted)' }}
            >
              Username
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[0.9rem] font-semibold transition-colors"
                style={{ color: username.length > 0 ? 'var(--accent)' : 'var(--t-dim)' }}
              >
                @
              </span>
              <input
                id="username"
                className="neo-input pl-[30px] pr-11 font-mono"
                placeholder="your.username"
                value={username}
                onChange={(e) => checkUsername(e.target.value)}
              />
              <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center">
                {checking && (
                  <div
                    className="h-4 w-4 rounded-full border-2"
                    style={{
                      borderColor: 'rgba(99,102,241,0.3)',
                      borderTopColor: 'var(--accent)',
                      animation: 'spin 0.7s linear infinite',
                    }}
                  />
                )}
                {!checking && available === true && (
                  <CheckCircle2 size={18} strokeWidth={2} color="#22c55e" />
                )}
                {!checking && available === false && (
                  <XCircle size={18} strokeWidth={2} color="#ef4444" />
                )}
              </div>
            </div>

            <div className="mt-2 min-h-[20px] pl-1">
              {username.length > 0 && username.length < 3 && (
                <p className="text-[0.74rem]" style={{ color: 'var(--t-dim)' }}>
                  At least 3 characters required
                </p>
              )}
              {!checking && available === true && (
                <p className="text-[0.74rem] font-semibold" style={{ color: 'var(--c-green)' }}>
                  @{username} is available
                </p>
              )}
              {!checking && available === false && (
                <p className="text-[0.74rem] font-semibold" style={{ color: 'var(--c-red)' }}>
                  @{username} is already taken
                </p>
              )}
            </div>
          </div>

          {available === false && (
            <div>
              <p className="mb-2 text-[0.74rem] font-semibold" style={{ color: 'var(--t-dim)' }}>
                Try one of these:
              </p>
              <div className="flex flex-wrap gap-2">
                {[`${username}1`, `${username}_eth`, `${username}.abro`].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => checkUsername(suggestion)}
                    className="neo-btn rounded-[10px] px-3 py-1.5 font-mono text-[0.76rem] font-semibold"
                    style={{ color: 'var(--accent)' }}
                  >
                    @{suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="neo-inset-sm flex items-start gap-2.5 rounded-2xl px-3.5 py-3">
            <Hash size={14} strokeWidth={2} color="var(--t-dim)" className="mt-px shrink-0" />
            <p className="text-[0.76rem] leading-relaxed" style={{ color: 'var(--t-dim)' }}>
              Use letters, numbers, dots and underscores only. Your username is public and how
              friends find you on ABRO.
            </p>
          </div>
        </div>

        <div className="pt-6">
          <button
            onClick={() => router.push('/home')}
            disabled={!canContinue}
            className="neo-btn-accent font-display w-full rounded-[18px] px-4 py-4 text-base font-bold transition-opacity duration-200 disabled:cursor-default disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </div>
    </main>
  );
}
