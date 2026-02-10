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
        // 1. Fetch Event
        const { data: eventData } = await supabase.from('events').select('*').eq('event_id', id).single();
        if (!eventData) throw new Error("Event not found");
        setEvent(eventData);

        // Generate dates array
        const start = parseISO(eventData.start_date);
        const end = eventData.end_date ? parseISO(eventData.end_date) : start;
        
        // Safety check for invalid dates
        let dates: Date[] = [];
        if (isBefore(end, start)) {
             dates = [start];
        } else {
             dates = eachDayOfInterval({ start, end });
        }
        setEventDates(dates);

        // 2. Fetch Participants
        const { data: eventParticipants } = await supabase
            .from('event_participants')
            .select('participants(*)')
            .eq('event_id', id);

        const fetchedParticipants = eventParticipants
            ?.map((ep: any) => ep.participants)
            .filter((p: any) => p !== null)
            .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name)) || [];
        
        setParticipants(fetchedParticipants);

        // 3. Fetch All Logs for this event
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('event_id', id);
        
        setAllLogs(logs || []);

    } catch (e) {
        console.error("Error fetching data", e);
    } finally {
        setLoading(false);
    }
  };

  const getRowsForDate = (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const daysLogs = allLogs.filter(l => l.attendance_date === dateStr);

      return participants.map(p => {
          // Find logs for this participant on this day
          // We pick the earliest Valid scan for AM and PM
          const pLogs = daysLogs.filter(l => l.participant_id === p.participant_id);
          
          const amLogs = pLogs.filter(l => l.action_session === 'AM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));
          const pmLogs = pLogs.filter(l => l.action_session === 'PM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));

          return {
              participant: p,
              amLog: amLogs.length > 0 ? { time: amLogs[0].scan_time, status: amLogs[0].scan_status } : undefined,
              pmLog: pmLogs.length > 0 ? { time: pmLogs[0].scan_time, status: pmLogs[0].scan_status } : undefined,
          };
      });
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-indigo-600" /></div>;
  if (!event) return <div>Event not found</div>;

  return (
    <div className="min-h-screen bg-white text-black p-8 font-serif print:p-0">
        {/* Controls */}
        <div className="max-w-[297mm] mx-auto mb-8 flex justify-between no-print">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
                <ArrowLeft size={20} /> Back
            </button>
            <div className="flex items-center gap-4">
                <p className="text-sm text-slate-500">{eventDates.length} Page(s)</p>
                <button onClick={() => window.print()} className="bg-indigo-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-indigo-700">
                    <Printer size={20} /> Print Sheets
                </button>
            </div>
        </div>

        {/* Paper Container - Loop through Dates */}
        {eventDates.map((date, dateIndex) => {
            const rows = getRowsForDate(date);
            
            return (
                <div key={date.toISOString()} className="max-w-[297mm] mx-auto bg-white print:w-full print:max-w-none print:h-screen page-break-after">
                    
                    {/* Header */}
                    <div className="flex items-center mb-6 pt-4 px-4">
                        <div className="w-24 h-24 mr-6 flex-shrink-0">
                            {/* DILG Logo Placeholder */}
                            <img 
                                src="https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg" 
                                alt="DILG Logo" 
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <div className="flex-1">
                            <h1 className="text-lg font-bold font-sans text-slate-900">DILG Region 10 - Northern Mindanao</h1>
                            <h2 className="text-4xl font-black text-black tracking-wide mt-1 uppercase font-sans">ATTENDANCE SHEET</h2>
                            
                            <div className="mt-4 flex flex-col items-center justify-center text-center w-full pr-24">
                                <div className="text-xl font-bold font-serif mb-1">
                                    {event.event_name}
                                </div>
                                <div className="text-sm font-sans text-slate-700">
                                    {event.venue}
                                </div>
                                <div className="text-sm font-sans text-slate-700">
                                    {format(date, 'MMMM d, yyyy')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="px-4">
                        <table className="w-full border-collapse border border-black text-sm">
                            <thead>
                                <tr className="bg-gray-300 text-center font-bold uppercase font-sans text-xs">
                                    <th rowSpan={2} className="border border-black px-2 py-3 w-10">No.</th>
                                    <th rowSpan={2} className="border border-black px-4 py-3">NAME</th>
                                    <th rowSpan={2} className="border border-black px-4 py-3">POSITION</th>
                                    <th rowSpan={2} className="border border-black px-4 py-3">OFFICE</th>
                                    <th colSpan={2} className="border border-black px-2 py-1 w-24">GENDER</th>
                                    <th rowSpan={2} className="border border-black px-4 py-3 w-32">AM</th>
                                    <th rowSpan={2} className="border border-black px-4 py-3 w-32">PM</th>
                                </tr>
                                <tr className="bg-gray-300 text-center font-bold uppercase font-sans text-xs">
                                    <th className="border border-black px-1 py-1 w-10">M</th>
                                    <th className="border border-black px-1 py-1 w-10">F</th>
                                </tr>
                            </thead>
                            <tbody className="font-sans">
                                {rows.map((row, index) => (
                                    <tr key={row.participant.participant_id} className="text-center h-10">
                                        <td className="border border-black px-2">{index + 1}</td>
                                        <td className="border border-black px-3 text-left font-medium uppercase text-xs">{row.participant.full_name}</td>
                                        <td className="border border-black px-2 text-xs">{row.participant.position}</td>
                                        <td className="border border-black px-2 text-xs">{row.participant.office}</td>
                                        
                                        {/* Gender Checks */}
                                        <td className="border border-black px-1">
                                            {(row.participant.gender === 'Male' || row.participant.gender === 'M') && <span className="font-bold text-black">✓</span>}
                                        </td>
                                        <td className="border border-black px-1">
                                            {(row.participant.gender === 'Female' || row.participant.gender === 'F') && <span className="font-bold text-black">✓</span>}
                                        </td>

                                        {/* AM Log */}
                                        <td className="border border-black px-2">
                                            {row.amLog ? (
                                                <span className="font-mono text-xs">{format(new Date(row.amLog.time), 'h:mm a')}</span>
                                            ) : null}
                                        </td>

                                        {/* PM Log */}
                                        <td className="border border-black px-2">
                                            {row.pmLog ? (
                                                <span className="font-mono text-xs">{format(new Date(row.pmLog.time), 'h:mm a')}</span>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                                {/* Blank Rows to fill page roughly (standard A4 can fit ~20-25 rows with this height) */}
                                {rows.length < 20 && Array.from({ length: 20 - rows.length }).map((_, i) => (
                                    <tr key={`blank-${i}`} className="text-center h-10">
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Footer */}
                    <div className="mt-4 px-4 flex justify-between text-[10px] text-slate-500 font-sans print:fixed print:bottom-4 print:w-full print:px-8">
                        <div>Generated by EventPulse</div>
                        <div>Page {dateIndex + 1} of {eventDates.length}</div>
                    </div>
                    
                    {/* Spacer for print page break visualization in browser */}
                    <div className="h-12 w-full print:hidden"></div>
                </div>
            );
        })}
    </div>
  );
};

export default AttendanceSheetPrint;