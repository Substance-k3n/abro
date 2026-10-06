'use client';

// A tappable avatar for choosing a photo (roadmap Phase 4): profile setup,
// Edit profile, and group settings. Tapping it (or "Add photo") opens the
// phone's picker -- camera or library -- and the chosen image is cropped
// square and shrunk (lib/photos.ts) before `onUpload` sends it. "Remove
// photo" appears when there is one. Errors show underneath, including the
// API's "photo storage isn't configured" answer.

import { Avatar } from '@abro/ui';
import { Camera } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';

import { ApiError } from '~/lib/api-client';
import { prepareImage } from '~/lib/photos';

export function PhotoPicker({
  src,
  initials,
  color,
  size = 96,
  onUpload,
  onRemove,
  label = 'photo',
}: {
  src: string | null;
  initials: string;
  color: string;
  size?: number;
  onUpload: (image: Blob) => Promise<void>;
  onRemove?: () => Promise<void>;
  /** What the photo is, for button text: "photo", "group photo". */
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'uploading' | 'removing', action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'PHOTO_STORAGE_NOT_CONFIGURED'
            ? "Photos aren't available on this server yet."
            : err.message,
        );
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void run('uploading', async () => onUpload(await prepareImage(file)));
    }
  };

  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy !== null}
        aria-label={src ? `Change ${label}` : `Add ${label}`}
        className="relative disabled:opacity-70"
      >
        <Avatar initials={initials} color={color} size={size} src={src} />
        <span
          className="neo-raised-sm absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full"
          style={{ color: 'var(--accent)' }}
          aria-hidden
        >
          <Camera size={15} strokeWidth={2.25} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
        aria-label={`Choose ${label}`}
      />
      <div className="flex items-center gap-4 text-[0.8rem] font-semibold">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy !== null}
          style={{ color: 'var(--accent)' }}
          className="disabled:opacity-60"
        >
          {busy === 'uploading' ? 'Uploading…' : src ? `Change ${label}` : `Add ${label}`}
        </button>
        {src && onRemove && (
          <button
            type="button"
            onClick={() => void run('removing', onRemove)}
            disabled={busy !== null}
            style={{ color: 'var(--c-red)' }}
            className="disabled:opacity-60"
          >
            {busy === 'removing' ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="max-w-xs text-center text-[0.78rem]"
          style={{ color: 'var(--c-red)' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
