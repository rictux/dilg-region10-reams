import React, { useEffect, useState } from 'react';
import { Star, X, Clock, MapPin, Briefcase } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { PrincipalArrivalPayload, onPrincipalArrival } from '../lib/principalArrival';
import { useAuth } from '../contexts/AuthContext';

// Announces Principal delegate arrivals to everyone watching the event. Mounted
// once in Layout so it shows on any page. Arrivals queue rather than overwrite
// each other — two principals arriving together should both be seen.
const PrincipalArrivalModal: React.FC = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<PrincipalArrivalPayload[]>([]);

  useEffect(() => onPrincipalArrival((arrival, meta) => {
    // The scanning device already shows this on its own result card...
    if (meta.suppressModal) return;
    // ...and so did the scanning user, even if this is another of their tabs.
    if (arrival.scanned_by && arrival.scanned_by === user?.user_id) return;
    setQueue((prev) => [...prev, arrival]);
  }), [user?.user_id]);

  const current = queue[0] ?? null;
  const remaining = Math.max(0, queue.length - 1);

  const dismiss = () => setQueue((prev) => prev.slice(1));

  useEffect(() => {
    if (!current) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [current]);

  if (!current) return null;

  const arrivedAt = (() => {
    try {
      return format(parseISO(current.at), 'h:mm:ss a');
    } catch {
      return '';
    }
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="principal-arrival-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border-t-8 border-amber-400 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <div className="mb-4 rounded-full bg-amber-100 p-4">
            <Star size={40} className="fill-amber-500 text-amber-500" />
          </div>

          <p id="principal-arrival-title" className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">
            Principal Delegate Has Arrived
          </p>

          <h2 className="mt-3 text-2xl font-black leading-tight text-slate-900">
            {current.participant_name}
          </h2>

          <div className="mt-4 w-full space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-600">
            {current.position && (
              <p className="flex items-start gap-2">
                <Briefcase size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <span>{current.position}</span>
              </p>
            )}
            {current.office && (
              <p className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <span>{current.office}</span>
              </p>
            )}
            <p className="flex items-start gap-2">
              <Clock size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                {arrivedAt ? `Arrived ${arrivedAt}` : 'Arrived'}
                {current.event_name ? ` · ${current.event_name}` : ''}
              </span>
            </p>
          </div>

          {current.promoted && (
            <p className="mt-3 text-xs font-medium text-slate-500">
              Marked as Principal at the scanner.
            </p>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="mt-6 w-full rounded-xl bg-[#111110] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#2A2926]"
          >
            {remaining > 0 ? `Acknowledge (${remaining} more)` : 'Acknowledge'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrincipalArrivalModal;
