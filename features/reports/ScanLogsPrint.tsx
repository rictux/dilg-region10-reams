
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
        gender: string | null;
        office: string | null;
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
          participants ( participant_id, participant_code, full_name, email, mobile_no, gender, office ),
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
                    font-size: 8px;
                    width: 100%;
                    border-collapse: collapse;
                }
                th {
                    padding: 3px;
                    border: 1px solid #000;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                td {
                    padding: 3px;
                    border: none;
                    overflow: hidden;
                    text-overflow: ellipsis;
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
        <div className="pt-24 pb-10 px-4 print:p-0 print:m-0 bg-white min-h-screen w-full">
            
            {/* Header Section */}
            <div className="flex items-center justify-between mb-8 border-b-2 border-black pb-4">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center">
                        <img 
                            src="/assets/dilg_logo.png" 
                            alt="DILG Logo" 
                            className="w-full h-full object-contain" 
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg'; }} 
                        />
                    </div>
                    <div>
                        <p className="text-[10px] font-serif font-bold text-slate-600 uppercase tracking-widest">Republic of the Philippines</p>
                        <h1 className="text-lg font-serif font-bold text-slate-900 uppercase leading-none my-0.5">Department of the Interior and Local Government</h1>
                        <p className="text-xs font-serif font-bold text-slate-700 uppercase tracking-wide">Region 10 - Northern Mindanao</p>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight font-sans">SCAN LOGS</h2>
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

            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[9px] leading-tight text-left table-fixed">
                    <thead className="bg-slate-100 print:bg-slate-200 text-slate-900">
                        <tr>
                            <th className="border border-black px-2 py-1 w-8 text-center">#</th>
                            <th className="border border-black px-2 py-1 w-24 whitespace-nowrap">Scan Time</th>
                            <th className="border border-black px-2 py-1 w-10 text-center">Session</th>
                            <th className="border border-black px-2 py-1 w-32">Event Name</th>
                            <th className="border border-black px-2 py-1 w-20">Code</th>
                            <th className="border border-black px-2 py-1 w-32">Participant Name</th>
                            <th className="border border-black px-2 py-1 w-12 text-center">Gender</th>
                            <th className="border border-black px-2 py-1 w-32">Email / Mobile</th>
                            <th className="border border-black px-2 py-1 w-32">Office</th>
                            <th className="border border-black px-2 py-1 w-24">Scanned By</th>
                            <th className="border border-black px-2 py-1">Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log, index) => (
                            <tr key={log.attendance_id} className="hover:bg-slate-50 print:hover:bg-transparent break-inside-avoid">
                                <td className="px-2 py-1 text-center border-none">{index + 1}</td>
                                <td className="px-2 py-1 whitespace-nowrap font-mono border-none">{formatDateTime(log.scan_time)}</td>
                                <td className="px-2 py-1 text-center font-bold border-none">
                                    {log.action_session}
                                </td>
                                <td className="px-2 py-1 border-none">
                                    {log.events?.event_name || '-'}
                                </td>
                                <td className="px-2 py-1 font-mono text-center border-none">
                                    {log.participants?.participant_code || '-'}
                                </td>
                                <td className="px-2 py-1 font-bold border-none">
                                    {log.participants?.full_name || '-'}
                                </td>
                                <td className="px-2 py-1 text-center border-none">
                                    {log.participants?.gender ? log.participants.gender.charAt(0).toUpperCase() + log.participants.gender.slice(1) : '-'}
                                </td>
                                <td className="px-2 py-1 border-none">
                                    <div className="truncate">{log.participants?.email || ''}</div>
                                    {log.participants?.mobile_no && <div className="text-[8px] text-slate-500 font-mono">{log.participants.mobile_no}</div>}
                                </td>
                                <td className="px-2 py-1 border-none">
                                    {log.participants?.office || '-'}
                                </td>
                                <td className="px-2 py-1 border-none">
                                    {log.users?.full_name || 'System'}
                                </td>
                                <td className="px-2 py-1 italic text-slate-600 border-none">
                                    {log.remarks || ''}
                                </td>
                            </tr>
                        ))}
                        {logs.length === 0 && (
                            <tr>
                                <td colSpan={11} className="px-4 py-8 text-center text-slate-400 italic border-none">
                                    No scan records found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
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
