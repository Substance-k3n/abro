'use client';

// "Invite with your link" (roadmap Phase 3b), on Add Friend: your
// personal link (abro.../add/<username>) with Share (the phone's share
// sheet, e.g. straight into Telegram), Copy, and a QR code someone can
// scan from your screen. Whoever opens it gets a one-tap "Add as friend"
// page, even if they still have to sign up first (lib/invite.ts).

import { Check, Copy, QrCode, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { me } from '~/lib/auth-api';
import { inviteUrl } from '~/lib/invite';

export function InviteCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator.share === 'function');
    me()
      .then((profile) => {
        if (profile.username) {
          setUrl(inviteUrl(profile.username));
          setName(profile.displayName);
        }
      })
      .catch(() => {
        // No card without a profile; search still works.
      });
  }, []);

  if (!url) {
    return null;
  }

  const share = async () => {
    try {
      await navigator.share({
        title: 'Add me on ABRO',
        text: `Add ${name} on ABRO to split expenses together.`,
        url,
      });
    } catch {
      // Closing the share sheet throws; nothing to do.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is shown, so it can be selected by hand.
    }
  };

  const toggleQr = async () => {
    if (qrSvg) {
      setQrSvg(null);
      return;
    }
    // A plain black-on-white code with a quiet zone scans reliably in
    // either theme. The text is our own origin plus a validated username.
    setQrSvg(
      await QRCode.toString(url, {
        type: 'svg',
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1c1a33', light: '#ffffff' },
      }),
    );
  };

  const button =
    'neo-btn flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[0.8rem] font-semibold';

  return (
    <div className="neo-raised-sm mb-6 flex flex-col gap-3 rounded-[20px] p-4">
      <div>
        <p className="font-display text-[0.95rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Invite with your link
        </p>
        <p className="mt-0.5 text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
          Anyone who opens it can add you in one tap, even before they&apos;ve signed up.
        </p>
      </div>
      <p
        className="neo-inset-sm truncate rounded-xl px-3 py-2.5 font-mono text-[0.78rem]"
        style={{ color: 'var(--t-secondary)' }}
      >
        {url.replace(/^https?:\/\//, '')}
      </p>
      <div className="flex gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            className={button}
            style={{ color: 'var(--accent)' }}
          >
            <Share2 size={15} strokeWidth={2} /> Share
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className={button}
          style={{ color: 'var(--t-secondary)' }}
        >
          {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={2} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={toggleQr}
          aria-expanded={qrSvg !== null}
          className={button}
          style={{ color: 'var(--t-secondary)' }}
        >
          <QrCode size={15} strokeWidth={2} /> {qrSvg ? 'Hide QR' : 'QR code'}
        </button>
      </div>
      {qrSvg && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <div
            className="w-52 overflow-hidden rounded-2xl bg-white p-1"
            role="img"
            aria-label={`QR code for ${url}`}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
            Let a friend scan this with their phone camera.
          </p>
        </div>
      )}
    </div>
  );
}
