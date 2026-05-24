
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
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
  const { user } = useAuth();
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
        sessionStorage.setItem('reports_selected_event_id', eventId);
    }
    fetchLogs();
  }, [eventId]);

  const fetchLogs = async () => {
    try {
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
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 print:bg-white">
        {/* Navigation / Controls (Hidden on Print) */}
        <div className="fixed top-0 left-0 right-0 bg-white border-b border-slate-200 p-4 shadow-sm z-50 flex justify-between items-center no-print">
            <button onClick={() => navigate('/reports')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
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
                .print-container {
                    padding: 0 !important;
                    margin: 0 !important;
                    width: 100% !important;
                    max-width: none !important;
                }
                table {
                    font-size: 7px; /* Decrease text to fit in paper */
                    width: 100%;
                    border-collapse: collapse;
                }
                th {
                    padding: 2px 4px;
                    border: 1px solid #000;
                    white-space: nowrap; /* Don't wrap */
                    background-color: #f1f5f9 !important;
                    font-weight: bold;
                    /* text-transform: uppercase; Removed */
                }
                td {
                    padding: 2px 4px;
                    border: none; /* Keep previous style preference */
                    white-space: nowrap; /* Don't wrap */
                }
                /* Add faint row lines for readability in dense print */
                tr {
                    border-bottom: 0.5px solid #e5e5e5;
                }
                thead {
                    display: table-header-group; 
                }
                tfoot {
                    display: table-footer-group;
                }
                .break-inside-avoid {
                    break-inside: avoid;
                }
                .print-footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    width: 100%;
                    background-color: white;
                }
            }
        `}</style>

        {/* Report Content */}
        <div className="pt-24 pb-10 px-4 md:px-8 print:p-0 print:m-0 min-h-screen w-full print-container">
            
            <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-slate-200 print:shadow-none print:border-none print:rounded-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 print:bg-slate-100 print:border-black text-slate-700">
                            <tr>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">#</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Scan Time</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 text-center">Session</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Event Name</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Code</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Participant Name</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 text-center">Gender</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Email / Mobile</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Office</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Scanned By</th>
                                <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100 print:divide-y-0">
                            {logs.map((log, index) => (
                                <tr key={log.attendance_id} className="hover:bg-slate-50 transition-colors print:hover:bg-transparent text-slate-600 print:text-black">
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 text-center font-mono text-slate-400 print:text-black whitespace-nowrap">{index + 1}</td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 font-mono whitespace-nowrap">{formatDateTime(log.scan_time)}</td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 text-center whitespace-nowrap">
                                        {log.action_session}
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap">
                                        {log.events?.event_name || '-'}
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 font-mono text-center whitespace-nowrap">
                                        {log.participants?.participant_code || '-'}
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap">
                                        {log.participants?.full_name || '-'}
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 text-center whitespace-nowrap">
                                        {log.participants?.gender ? log.participants.gender.charAt(0).toUpperCase() + log.participants.gender.slice(1) : '-'}
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span>{log.participants?.email || ''}</span>
                                            {log.participants?.mobile_no && <span className="text-[10px] print:text-[6px] text-slate-400 print:text-black">{log.participants.mobile_no}</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap">
                                        {log.participants?.office || '-'}
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span>{log.users?.full_name || 'System'}</span>
                                            {log.users?.email && <span className="text-[10px] print:text-[6px] text-slate-400 print:text-black">{log.users.email}</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 italic text-slate-500 print:text-black whitespace-nowrap">
                                        {log.remarks || ''}
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400 italic">
                                        No scan records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Prepared By Section */}
            <div className="mt-8 px-4 print:px-0 break-inside-avoid flex justify-end">
                <div className="w-64">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-6">Prepared by:</p>
                    <p className="text-xs text-slate-900 uppercase border-b border-slate-400 inline-block min-w-[200px] pb-1">
                        {user?.full_name}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{user?.position || 'System Administrator'}</p>
                </div>
            </div>
            
            {/* Minimal Footer for Context */}
            <div className="print-footer mt-4 text-[10px] text-slate-400 flex justify-between print:flex print:mt-1 border-t border-slate-200 pt-2 print:border-none">
                <span>Scan Log Report • {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</span>
                <span>Page 1</span>
            </div>
        </div>
    </div>
  );
};

export default ScanLogsPrint;
