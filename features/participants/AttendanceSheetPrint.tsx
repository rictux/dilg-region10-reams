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

        // 2. Fetch All Logs for this event
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('event_id', id);
        
        setAllLogs(logs || []);
        
        // 3. Fetch All Registered Participants
        // We fetch all because we need to filter them PER DATE based on logs
        const { data: eventParticipants } = await supabase
            .from('event_participants')
            .select('participants(*)')
            .eq('event_id', id);

        const fetchedParticipants = eventParticipants
            ?.map((ep: any) => ep.participants)
            .filter((p: any) => p !== null) || [];
        
        setParticipants(fetchedParticipants);

    } catch (e) {
        console.error("Error fetching data", e);
    } finally {
        setLoading(false);
    }
  };

  const getRowsForDate = (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      // Filter logs strictly for this date
      const daysLogs = allLogs.filter(l => l.attendance_date === dateStr);
      
      // Identify participants present on this date
      const presentIds = new Set(daysLogs.map(l => l.participant_id));

      // Map and Filter
      return participants
          .filter(p => presentIds.has(p.participant_id))
          .map(p => {
              const pLogs = daysLogs.filter(l => l.participant_id === p.participant_id);
              
              const amLogs = pLogs.filter(l => l.action_session === 'AM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));
              const pmLogs = pLogs.filter(l => l.action_session === 'PM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));

              return {
                  participant: p,
                  amLog: amLogs.length > 0 ? { time: amLogs[0].scan_time, status: amLogs[0].scan_status } : undefined,
                  pmLog: pmLogs.length > 0 ? { time: pmLogs[0].scan_time, status: pmLogs[0].scan_status } : undefined,
              };
          })
          .sort((a, b) => a.participant.full_name.localeCompare(b.participant.full_name));
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!event) return <div>Event not found</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-serif print:p-0 print:bg-white">
        {/* Controls */}
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

        {/* Paper Container - Loop through Dates */}
        {eventDates.map((date, dateIndex) => {
            const rows = getRowsForDate(date);
            
            return (
                <div key={date.toISOString()} className="w-[297mm] h-[210mm] mx-auto bg-white shadow-xl mb-10 print:mb-0 print:shadow-none print:w-full print:h-screen print:max-w-none page-break-after relative overflow-hidden flex flex-col">
                    
                    {/* Header - Matches reference image design */}
                    <div className="flex items-center pt-8 px-8 mb-2">
                        <div className="w-24 h-24 mr-4 flex-shrink-0 flex items-center justify-center">
                            <img 
                                src="/assets/dilg_logo.png" 
                                alt="DILG Logo" 
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg';
                                }}
                            />
                        </div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-lg font-bold font-sans text-slate-900">DILG Region 10 - Northern Mindanao</h1>
                            <h2 className="text-2xl font-black text-black tracking-wide mt-1 uppercase font-sans">ATTENDANCE SHEET</h2>
                        </div>
                    </div>

                    {/* Centered Event Details */}
                    <div className="flex flex-col items-center justify-center text-center w-full mb-6">
                        <div className="text-xl font-bold font-serif mb-1 uppercase tracking-wide">
                            {event.event_name}
                        </div>
                        <div className="text-sm font-sans text-slate-700">
                            {event.venue}
                        </div>
                        <div className="text-sm font-sans text-slate-900 mt-1">
                            {format(date, 'MMMM d, yyyy')}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="px-8 flex-1">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                    <th rowSpan={2} className="border border-black px-2 py-2 w-10">No.</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2 text-left">NAME</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2">POSITION</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2">OFFICE</th>
                                    <th colSpan={2} className="border border-black px-2 py-1 w-20">GENDER</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2 w-28">AM</th>
                                    <th rowSpan={2} className="border border-black px-4 py-2 w-28">PM</th>
                                </tr>
                                <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                    <th className="border border-black px-1 py-1 w-10">M</th>
                                    <th className="border border-black px-1 py-1 w-10">F</th>
                                </tr>
                            </thead>
                            <tbody className="font-sans text-xs">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-12 text-slate-500 italic">
                                            No attendance recorded for this date.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row, index) => (
                                        <tr key={row.participant.participant_id} className="text-center h-8 hover:bg-slate-50 print:hover:bg-transparent">
                                            <td className="px-2 py-1.5">{index + 1}</td>
                                            <td className="px-3 py-1.5 text-left capitalize">{row.participant.full_name}</td>
                                            <td className="px-2 py-1.5">{row.participant.position}</td>
                                            <td className="px-2 py-1.5">{row.participant.office}</td>
                                            
                                            <td className="px-1 py-1.5 font-bold">
                                                {(row.participant.gender === 'Male' || row.participant.gender === 'M') && '✓'}
                                            </td>
                                            <td className="px-1 py-1.5 font-bold">
                                                {(row.participant.gender === 'Female' || row.participant.gender === 'F') && '✓'}
                                            </td>

                                            <td className="px-2 py-1.5 font-mono">
                                                {row.amLog ? format(new Date(row.amLog.time), 'h:mm a') : ''}
                                            </td>

                                            <td className="px-2 py-1.5 font-mono">
                                                {row.pmLog ? format(new Date(row.pmLog.time), 'h:mm a') : ''}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Footer */}
                    <div className="w-full px-10 pb-6 pt-2 flex justify-between text-[10px] text-slate-400 font-sans">
                        <div>System Generated Report</div>
                                       </div>
                </div>
            );
        })}
    </div>
  );
};

export default AttendanceSheetPrint;
