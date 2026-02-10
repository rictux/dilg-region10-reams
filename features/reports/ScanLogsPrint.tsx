import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface ScanLog {
    attendance_date: string;
    scan_time: string;
    action_session: string;
    events: {
        event_name: string;
        venue: string;
        start_date: string;
        end_date: string;
    } | null;
    participants: {
        participant_code: string;
        full_name: string;
        gender: string;
        position: string;
        office: string;
        email: string;
    } | null;
    users: {
        full_name: string;
        email: string;
    } | null;
}

const ScanLogsPrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [eventName, setEventName] = useState('All Events');
  const [eventDate, setEventDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [eventId]);

  const fetchLogs = async () => {
    try {
        let query = supabase
        .from('attendance_logs')
        .select(`
          attendance_date,
          scan_time,
          action_session,
          events (event_name, venue, start_date, end_date),
          participants (participant_code, full_name, gender, position, office, email),
          users (full_name, email)
        `)
        .order('attendance_date', { ascending: false })
        .order('scan_time', { ascending: false });

        if (eventId) {
            query = query.eq('event_id', parseInt(eventId));
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // Cast data to ScanLog[] type
        setLogs(data as unknown as ScanLog[] || []);

        if (eventId && data && data.length > 0) {
            // @ts-ignore
            const e = data[0].events;
            if (e) {
                setEventName(e.event_name);
                // Determine date range string
                if (e.start_date === e.end_date || !e.end_date) {
                    setEventDate(format(new Date(e.start_date), 'MMMM d, yyyy'));
                } else {
                     setEventDate(`${format(new Date(e.start_date), 'MMM d')} - ${format(new Date(e.end_date), 'MMM d, yyyy')}`);
                }
            }
        } else if (eventId) {
             // Fetch event details even if no logs
             const { data: e } = await supabase.from('events').select('*').eq('event_id', eventId).single();
             if(e) {
                 setEventName(e.event_name);
                 if (e.start_date === e.end_date || !e.end_date) {
                    setEventDate(format(new Date(e.start_date), 'MMMM d, yyyy'));
                } else {
                     setEventDate(`${format(new Date(e.start_date), 'MMM d')} - ${format(new Date(e.end_date), 'MMM d, yyyy')}`);
                }
             }
        }
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans print:p-0 print:bg-white">
        <div className="max-w-[297mm] mx-auto mb-8 flex justify-between no-print">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
                <ArrowLeft size={20} /> Back to Reports
            </button>
            <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-blue-700 font-bold">
                <Printer size={20} /> Print Logs
            </button>
        </div>

        <div className="w-[297mm] mx-auto bg-white shadow-xl print:shadow-none print:w-full min-h-[210mm] p-10 flex flex-col">
            {/* Header */}
            <div className="flex items-center mb-6">
                <div className="w-20 h-20 mr-4 flex-shrink-0 flex items-center justify-center">
                    <img 
                        src="/assets/dilg_logo.png" 
                        alt="DILG Logo" 
                        className="w-full h-full object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg';
                        }}
                    />
                </div>
                 <div>
                    <h1 className="text-lg font-bold uppercase text-slate-800">DILG Region 10</h1>
                    <h2 className="text-2xl font-black uppercase text-black">Scan Logs Report</h2>
                </div>
            </div>

            <div className="mb-6 border-b-2 border-black pb-4">
                 <div className="flex justify-between items-end">
                    <div>
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Event</p>
                        <p className="text-xl font-bold text-slate-900">{eventName}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Date</p>
                        <p className="text-lg font-bold text-slate-900">{eventDate || format(new Date(), 'MMMM d, yyyy')}</p>
                    </div>
                 </div>
            </div>

            {/* Table */}
            <div className="flex-1">
                <table className="w-full text-[10px] text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-black bg-slate-50 print:bg-transparent">
                            <th className="py-2 px-1 font-bold uppercase">Timestamp</th>
                            <th className="py-2 px-1 font-bold uppercase">Code</th>
                            <th className="py-2 px-1 font-bold uppercase">Name</th>
                            <th className="py-2 px-1 font-bold uppercase">Gender</th>
                            <th className="py-2 px-1 font-bold uppercase">Position</th>
                            <th className="py-2 px-1 font-bold uppercase">Office</th>
                            <th className="py-2 px-1 font-bold uppercase">Email</th>
                            <th className="py-2 px-1 font-bold uppercase">Action</th>
                            <th className="py-2 px-1 font-bold uppercase">Scan By</th>
                            <th className="py-2 px-1 font-bold uppercase">Scanner Email</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="text-center py-10 text-slate-500 italic">No scan logs found.</td>
                            </tr>
                        ) : (
                            logs.map((log, i) => (
                                <tr key={i} className="break-inside-avoid hover:bg-slate-50 print:hover:bg-transparent">
                                    <td className="py-2 px-1 whitespace-nowrap">{format(new Date(log.scan_time), 'MMM d, h:mm:ss a')}</td>
                                    <td className="py-2 px-1 font-mono text-slate-600">{log.participants?.participant_code}</td>
                                    <td className="py-2 px-1 font-bold text-slate-900">{log.participants?.full_name}</td>
                                    <td className="py-2 px-1">{log.participants?.gender}</td>
                                    <td className="py-2 px-1">{log.participants?.position}</td>
                                    <td className="py-2 px-1">{log.participants?.office}</td>
                                    <td className="py-2 px-1 max-w-[120px] truncate" title={log.participants?.email}>{log.participants?.email}</td>
                                    <td className="py-2 px-1 font-bold text-center">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] border ${log.action_session === 'AM' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                                            {log.action_session}
                                        </span>
                                    </td>
                                    <td className="py-2 px-1">{log.users?.full_name || 'System'}</td>
                                    <td className="py-2 px-1 max-w-[120px] truncate text-slate-500" title={log.users?.email}>{log.users?.email || '-'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="mt-12 mb-8 flex justify-end break-inside-avoid print:break-inside-avoid px-8">
                <div>
                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-6">Prepared By:</p>
                    <div className="text-center">
                        <p className="font-bold uppercase text-slate-900 text-sm border-b border-black min-w-[200px] pb-1">
                            {user?.full_name}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase mt-1">{user?.role}</p>
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between text-[9px] text-slate-400 uppercase">
                <span>System Generated Log Report</span>
                <span>Total Records: {logs.length}</span>
            </div>
        </div>
    </div>
  );
};

export default ScanLogsPrint;