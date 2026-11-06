import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Accessible bottom sheet on a native modal <dialog>: focus trap, Esc, inert background, focus returns. */
export function Sheet({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-xl pt-1.5">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmSheet({ open, onClose, onConfirm, title, children, confirmLabel, cancelLabel, busy, error }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="text-ink-soft">{children}</div>
      {error && <p role="alert" className="mt-3 font-medium text-madder">{error}</p>}
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{cancelLabel}</button>
        <button type="button" className="btn btn-quiet" onClick={onConfirm} disabled={busy}>
          {busy ? 'One moment' : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
