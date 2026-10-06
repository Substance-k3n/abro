'use client';

// Edit profile (roadmap Phase 4b) -- the fields that used to be edited
// inline on PRF-01 (display name, username, default currency, language),
// now on their own screen behind Profile's "Edit profile", plus the
// profile photo (ADR-017): tap the avatar to add, change or remove it.
// The photo saves straight away; the other fields save with "Save
// Changes", which returns to Profile.
//
// Email stays read-only (it's how you sign in). Language is saved to the
// profile but the app's text is English only for now. Default currency is
// what apps/api uses for new personal expenses; groups keep their own.

import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { PhotoPicker } from '~/components/PhotoPicker';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, me, updateProfile } from '~/lib/auth-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { photoSrc, removeAvatar, uploadAvatar } from '~/lib/photos';

const CURRENCIES = ['ETB', 'USD', 'EUR'];
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'Amharic' },
];

export default function EditProfilePage() {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setProfile(null);
    me()
      .then(setProfile)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your profile.');
      });
  };

  useEffect(load, []);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!profile) {
    return <LoadingState />;
  }
  return <ProfileForm initial={profile} />;
}

function ProfileForm({ initial }: { initial: AuthProfile }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username ?? '');
  const [currency, setCurrency] = useState(initial.preferredCurrency);
  const [locale, setLocale] = useState(initial.locale);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const normalizedUsername = username.trim().toLowerCase();
  const changes = {
    ...(name.trim() !== saved.displayName ? { displayName: name.trim() } : {}),
    ...(normalizedUsername !== (saved.username ?? '') ? { username: normalizedUsername } : {}),
    ...(currency !== saved.preferredCurrency ? { preferredCurrency: currency } : {}),
    ...(locale !== saved.locale ? { locale } : {}),
  };
  const dirty = Object.keys(changes).length > 0;
  const valid = name.trim().length > 0 && normalizedUsername.length >= 3;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProfile(changes);
      setSaved(updated);
      setName(updated.displayName);
      setUsername(updated.username ?? '');
      setJustSaved(true);
      router.push('/profile');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="fade-in flex flex-col gap-5 px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/profile')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Profile
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Edit profile
        </h2>
        <div className="w-[52px]" />
      </div>

      {/* Profile header */}
      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <div className="pt-2">
          <PhotoPicker
            src={photoSrc(saved.avatarUrl)}
            initials={initialsOf(name || saved.displayName)}
            color={colorForId(saved.id)}
            onUpload={async (image) => setSaved(await uploadAvatar(image))}
            onRemove={async () => setSaved(await removeAvatar())}
          />
        </div>
        <Field label="Display name">
          <input
            className="neo-input"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            style={{ color: 'var(--t-primary)' }}
          />
        </Field>

        <Field label="Username">
          <div className="relative">
            <span
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[0.9rem] font-semibold"
              style={{ color: 'var(--t-dim)' }}
            >
              @
            </span>
            <input
              className="neo-input"
              value={username}
              maxLength={24}
              autoCapitalize="none"
              onChange={(e) => setUsername(e.target.value)}
              style={{ color: 'var(--t-primary)', paddingLeft: 32 }}
            />
          </div>
          <p className="mt-1 pl-1 text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
            3–24 characters: lowercase letters, digits, dots and underscores.
          </p>
        </Field>

        <div className="neo-inset-sm flex items-center gap-2 rounded-xl px-3 py-2.5">
          <span className="flex-1 truncate text-[0.82rem]" style={{ color: 'var(--t-secondary)' }}>
            {saved.email ?? 'No email on file'}
          </span>
          {saved.email && (
            <span
              className="flex items-center gap-1 text-[0.7rem] font-semibold"
              style={{ color: 'var(--c-green)' }}
            >
              <CheckCircle2 size={13} strokeWidth={2} /> Verified
            </span>
          )}
        </div>
      </section>

      {/* Preferences */}
      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <SectionTitle>Preferences</SectionTitle>
        <Field label="Default currency">
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`neo-tab flex-1 border-none font-mono ${currency === c ? 'active' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="mt-1 pl-1 text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
            Used for your personal expenses and settlements. Groups keep their own currency.
          </p>
        </Field>
        <Field label="Language">
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLocale(l.code)}
                className={`neo-tab flex-1 border-none ${locale === l.code ? 'active' : ''}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-1 pl-1 text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
            Saved to your profile. The app is in English only for now.
          </p>
        </Field>
      </section>

      {saveError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {saveError}
        </p>
      )}
      <button
        onClick={save}
        disabled={!dirty || !valid || saving}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? 'Saving…' : justSaved && !dirty ? 'Saved ✓' : 'Save Changes'}
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-display px-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
      style={{ color: 'var(--t-dim)' }}
    >
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        className="mb-1 block pl-1 text-[0.72rem] font-semibold"
        style={{ color: 'var(--t-muted)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
