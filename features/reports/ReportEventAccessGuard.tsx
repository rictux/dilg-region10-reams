import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessEvent, MANAGE_EVENT_ACCESS_ROLES } from '../../lib/eventAccess';

type AccessState = 'checking' | 'allowed' | 'denied';

const ReportEventAccessGuard: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accessState, setAccessState] = useState<AccessState>('checking');

  useEffect(() => {
    let isCurrent = true;

    const verifyAccess = async () => {
      if (!eventId) {
        setAccessState('allowed');
        return;
      }

      setAccessState('checking');
      const parsedEventId = Number(eventId);

      try {
        const allowed = await canAccessEvent(user, parsedEventId, MANAGE_EVENT_ACCESS_ROLES);
        if (!isCurrent) return;

        if (!allowed && sessionStorage.getItem('reports_selected_event_id') === eventId) {
          sessionStorage.removeItem('reports_selected_event_id');
        }
        setAccessState(allowed ? 'allowed' : 'denied');
      } catch (error) {
        console.error('Unable to verify report event access:', error);
        if (isCurrent) setAccessState('denied');
      }
    };

    verifyAccess();
    return () => {
      isCurrent = false;
    };
  }, [eventId, user?.user_id, user?.office_id, user?.role]);

  if (accessState === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F5F3EE]">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (accessState === 'denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE] px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <ShieldAlert className="mx-auto mb-4 text-red-500" size={42} />
          <h1 className="text-xl font-bold text-slate-900">Report access denied</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            This event is not assigned to your office or user account.
          </p>
          <button
            type="button"
            onClick={() => navigate('/reports', { replace: true })}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <ArrowLeft size={16} />
            Back to Reports
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ReportEventAccessGuard;
