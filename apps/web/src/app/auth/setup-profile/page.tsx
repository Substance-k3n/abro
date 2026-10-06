'use client';

// AUTH-06 (Setup Profile) — docs/ABRO_FRONTEND_SPEC.md §2. Picks the
// username and display name real accounts didn't get during sign-in
// (both OTP and Google auto-create a profile with no username --
// apps/api/internal/auth/service.go -- `username: null` on the returned
// AuthProfile is exactly what routes a fresh sign-in here instead of
// straight to /home, see ~/lib/auth-api.ts's postSignInPath()).
//
// Phase 8 rewiring (docs/WIRING_PLAN.md): the availability check now
// calls the real GET /users/username-available (~/lib/auth-api.ts),
// debounced 400ms after typing stops, replacing the old hardcoded
// TAKEN_USERNAMES list + fake 600ms timeout. Continue calls the real
// PATCH /users/me with {username, displayName}, then routes to /home.
//
// Roadmap Phase 4b: an optional profile photo (ADR-017) replaces the old
// color swatch picker, which was cosmetic only and never saved. The photo
// uploads as soon as it's chosen (the profile already exists, only the
// username is missing); a Google sign-in's picture shows here already.
// Without a photo, the avatar is initials on the color derived from your
// id, the same as everywhere else in the app.

import { CheckCircle2, Hash, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { PhotoPicker } from '~/components/PhotoPicker';
import { ApiError } from '~/lib/api-client';
import {
  type AuthProfile,
  checkUsernameAvailable,
  me,
  postSignInPath,
  updateProfile,
} from '~/lib/auth-api';
import { colorForId } from '~/lib/identity';
import { photoSrc, removeAvatar, uploadAvatar } from '~/lib/photos';

const USERNAME_DEBOUNCE_MS = 400;

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
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const isValidFormat = username.length >= 3;
  const canContinue =
    isValidFormat && fullName.trim().length >= 2 && available === true && !submitting;

  const checkUsername = (value: string) => {
    const slug = slugify(value);
    setUsername(slug);
    setAvailable(null);
    setSubmitError(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (slug.length < 3) {
      setChecking(false);
      return;
    }

    setChecking(true);
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(() => {
      checkUsernameAvailable(slug)
        .then(({ available: isAvailable }) => {
          if (seq === requestSeq.current) {
            setAvailable(isAvailable);
            setChecking(false);
          }
        })
        .catch(() => {
          if (seq === requestSeq.current) {
            setChecking(false);
          }
        });
    }, USERNAME_DEBOUNCE_MS);
  };

  // Who's signing up (for the photo and avatar color). A Google sign-in
  // also brings its name, which pre-fills the field.
  useEffect(() => {
    me()
      .then((p) => {
        setProfile(p);
        setFullName((current) => current || (p.displayName.includes('@') ? '' : p.displayName));
      })
      .catch(() => {
        // The photo picker just doesn't show; the rest of setup works.
      });
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const submit = async () => {
    if (!canContinue) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const profile = await updateProfile({ username, displayName: fullName.trim() });
      // Home, or back to a friend invite opened before signing up.
      router.push(postSignInPath(profile));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'USERNAME_TAKEN') {
        setAvailable(false);
        setSubmitError(err.message);
      } else {
        setSubmitError(
          err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
        );
      }
      setSubmitting(false);
    }
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

        <div className="mb-8 flex flex-col items-center gap-1">
          {profile && (
            <PhotoPicker
              src={photoSrc(profile.avatarUrl)}
              initials={initialsOf(fullName)}
              color={colorForId(profile.id)}
              size={84}
              onUpload={async (image) => setProfile(await uploadAvatar(image))}
              onRemove={async () => setProfile(await removeAvatar())}
            />
          )}
          <p className="text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
            Optional. Helps friends recognise you.
          </p>
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

          {submitError && (
            <p className="text-center text-[0.8rem] font-medium" style={{ color: 'var(--c-red)' }}>
              {submitError}
            </p>
          )}
        </div>

        <div className="pt-6">
          <button
            onClick={submit}
            disabled={!canContinue}
            className="neo-btn-accent font-display w-full rounded-[18px] px-4 py-4 text-base font-bold transition-opacity duration-200 disabled:cursor-default disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </main>
  );
}
