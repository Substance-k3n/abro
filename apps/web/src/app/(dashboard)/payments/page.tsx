'use client';

// Payments (ADR-019; no ABRO_FRONTEND_SPEC.md screen). Payments someone
// recorded wait here until the person paid confirms them:
//  - To confirm: payments others say they made to you. Confirm (the
//    balance moves) or "Not received" (nothing changes, they're told).
//    Their proof-of-payment photo, if any, opens inline first.
//  - Waiting on them: payments you recorded. Add or replace a photo, or
//    cancel one you recorded by mistake.
//  - Recent: resolved in the last 30 days, with what happened.
// Reached from Home's "to confirm" banner, payment notifications, and
// the settle-up success screen. Confirmed settlements also stay in
// Settlement history (/settlements), linked from the header.

import { ETB, formatMoney } from '@abro/types';
import { Avatar, EmptyState, SectionLabel } from '@abro/ui';
import { ArrowLeft, Check, History, Image as ImageIcon, ImagePlus, Wallet, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from '~/lib/expenses-api';
import { formatShortDate } from '~/lib/format';
import { colorForId, initialsOf } from '~/lib/identity';
import { photoSrc } from '~/lib/photos';
import {
  type SettlementRequest,
  cancelSettlementRequest,
  confirmSettlementRequest,
  getSettlementReceiptUrl,
  listSettlementRequests,
  rejectSettlementRequest,
  uploadSettlementReceipt,
} from '~/lib/settlements-api';

interface Data {
  myId: string;
  requests: SettlementRequest[];
}

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  CONFIRMED: { text: 'Confirmed', color: 'var(--c-green-text)' },
  REJECTED: { text: 'Not received', color: 'var(--c-red-text)' },
  CANCELLED: { text: 'Cancelled', color: 'var(--t-dim)' },
};

export default function PaymentsPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  const load = () => {
    setLoadError(null);
    Promise.all([me(), listSettlementRequests()])
      .then(([profile, requests]) => setData({ myId: profile.id, requests }))
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Could not load your payments.'),
      );
  };

  useEffect(load, []);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const pending = data.requests.filter((r) => r.status === 'PENDING');
  const toConfirm = pending.filter((r) => r.recipient.id === data.myId);
  const waiting = pending.filter((r) => r.payer.id === data.myId);
  const recent = data.requests.filter((r) => r.status !== 'PENDING');

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      setConfirmReject(null);
      load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    }
    setBusy(null);
  };

  const showPhoto = async (r: SettlementRequest) => {
    if (photos[r.id]) {
      setPhotos(({ [r.id]: _, ...rest }) => rest);
      return;
    }
    setBusy(`photo:${r.id}`);
    setActionError(null);
    try {
      const { url } = await getSettlementReceiptUrl(r.id);
      setPhotos((p) => ({ ...p, [r.id]: url }));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not load the photo.');
    }
    setBusy(null);
  };

  const addPhoto = (r: SettlementRequest, file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!RECEIPT_TYPES.includes(file.type)) {
      setActionError('Photos must be JPG, PNG or WebP.');
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setActionError('Photos must be 10 MB or smaller.');
      return;
    }
    void run(`upload:${r.id}`, () => uploadSettlementReceipt(r.id, file), 'Photo added.');
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between gap-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Payments
        </h2>
        <Link
          href="/settlements"
          aria-label="Settlement history"
          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
        >
          <History size={17} strokeWidth={2} />
        </Link>
      </div>

      {(actionError || notice) && (
        <p
          role={actionError ? 'alert' : 'status'}
          className="mb-4 rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={
            actionError
              ? { background: 'var(--red-bg)', color: 'var(--c-red)' }
              : { background: 'var(--green-bg)', color: 'var(--c-green-text)' }
          }
        >
          {actionError ?? notice}
        </p>
      )}

      {data.requests.length === 0 ? (
        <EmptyState
          icon={<Wallet size={26} strokeWidth={1.5} />}
          title="No payments to confirm"
          description="When someone says they paid you, it shows here for you to confirm."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {toConfirm.length > 0 && (
            <section>
              <SectionLabel>To confirm ({toConfirm.length})</SectionLabel>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {toConfirm.map((r) => (
                  <Card
                    key={r.id}
                    request={r}
                    person={r.payer}
                    line={`${firstName(r.payer.displayName)} says they paid you`}
                    photo={photos[r.id]}
                  >
                    {confirmReject === r.id ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-[0.8rem]" style={{ color: 'var(--t-secondary)' }}>
                          Say you didn&apos;t receive this? Nothing changes in your balance, and{' '}
                          {firstName(r.payer.displayName)} is told.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmReject(null)}
                            disabled={busy !== null}
                            className="neo-btn flex-1 rounded-xl py-2 text-[0.8rem] font-semibold"
                            style={{ color: 'var(--t-secondary)' }}
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              run(
                                `reject:${r.id}`,
                                () => rejectSettlementRequest(r.id),
                                'Marked as not received.',
                              )
                            }
                            className="flex-1 rounded-xl py-2 text-[0.8rem] font-semibold text-white disabled:opacity-50"
                            style={{ background: 'var(--c-red)' }}
                          >
                            {busy === `reject:${r.id}` ? 'Saving…' : 'Not received'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {r.hasReceipt && (
                          <button
                            type="button"
                            onClick={() => showPhoto(r)}
                            disabled={busy !== null}
                            className="neo-btn flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[0.78rem] font-semibold"
                            style={{ color: 'var(--accent)' }}
                          >
                            <ImageIcon size={14} strokeWidth={2} />
                            {photos[r.id] ? 'Hide' : 'Photo'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setConfirmReject(r.id);
                          }}
                          disabled={busy !== null}
                          className="neo-btn flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[0.78rem] font-semibold"
                          style={{ color: 'var(--c-red)' }}
                        >
                          <X size={14} strokeWidth={2.25} /> Not received
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              `confirm:${r.id}`,
                              () => confirmSettlementRequest(r.id),
                              `Confirmed. ${firstName(r.payer.displayName)}'s balance is updated.`,
                            )
                          }
                          disabled={busy !== null}
                          className="neo-btn-green flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[0.78rem] font-semibold disabled:opacity-50"
                        >
                          <Check size={14} strokeWidth={2.25} />
                          {busy === `confirm:${r.id}` ? 'Confirming…' : 'Confirm'}
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}

          {waiting.length > 0 && (
            <section>
              <SectionLabel>Waiting on them ({waiting.length})</SectionLabel>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {waiting.map((r) => (
                  <Card
                    key={r.id}
                    request={r}
                    person={r.recipient}
                    line={`You paid ${firstName(r.recipient.displayName)} · waiting for them to confirm`}
                    photo={photos[r.id]}
                  >
                    <div className="flex gap-2">
                      <label
                        className="neo-btn flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-[0.78rem] font-semibold"
                        style={{ color: 'var(--accent)' }}
                      >
                        <ImagePlus size={14} strokeWidth={2} />
                        {busy === `upload:${r.id}`
                          ? 'Uploading…'
                          : r.hasReceipt
                            ? 'Replace photo'
                            : 'Add photo'}
                        <input
                          type="file"
                          accept={RECEIPT_TYPES.join(',')}
                          className="sr-only"
                          disabled={busy !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            addPhoto(r, file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            `cancel:${r.id}`,
                            () => cancelSettlementRequest(r.id),
                            'Payment cancelled.',
                          )
                        }
                        className="neo-btn flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[0.78rem] font-semibold"
                        style={{ color: 'var(--c-red)' }}
                      >
                        <X size={14} strokeWidth={2.25} />
                        {busy === `cancel:${r.id}` ? 'Cancelling…' : 'Cancel'}
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section>
              <SectionLabel>Recent</SectionLabel>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {recent.map((r) => {
                  const mine = r.payer.id === data.myId;
                  const other = mine ? r.recipient : r.payer;
                  const status = STATUS_LABELS[r.status]!;
                  return (
                    <div
                      key={r.id}
                      className="neo-flat flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
                    >
                      <Avatar
                        initials={initialsOf(other.displayName)}
                        color={colorForId(other.id)}
                        size={34}
                        src={photoSrc(other.avatarUrl)}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[0.82rem]"
                          style={{ color: 'var(--t-secondary)' }}
                        >
                          {mine
                            ? `You paid ${firstName(other.displayName)}`
                            : `${firstName(other.displayName)} paid you`}
                        </p>
                        <p className="text-[0.72rem] font-semibold" style={{ color: status.color }}>
                          {status.text}
                        </p>
                      </div>
                      <span
                        className="font-mono text-[0.8rem] font-semibold"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        {formatMoney(BigInt(r.amount), ETB)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function firstName(name: string): string {
  return name.split(' ')[0]!;
}

function Card({
  request,
  person,
  line,
  photo,
  children,
}: {
  request: SettlementRequest;
  person: SettlementRequest['payer'];
  line: string;
  photo: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="neo-raised-sm flex flex-col gap-3 rounded-2xl p-3.5">
      <div className="flex items-center gap-3">
        <Avatar
          initials={initialsOf(person.displayName)}
          color={colorForId(person.id)}
          size={40}
          src={photoSrc(person.avatarUrl)}
        />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[0.85rem] font-semibold"
            style={{ color: 'var(--t-primary)' }}
          >
            {line}
          </p>
          <p className="truncate text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
            {request.groupName ? `${request.groupName} · ` : request.groupId ? 'Group · ' : ''}
            {formatShortDate(request.createdAt)}
            {request.hasReceipt ? ' · photo attached' : ''}
          </p>
        </div>
        <span className="font-mono text-[0.95rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          {formatMoney(BigInt(request.amount), ETB)}
        </span>
      </div>
      {photo && (
        // A presigned bucket URL, so next/image's optimizer can't be used.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt="Proof of payment"
          className="max-h-80 w-full rounded-xl object-contain"
          style={{ background: 'var(--neo-bg2)' }}
        />
      )}
      {children}
    </div>
  );
}
