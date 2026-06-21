import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant } from '../../types/database';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { format, parseISO, eachDayOfInterval, isBefore } from 'date-fns';

interface AttendanceRow {
    participant: Participant;
    amLog?: { time: string, status: string };
    pmLog?: { time: string, status: string };
}

const ROWS_PER_PAGE = 25;
const COMPACT_ROW_HEIGHT_PX = 24;

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
    );
};

const renderCellText = (text: string | null | undefined, threshold1: number, threshold2: number) => {
    if (!text) return '';
    if (text.length > threshold2) {
        return <div className="text-[6.5px] leading-[1.05] line-clamp-2">{text}</div>;
    }
    if (text.length > threshold1) {
        return <div className="text-[8px] leading-[1.1] line-clamp-2">{text}</div>;
    }
    return <div className="text-[9px] leading-tight line-clamp-1">{text}</div>;
};

const AttendanceSheetPrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
        sessionStorage.setItem('reports_selected_event_id', eventId);
        fetchData(parseInt(eventId));
    }
  }, [eventId]);

  const fetchData = async (id: number) => {
    try {
        const { data: eventData } = await supabase
            .from('events')
            .select('*')
            .eq('event_id', id)
            .is('deleted_at', null)
            .single();
        if (!eventData) throw new Error("Event not found");
        setEvent(eventData);

        const start = parseISO(eventData.start_date);
        const end = eventData.end_date ? parseISO(eventData.end_date) : start;
        
        let dates: Date[] = [];
        if (isBefore(end, start)) {
             dates = [start];
        } else {
             dates = eachDayOfInterval({ start, end });
        }
        setEventDates(dates);

        const { data: logs } = await supabase.from('attendance_logs').select('*').eq('event_id', id);
        setAllLogs(logs || []);
        
        const { data: eventParticipants } = await supabase.from('event_participants').select('accept_photo_video, store_to_db, participants(*)').eq('event_id', id);
        const fetchedParticipants = eventParticipants?.map((ep: any) => {
            if (!ep.participants) return null;
            return {
                ...ep.participants,
                accept_photo_video: ep.accept_photo_video,
                store_to_db: ep.store_to_db
            };
        }).filter((p: any) => p !== null) || [];
        setParticipants(fetchedParticipants);

    } catch (e) {
        console.error("Error fetching data", e);
    } finally {
        setLoading(false);
    }
  };

  const getRowsForDate = (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const daysLogs = allLogs.filter(l => l.attendance_date === dateStr);
      const presentIds = new Set(daysLogs.map(l => l.participant_id));

      const rows = participants
          .filter(p => presentIds.has(p.participant_id))
          .map(p => {
              const pLogs = daysLogs.filter(l => l.participant_id === p.participant_id);
              const amLogs = pLogs.filter(l => l.action_session === 'AM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));
              const pmLogs = pLogs.filter(l => l.action_session === 'PM').sort((a,b) => b.scan_time.localeCompare(a.scan_time));

              return {
                  participant: p,
                  amLog: amLogs.length > 0 ? { time: amLogs[0].scan_time, status: amLogs[0].scan_status } : undefined,
                  pmLog: pmLogs.length > 0 ? { time: pmLogs[pmLogs.length - 1].scan_time, status: pmLogs[pmLogs.length - 1].scan_status } : undefined,
              };
          });

      // Sorting logic: AM present first, then sort by AM time ASC
      return rows.sort((a, b) => {
          const hasAM_a = !!a.amLog;
          const hasAM_b = !!b.amLog;

          if (hasAM_a && !hasAM_b) return -1;
          if (!hasAM_a && hasAM_b) return 1;

          if (hasAM_a && hasAM_b) {
              return a.amLog!.time.localeCompare(b.amLog!.time);
          }

          return a.participant.full_name.localeCompare(b.participant.full_name);
      });
  };

  const formatLogTime = (timeStr: string) => {
      const d = new Date(timeStr.endsWith('Z') || timeStr.includes('+') ? timeStr : timeStr + 'Z');
      return format(d, 'h:mm a');
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!event) return <div>Event not found</div>;

  const visibleSessions: Array<'AM' | 'PM'> =
      event.session === 'All_Day' ? ['AM', 'PM'] : [event.session];
  const totalColumnCount = 8 + visibleSessions.length;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-serif print:p-0 print:bg-white">
        <div className="max-w-[297mm] mx-auto mb-8 flex justify-between no-print">
            <button onClick={() => navigate('/reports')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
                <ArrowLeft size={20} /> Back to Portal
            </button>
            <div className="flex items-center gap-4">
                <p className="text-sm text-slate-500">{eventDates.length} Page(s)</p>
                <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-blue-700 font-bold">
                    <Printer size={20} /> Print Sheets
                </button>
            </div>
        </div>

        {eventDates.map((date) => {
            const allRows = getRowsForDate(date);
            const rowChunks = allRows.length > 0 ? chunkArray(allRows, ROWS_PER_PAGE) : [[]];

            return rowChunks.map((rows, chunkIndex) => (
                <div key={`${date.toISOString()}-${chunkIndex}`} className="w-[297mm] h-[210mm] mx-auto bg-white shadow-xl mb-10 print:mb-0 print:shadow-none print:w-[297mm] print:h-[210mm] print:max-w-none page-break-after relative overflow-hidden flex flex-col">
                    <div className="flex items-center pt-4 px-6 mb-1">
                        <div className="w-14 h-14 mr-3 flex-shrink-0 flex items-center justify-center">
                            <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg'; }} />
                        </div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-xs font-bold font-sans text-slate-900">DILG Region 10 - Northern Mindanao</h1>
                            <h2 className="text-lg font-black text-black tracking-wide uppercase font-sans">ATTENDANCE SHEET</h2>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center w-full mb-2">
                        <div className="text-[12px] leading-tight font-bold font-serif mb-0.5 uppercase tracking-wide max-w-[260mm] line-clamp-2">{event.event_name}</div>
                        <div className="text-[10px] leading-tight font-sans text-slate-700">{event.venue}</div>
                        <div className="text-[10px] leading-tight font-sans text-slate-900 mt-0.5">{format(date, 'MMMM d, yyyy')}</div>
                    </div>
                    <div className="px-6 pb-1 flex-1 min-h-0 overflow-hidden">
                        <table className="w-full text-[9px] table-fixed">
                            <thead>
                                <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                    <th rowSpan={2} className="border border-black px-1 py-0.5 w-8">No.</th>
                                    <th rowSpan={2} className="border border-black px-2 py-1 text-left w-44">NAME</th>
                                    <th rowSpan={2} className="border border-black px-2 py-1 w-28">POSITION</th>
                                    <th rowSpan={2} className="border border-black px-2 py-1 w-28">OFFICE</th>
                                    <th colSpan={2} className="border border-black px-1 py-0.5 w-14">GENDER</th>
                                    <th rowSpan={2} className="border border-black px-1 py-0.5 w-20 text-[6.5px] leading-[1.05] normal-case font-normal align-top">I consent to the capture of my photo, video, and audio for use in DILG publications.</th>
                                    <th rowSpan={2} className="border border-black px-1 py-0.5 w-20 text-[6.5px] leading-[1.05] normal-case font-normal align-top">I consent to the storage of my data in the organizer’s database for future document processing.</th>
                                    {visibleSessions.map((session) => (
                                        <th key={session} rowSpan={2} className="border border-black px-2 py-1 w-20">
                                            {session}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                    <th className="border border-black px-1 py-0.5 w-7">M</th>
                                    <th className="border border-black px-1 py-0.5 w-7">F</th>
                                </tr>
                            </thead>
                            <tbody className="font-sans text-[9px]">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={totalColumnCount} className="text-center py-12 text-slate-500 italic">No attendance recorded for this date.</td>
                                    </tr>
                                ) : (
                                    rows.map((row, index) => {
                                        const globalIndex = chunkIndex * ROWS_PER_PAGE + index + 1;
                                        return (
                                            <tr key={row.participant.participant_id} className="text-center hover:bg-slate-50 print:hover:bg-transparent overflow-hidden" style={{ height: COMPACT_ROW_HEIGHT_PX }}>
                                                <td className="px-1 py-0.5 border border-black">{globalIndex}</td>
                                                <td className="px-2 py-0.5 text-left capitalize border border-black">
                                                    {renderCellText(row.participant.full_name, 25, 40)}
                                                </td>
                                                <td className="px-1 py-0.5 border border-black">
                                                    {renderCellText(row.participant.position, 20, 35)}
                                                </td>
                                                <td className="px-1 py-0.5 border border-black">
                                                    {renderCellText(row.participant.office, 20, 35)}
                                                </td>
                                                <td className="px-1 py-0.5 font-bold border border-black">{(row.participant.gender === 'Male' || row.participant.gender === 'M') && '✓'}</td>
                                                <td className="px-1 py-0.5 font-bold border border-black">{(row.participant.gender === 'Female' || row.participant.gender === 'F') && '✓'}</td>
                                                <td className="px-1 py-0.5 font-bold border border-black">{(row.participant as any).accept_photo_video ? '✓' : ''}</td>
                                                <td className="px-1 py-0.5 font-bold border border-black">{(row.participant as any).store_to_db ? '✓' : ''}</td>
                                                {visibleSessions.map((session) => (
                                                    <td key={session} className="px-1 py-0.5 font-mono border border-black">
                                                        {session === 'AM'
                                                            ? (row.amLog ? formatLogTime(row.amLog.time) : '')
                                                            : (row.pmLog ? formatLogTime(row.pmLog.time) : '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="w-full shrink-0 px-6 pb-1 pt-0.5 flex flex-col text-[8px] text-slate-600 font-sans">
                        <div className="text-slate-400">System Generated Report - Page {chunkIndex + 1} of {rowChunks.length}</div>
                    </div>
                </div>
            ));
        })}
    </div>
  );
};

export default AttendanceSheetPrint;
