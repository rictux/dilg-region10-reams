
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Event } from '../../types/database';

interface ScanLog {
    attendance_id: number;
    scan_time: string;
    action_session: string;
    remarks: string | null;
    events: {
        event_name: string;
    } | null;
    participants: {
        participant_id: number;
        participant_code: string;
        full_name: string;
        email: string | null;
        mobile_no: string | null;
    } | null;
    users: {
        user_id: number;
        full_name: string;
        email: string | null;
    } | null;
}

const ScanLogsPrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [eventId]);

  const fetchLogs = async () => {
    try {
        if (eventId) {
            const { data: eventData } = await supabase
                .from('events')
                .select('*')
                .eq('event_id', parseInt(eventId))
                .single();
            setEvent(eventData);
        }

        // Constructing Supabase query to match the requested SQL structure
        let query = supabase
        .from('attendance_logs')
        .select(`
          scan_time,
          attendance_id,
          remarks,
          action_session,
          events ( event_name ),
          participants ( participant_id, participant_code, full_name, email, mobile_no ),
          users ( user_id, full_name, email )
        `)
        .order('scan_time', { ascending: true });

        if (eventId) {
            query = query.eq('event_id', parseInt(eventId));
        }

        const { data, error } = await query;
        if (error) throw error;
        
        setLogs(data as unknown as ScanLog[] || []);
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const formatDateTime = (timeStr: string) => {
      if (!timeStr) return '-';
      const d = new Date(timeStr.endsWith('Z') || timeStr.includes('+') ? timeStr : timeStr + 'Z');
      return format(d, 'yyyy-MM-dd hh:mm:ss a');
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
        {/* Navigation / Controls (Hidden on Print) */}
        <div className="fixed top-0 left-0 right-0 bg-white border-b border-slate-200 p-4 shadow-sm z-50 flex justify-between items-center no-print">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
                <ArrowLeft size={20} /> Back
            </button>
            <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded">
                    Total Records: {logs.length}
                </span>
                <button onClick={() => window.print()} className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-slate-800 font-bold transition-colors">
                    <Printer size={18} /> Print
                </button>
            </div>
        </div>

        {/* Print Styles */}
        <style>{`
            @media print {
                @page {
                    size: landscape;
                    margin: 5mm;
                }
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    background-color: white;
                }
                .no-print {
                    display: none !important;
                }
                table {
                    font-size: 9px;
                    width: 100%;
                }
                th, td {
                    padding: 4px;
                    border: 1px solid #000;
                }
                thead {
                    display: table-header-group; 
                }
                tfoot {
                    display: table-footer-group;
                }
            }
        `}</style>

        {/* Report Content */}
        <div className="pt-24 pb-10 px-8 print:p-0 print:m-0 bg-white min-h-screen max-w-[350mm] mx-auto">
            
            {/* Header Section */}
            <div className="flex items-center justify-between mb-8 border-b-2 border-black pb-4">
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center">
                        <img 
                            src="/assets/dilg_logo.png" 
                            alt="DILG Logo" 
                            className="w-full h-full object-contain" 
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg'; }} 
                        />
                    </div>
                    <div>
                        <p className="text-[10px] font-serif font-bold text-slate-600 uppercase tracking-widest">Republic of the Philippines</p>
                        <h1 className="text-xl font-serif font-bold text-slate-900 uppercase leading-none my-0.5">Department of the Interior and Local Government</h1>
                        <p className="text-sm font-serif font-bold text-slate-700 uppercase tracking-wide">Region 10 - Northern Mindanao</p>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight font-sans">SCAN LOGS</h2>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">Generated: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
                </div>
            </div>

            {/* Event Metadata (If Filtered) */}
            {event && (
                <div className="mb-6 border border-slate-300 bg-slate-50 p-4 rounded-lg print:border-black print:bg-transparent">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Event Name</p>
                            <p className="text-sm font-bold text-slate-900 leading-tight">{event.event_name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Venue</p>
                            <p className="text-sm font-medium text-slate-900 leading-tight">{event.venue}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Date</p>
                            <p className="text-sm font-medium text-slate-900">
                                {format(new Date(event.start_date), 'MMM d, yyyy')}
                                {event.end_date && event.end_date !== event.start_date ? ` - ${format(new Date(event.end_date), 'MMM d, yyyy')}` : ''}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Total Records</p>
                            <p className="text-sm font-bold text-slate-900">{logs.length}</p>
                        </div>
                    </div>
                </div>
            )}

            <table className="w-full border-collapse border border-black text-[10px] leading-tight text-left">
                <thead className="bg-slate-100 print:bg-slate-200 text-slate-900">
                    <tr>
                        <th className="border border-black px-2 py-1 w-8 text-center">#</th>
                        <th className="border border-black px-2 py-1 whitespace-nowrap">Scan Time</th>
                        <th className="border border-black px-2 py-1 w-12 text-center">Session</th>
                        <th className="border border-black px-2 py-1">Event Name</th>
                        <th className="border border-black px-2 py-1">Participant Name</th>
                        <th className="border border-black px-2 py-1 w-24">Code</th>
                        <th className="border border-black px-2 py-1">Email / Mobile</th>
                        <th className="border border-black px-2 py-1">Scanned By</th>
                        <th className="border border-black px-2 py-1">Remarks</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map((log, index) => (
                        <tr key={log.attendance_id} className="hover:bg-slate-50 print:hover:bg-transparent">
                            <td className="border border-black px-2 py-1 text-center">{index + 1}</td>
                            <td className="border border-black px-2 py-1 whitespace-nowrap font-mono">{formatDateTime(log.scan_time)}</td>
                            <td className="border border-black px-2 py-1 text-center font-bold">
                                {log.action_session}
                            </td>
                            <td className="border border-black px-2 py-1">
                                {log.events?.event_name || '-'}
                            </td>
                            <td className="border border-black px-2 py-1 font-bold">
                                {log.participants?.full_name || '-'}
                            </td>
                            <td className="border border-black px-2 py-1 font-mono">
                                {log.participants?.participant_code || '-'}
                            </td>
                            <td className="border border-black px-2 py-1">
                                <div>{log.participants?.email || ''}</div>
                                {log.participants?.mobile_no && <div className="text-[9px] text-slate-500">{log.participants.mobile_no}</div>}
                            </td>
                            <td className="border border-black px-2 py-1">
                                {log.users?.full_name || 'System'}
                                {log.users?.email && <span className="text-[8px] block text-slate-500">{log.users.email}</span>}
                            </td>
                            <td className="border border-black px-2 py-1 italic text-slate-600">
                                {log.remarks || ''}
                            </td>
                        </tr>
                    ))}
                    {logs.length === 0 && (
                        <tr>
                            <td colSpan={9} className="border border-black px-4 py-8 text-center text-slate-400 italic">
                                No scan records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            
            {/* Minimal Footer for Context */}
            <div className="mt-4 text-[8px] text-slate-400 flex justify-between print:flex border-t border-slate-200 pt-2">
                <span>System Generated Report • Event Management Portal</span>
                <span>Page 1 of 1</span>
            </div>
        </div>
    </div>
  );
};

export default ScanLogsPrint;
