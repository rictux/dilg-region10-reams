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
        fetchData(parseInt(eventId));
    }
  }, [eventId]);

  const fetchData = async (id: number) => {
    try {
        const { data: eventData } = await supabase.from('events').select('*').eq('event_id', id).single();
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

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-serif print:p-0 print:bg-white">
        <div className="max-w-[297mm] mx-auto mb-8 flex justify-between no-print">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
                <ArrowLeft size={20} /> Back to Portal
            </button>
            <div className="flex items-center gap-4">
                <p className="text-sm text-slate-500">{eventDates.length} Page(s)</p>
                <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-blue-700 font-bold">
                    <Printer size={20} /> Print Sheets
                </button>
            </div>
        </div>

        {eventDates.map((date, dateIndex) => {
            const rows = getRowsForDate(date);
            return (
                <div key={date.toISOString()} className="w-[297mm] h-[210mm] mx-auto bg-white shadow-xl mb-10 print:mb-0 print:shadow-none print:w-full print:h-screen print:max-w-none page-break-after relative overflow-hidden flex flex-col">
                    <div className="flex items-center pt-8 px-8 mb-2">
                        <div className="w-24 h-24 mr-4 flex-shrink-0 flex items-center justify-center">
                            <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg'; }} />
                        </div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-lg font-bold font-sans text-slate-900">DILG Region 10 - Northern Mindanao</h1>
                            <h2 className="text-2xl font-black text-black tracking-wide mt-1 uppercase font-sans">ATTENDANCE SHEET</h2>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center w-full mb-6">
                        <div className="text-base font-bold font-serif mb-1 uppercase tracking-wide">{event.event_name}</div>
                        <div className="text-sm font-sans text-slate-700">{event.venue}</div>
                        <div className="text-sm font-sans text-slate-900 mt-1">{format(date, 'MMMM d, yyyy')}</div>
                    </div>
                    <div className="px-8 flex-1">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                    <th rowSpan={2} className="border border-black px-2 py-2 w-10">No.</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2 text-left">NAME</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2">POSITION</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2">OFFICE</th>
                                    <th colSpan={2} className="border border-black px-2 py-1 w-20">GENDER</th>
                                    <th colSpan={2} className="border border-black px-2 py-1 w-20">CONSENT</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2 w-28">AM</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2 w-28">PM</th>
                                </tr>
                                <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                    <th className="border border-black px-1 py-1 w-10">M</th>
                                    <th className="border border-black px-1 py-1 w-10">F</th>
                                    <th className="border border-black px-1 py-1 w-10" title="I consent to the capture of my photo, video, and audio for use in DILG publications.">A</th>
                                    <th className="border border-black px-1 py-1 w-10" title="I consent to the storage of my data in the organizer’s database for future document processing.">B</th>
                                </tr>
                            </thead>
                            <tbody className="font-sans text-xs">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="text-center py-12 text-slate-500 italic">No attendance recorded for this date.</td>
                                    </tr>
                                ) : (
                                    rows.map((row, index) => (
                                        <tr key={row.participant.participant_id} className="text-center h-8 hover:bg-slate-50 print:hover:bg-transparent">
                                            <td className="px-2 py-1.5 border border-black">{index + 1}</td>
                                            <td className="px-3 py-1.5 text-left capitalize border border-black">{row.participant.full_name}</td>
                                            <td className="px-2 py-1.5 border border-black">{row.participant.position}</td>
                                            <td className="px-2 py-1.5 border border-black">{row.participant.office}</td>
                                            <td className="px-1 py-1.5 font-bold border border-black">{(row.participant.gender === 'Male' || row.participant.gender === 'M') && '✓'}</td>
                                            <td className="px-1 py-1.5 font-bold border border-black">{(row.participant.gender === 'Female' || row.participant.gender === 'F') && '✓'}</td>
                                            <td className="px-1 py-1.5 font-bold border border-black">{(row.participant as any).accept_photo_video ? '✓' : ''}</td>
                                            <td className="px-1 py-1.5 font-bold border border-black">{(row.participant as any).store_to_db ? '✓' : ''}</td>
                                            <td className="px-2 py-1.5 font-mono border border-black">{row.amLog ? formatLogTime(row.amLog.time) : ''}</td>
                                            <td className="px-2 py-1.5 font-mono border border-black">{row.pmLog ? formatLogTime(row.pmLog.time) : ''}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="w-full px-10 pb-6 pt-2 flex flex-col text-[10px] text-slate-600 font-sans">
                        <div className="font-bold mb-0.5">Consent Legend:</div>
                        <div><span className="font-bold">A</span> - I consent to the capture of my photo, video, and audio for use in DILG publications.</div>
                        <div><span className="font-bold">B</span> - I consent to the storage of my data in the organizer’s database for future document processing.</div>
                        <div className="mt-2 text-slate-400">System Generated Report</div>
                    </div>
                </div>
            );
        })}
    </div>
  );
};

export default AttendanceSheetPrint;
