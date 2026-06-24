import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';

interface GiveawaySnapshotItem {
  key?: string;
  label?: string;
  display_value?: string;
  raw_value?: string | boolean | null;
}

interface GiveawayColumn {
  key: string;
  label: string;
}

interface GiveawayClaimLog {
  claim_id: number;
  claimed_at: string;
  giveaway_snapshot: {
    items?: GiveawaySnapshotItem[];
  } | null;
  events: {
    event_name: string;
    venue: string | null;
    start_date: string;
    end_date: string | null;
  } | null;
  participants: {
    full_name: string;
    position: string | null;
    office: string | null;
    gender: string | null;
  } | null;
}

interface EventSummary {
  event_name: string;
  venue: string | null;
  start_date: string;
  end_date: string | null;
  giveaways?: GiveawayColumn[] | null;
}

const GiveawayClaimLogsPrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<GiveawayClaimLog[]>([]);
  const [eventSummary, setEventSummary] = useState<EventSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
      sessionStorage.setItem('reports_selected_event_id', eventId);
    }

    fetchLogs();
  }, [eventId]);

  const fetchLogs = async () => {
    try {
      if (!eventId) {
        setLogs([]);
        setEventSummary(null);
        return;
      }

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('event_name, venue, start_date, end_date, giveaways')
        .eq('event_id', parseInt(eventId))
        .is('deleted_at', null)
        .single();

      if (eventError) throw eventError;
      setEventSummary(eventData as EventSummary);

      const { data, error } = await supabase
        .from('giveaway_claim_logs')
        .select(`
          claim_id,
          claimed_at,
          giveaway_snapshot,
          events!inner (
            event_name,
            venue,
            start_date,
            end_date,
            deleted_at
          ),
          participants (
            full_name,
            position,
            office,
            gender
          )
        `)
        .eq('event_id', parseInt(eventId))
        .is('events.deleted_at', null)
        .order('claimed_at', { ascending: true });

      if (error) throw error;
      setLogs((data as unknown as GiveawayClaimLog[]) || []);
    } catch (err) {
      console.error('Error fetching giveaway claim logs', err);
    } finally {
      setLoading(false);
    }
  };

  const formatEventDate = (start?: string | null, end?: string | null) => {
    if (!start) return '-';

    try {
      const startDate = parseISO(start);
      const endDate = end ? parseISO(end) : startDate;

      if (start === end || !end) {
        return format(startDate, 'MMMM d, yyyy');
      }

      if (isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMMM d')}-${format(endDate, 'd, yyyy')}`;
      }

      if (isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;
      }

      return `${format(startDate, 'MMMM d, yyyy')} - ${format(endDate, 'MMMM d, yyyy')}`;
    } catch {
      return start;
    }
  };

  const formatClaimTime = (timeStr: string) => {
    if (!timeStr) return '-';
    return format(new Date(timeStr), 'MMM d, yyyy h:mm a');
  };

  const formatGender = (gender?: string | null) => {
    if (!gender) return '-';
    return gender.charAt(0).toUpperCase() + gender.slice(1);
  };

  const formatSnapshotValue = (item?: GiveawaySnapshotItem) => {
    if (!item) return '-';

    if (item.display_value) return item.display_value;
    if (item.raw_value === true) return 'Yes';
    if (item.raw_value === false) return 'No';
    if (item.raw_value) return String(item.raw_value);

    return '-';
  };

  const getGiveawayValue = (snapshot: GiveawayClaimLog['giveaway_snapshot'], column: GiveawayColumn) => {
    const items = snapshot?.items || [];
    const item = items.find((entry) => entry.key === column.key || entry.label === column.label);
    return formatSnapshotValue(item);
  };

  const event = eventSummary || logs[0]?.events;
  const giveawayColumns = eventSummary?.giveaways || [];
  const totalColumns = 6 + Math.max(giveawayColumns.length, 1);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-fuchsia-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 print:bg-white">
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white p-4 shadow-sm no-print">
        <button onClick={() => navigate('/reports')} className="flex items-center gap-2 font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft size={20} /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-500">
            Total Claims: {logs.length}
          </span>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-bold text-white shadow-md transition-colors hover:bg-slate-800">
            <Printer size={18} /> Print
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 12mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: white;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            padding: 4mm !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: none !important;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 9px;
          }
          th {
            border: 1px solid #000;
            background-color: #f1f5f9 !important;
            padding: 4px;
            font-size: 10px !important;
            line-height: 1.2;
            font-weight: bold;
          }
          td {
            border-bottom: 0.5px solid #d4d4d4;
            padding: 4px;
            vertical-align: top;
            line-height: 1.25;
          }
          thead {
            display: table-header-group;
          }
          .print-wrap {
            white-space: normal !important;
            word-break: break-word;
          }
        }
      `}</style>

      <div className="print-container min-h-screen w-full px-4 pb-10 pt-24 md:px-8 print:p-0">
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm print:border-none print:shadow-none">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Giveaway Claim Logs</p>
          <h1 className="mt-2 text-2xl font-black uppercase leading-tight text-slate-950 print:text-xl">
            {event?.event_name || 'Selected Event'}
          </h1>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 md:grid-cols-2 print:grid-cols-2">
            <p>
              <span className="font-bold text-slate-800">Venue:</span> {event?.venue || '-'}
            </p>
            <p>
              <span className="font-bold text-slate-800">Date:</span> {formatEventDate(event?.start_date, event?.end_date)}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-none print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[24%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[8%]" />
                {giveawayColumns.length > 0 ? (
                  giveawayColumns.map((column) => (
                    <col key={column.key} className="w-[7%]" />
                  ))
                ) : (
                  <col className="w-[7%]" />
                )}
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-slate-100 text-slate-800">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold">No.</th>
                  <th className="px-3 py-2 text-xs font-bold">Name</th>
                  <th className="px-3 py-2 text-xs font-bold">Position</th>
                  <th className="px-3 py-2 text-xs font-bold">Office</th>
                  <th className="px-3 py-2 text-xs font-bold">Gender</th>
                  {giveawayColumns.length > 0 ? (
                    giveawayColumns.map((column) => (
                      <th key={column.key} className="px-3 py-2 text-xs font-bold print-wrap">{column.label}</th>
                    ))
                  ) : (
                    <th className="px-3 py-2 text-xs font-bold">Giveaways</th>
                  )}
                  <th className="px-3 py-2 text-xs font-bold">Time Claim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((log, index) => (
                  <tr key={log.claim_id} className="text-sm text-slate-700 print:text-[9px]">
                    <td className="px-3 py-2 text-center font-mono text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900 print-wrap">{log.participants?.full_name || '-'}</td>
                    <td className="px-3 py-2 print-wrap">{log.participants?.position || '-'}</td>
                    <td className="px-3 py-2 print-wrap">{log.participants?.office || '-'}</td>
                    <td className="px-3 py-2">{formatGender(log.participants?.gender)}</td>
                    {giveawayColumns.length > 0 ? (
                      giveawayColumns.map((column) => (
                        <td key={`${log.claim_id}-${column.key}`} className="px-3 py-2 print-wrap">
                          {getGiveawayValue(log.giveaway_snapshot, column)}
                        </td>
                      ))
                    ) : (
                      <td className="px-3 py-2 print-wrap">-</td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">{formatClaimTime(log.claimed_at)}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={totalColumns} className="px-4 py-10 text-center italic text-slate-400">
                      No giveaway claim records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-400 print:border-none">
          <span>Giveaway Claim Log Report - {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</span>
          <span>Page 1</span>
        </div>
      </div>
    </div>
  );
};

export default GiveawayClaimLogsPrint;
