'use client';

// EXP-09's Receipt section (docs/ABRO_FRONTEND_SPEC.md: thumbnail, tap to
// view full, "Download receipt") over apps/api's receipt routes (PRD §36).
//
//  - The image URL is a presigned link that expires after five minutes
//    (storage stays private), so it's fetched when the section shows a
//    receipt and fetched again if the image fails to load later.
//  - Attach / Replace / Remove show only to someone who might edit the
//    expense (the same `canManage` rule as the page's actions menu);
//    apps/api's requireEditAuthority is the real check and its message
//    shows inline.
//  - A server with no object storage (the free-tier deploy until a
//    bucket is set up) answers 501, shown as a plain "not available"
//    note instead of an error.
//  - Type and size are checked here only to fail fast (RECEIPT_TYPES,
//    RECEIPT_MAX_BYTES); apps/api checks them again.
//  - The full view renders into document.body: the page wrapper's
//    .fade-in animation leaves a transform behind, which would otherwise
//    pin a `position: fixed` overlay to the content column.

import { Download, ImagePlus, Receipt, Trash2, X } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError } from '~/lib/api-client';
import {
  type AuthExpense,
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  deleteReceipt,
  getReceiptUrl,
  uploadReceipt,
} from '~/lib/expenses-api';

const NOT_CONFIGURED = 'RECEIPT_STORAGE_NOT_CONFIGURED';
const NOT_CONFIGURED_MESSAGE = "Receipts aren't available on this server yet.";

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.code === NOT_CONFIGURED ? NOT_CONFIGURED_MESSAGE : err.message;
  }
  return fallback;
}

export function ReceiptSection({
  expense,
  canManage,
  onChange,
}: {
  expense: AuthExpense;
  canManage: boolean;
  onChange: (expense: AuthExpense) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [retried, setRetried] = useState(false);

  const loadUrl = () => {
    getReceiptUrl(expense.id)
      .then(({ url }) => setUrl(url))
      .catch((err) => setError(messageFor(err, 'Could not load the receipt.')));
  };

  useEffect(() => {
    setUrl(null);
    setError(null);
    setRetried(false);
    if (expense.receiptPath) {
      loadUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense.id, expense.receiptPath]);

  useEffect(() => {
    if (!viewing) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing]);

  if (!expense.receiptPath && !canManage) {
    return null;
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (!RECEIPT_TYPES.includes(file.type)) {
      setError('Receipts must be JPG, PNG, or WebP.');
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setError('Receipt must be 10MB or smaller.');
      return;
    }
    setBusy('uploading');
    setError(null);
    try {
      onChange(await uploadReceipt(expense.id, file));
    } catch (err) {
      setError(messageFor(err, 'Could not upload the receipt. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('removing');
    setError(null);
    try {
      await deleteReceipt(expense.id);
      setConfirmingRemove(false);
      onChange({ ...expense, receiptPath: null });
    } catch (err) {
      setError(messageFor(err, 'Could not remove the receipt. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  // An open page can outlive the five-minute URL; fetch a fresh one once.
  const onImageError = () => {
    if (!retried) {
      setRetried(true);
      loadUrl();
    }
  };

  return (
    <div className="neo-raised-sm mb-4 rounded-[18px] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Receipt
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="flex items-center gap-1.5 text-[0.78rem] font-semibold disabled:opacity-50"
            style={{ color: 'var(--accent)' }}
          >
            <ImagePlus size={15} strokeWidth={2} />
            {busy === 'uploading' ? 'Uploading…' : expense.receiptPath ? 'Replace' : 'Attach'}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={RECEIPT_TYPES.join(',')}
          onChange={onFile}
          className="hidden"
          aria-label="Receipt image"
        />
      </div>

      {expense.receiptPath && url && (
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="neo-inset-sm block w-full overflow-hidden rounded-xl"
          aria-label="View full receipt"
        >
          {/* A presigned, short-lived URL: next/image can't optimise it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Receipt for ${expense.name}`}
            onError={onImageError}
            className="max-h-56 w-full object-contain"
          />
        </button>
      )}

      {expense.receiptPath && !url && !error && (
        <div
          className="neo-inset-sm flex h-32 items-center justify-center rounded-xl"
          style={{ color: 'var(--t-dim)' }}
        >
          <Receipt size={22} strokeWidth={1.5} />
        </div>
      )}

      {!expense.receiptPath && !error && (
        <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
          No receipt yet. Attach a JPG, PNG or WebP photo up to 10MB.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={
            error === NOT_CONFIGURED_MESSAGE
              ? { color: 'var(--t-dim)' }
              : { background: 'var(--red-bg)', color: 'var(--c-red)' }
          }
        >
          {error}
        </p>
      )}

      {canManage && expense.receiptPath && !confirmingRemove && (
        <button
          type="button"
          onClick={() => setConfirmingRemove(true)}
          disabled={busy !== null}
          className="mt-3 flex items-center gap-1.5 text-[0.78rem] font-semibold disabled:opacity-50"
          style={{ color: 'var(--c-red)' }}
        >
          <Trash2 size={14} strokeWidth={2} /> Remove receipt
        </button>
      )}

      {confirmingRemove && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[0.82rem]" style={{ color: 'var(--t-primary)' }}>
            Remove this receipt? It&apos;s deleted for everyone on the expense.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              disabled={busy !== null}
              className="neo-btn flex-1 rounded-xl px-4 py-2 text-[0.82rem] font-semibold"
              style={{ color: 'var(--t-secondary)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="flex-1 rounded-xl px-4 py-2 text-[0.82rem] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--c-red)' }}
            >
              {busy === 'removing' ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}

      {viewing &&
        url &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Receipt for ${expense.name}`}
            onClick={() => setViewing(false)}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4"
            style={{ background: 'rgba(0,0,0,0.85)' }}
          >
            <div className="flex w-full max-w-3xl justify-end gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="neo-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.8rem] font-semibold"
                style={{ color: 'var(--t-secondary)' }}
              >
                <Download size={15} strokeWidth={2} /> Open original
              </a>
              <button
                type="button"
                onClick={() => setViewing(false)}
                aria-label="Close receipt"
                className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Receipt for ${expense.name}`}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] max-w-full rounded-xl object-contain"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
