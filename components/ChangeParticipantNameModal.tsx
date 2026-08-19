import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, ArrowRight, Database, RotateCcw, X } from 'lucide-react';

type ParticipantNameField = 'f_name' | 'l_name';

interface ChangeParticipantNameModalProps {
  field: ParticipantNameField;
  previousName: string;
  newName: string;
  onDismiss: () => void;
  onKeepOriginal: () => void;
  onConfirm: () => void;
}

const ChangeParticipantNameModal: React.FC<ChangeParticipantNameModalProps> = ({
  field,
  previousName,
  newName,
  onDismiss,
  onKeepOriginal,
  onConfirm
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepOriginalButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const fieldLabel = field === 'f_name' ? 'first name' : 'last name';

  useEffect(() => {
    keepOriginalButtonRef.current?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onDismiss]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onDismiss}
      />

      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleDialogKeyDown}
        className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-slate-200 bg-card shadow-[0_24px_80px_-24px_rgba(15,23,42,0.55)] animate-in slide-in-from-bottom-4 duration-200 sm:rounded-[28px] sm:zoom-in-95"
      >
        <div className="relative overflow-hidden border-b border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50/70 to-white px-5 pb-5 pt-6 sm:px-6">
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full border-[18px] border-white/60" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
              <AlertTriangle size={21} strokeWidth={2.25} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Record-wide change</p>
              <h2 id={titleId} className="text-xl font-bold tracking-tight text-slate-900">Change participant name?</h2>
              <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-slate-600">
                Review the {fieldLabel} carefully before updating this participant.
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss name change confirmation"
              className="-mr-1 -mt-1 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3.5 sm:px-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Current {fieldLabel}</p>
              <p className="mt-1.5 break-words text-sm font-semibold text-slate-700 sm:text-base">
                {previousName.trim() || 'Not provided'}
              </p>
            </div>

            <div className="flex items-center justify-center text-slate-300" aria-hidden="true">
              <ArrowRight className="rotate-90 sm:rotate-0" size={18} />
            </div>

            <div className="min-w-0 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-3 py-3.5 ring-1 ring-indigo-100 sm:px-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">Proposed {fieldLabel}</p>
              <p className="mt-1.5 break-words text-sm font-semibold text-indigo-950 sm:text-base">
                {newName.trim() || 'Not provided'}
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <p className="text-xs leading-5 text-slate-600">
              Updating the name changes the participant record everywhere it appears, including existing event and attendance records.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            ref={keepOriginalButtonRef}
            type="button"
            onClick={onKeepOriginal}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-card px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Keep original &amp; exit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 active:translate-y-px"
          >
            Update name
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeParticipantNameModal;
