'use client';

// An in-page dialog for confirming admin actions (never the browser's
// confirm(): it can't show what's about to happen, or take a reason).
// Esc and the backdrop close it; focus moves into it on open and back
// to where it was on close.

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the open/close effect (which would
  // move focus) every time the parent re-renders.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>(
      'textarea, input, button:not([data-close])',
    );
    (first ?? box.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="bg-side/50 absolute inset-0 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="card relative w-full max-w-md shadow-2xl outline-none"
      >
        <div className="border-line flex items-center justify-between border-b px-6 py-4">
          <h2 id="modal-title" className="font-display text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="text-ink-3 hover:text-ink rounded-md p-1"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="text-ink-2 px-6 py-5 text-sm">{children}</div>
        <div className="bg-page/60 border-line flex justify-end gap-2 rounded-b-xl border-t px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
