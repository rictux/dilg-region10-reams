
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fetchAllSupabaseRows } from '../../lib/supabasePagination';

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

const SCAN_LOG_ROWS_PER_PRINT_PAGE = 30;

const chunkRows = <T,>(rows: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
};

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
        const parsedEventId = eventId ? parseInt(eventId) : null;
        const data = await fetchAllSupabaseRows<ScanLog>(() => {
            let query = supabase
                .from('attendance_logs')
                .select(`
                  scan_time,
                  attendance_id,
                  remarks,
                  action_session,
                  events!inner ( event_name, deleted_at ),
                  participants ( participant_id, participant_code, full_name, email, mobile_no, gender, office ),
                  users ( user_id, full_name, email )
                `)
                .is('events.deleted_at', null)
                .order('scan_time', { ascending: true })
                .order('attendance_id', { ascending: true });

            if (parsedEventId) {
                query = query.eq('event_id', parsedEventId);
            }

            return query;
        });
        
        setLogs(data);
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

  const logPages = logs.length > 0 ? chunkRows(logs, SCAN_LOG_ROWS_PER_PRINT_PAGE) : [[] as ScanLog[]];
  const totalPages = logPages.length;

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
                    size: A4 landscape;
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
                .print-page-break {
                    break-after: page;
                    page-break-after: always;
                }
                table {
                    font-size: 6.5px;
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                th {
                    padding: 2px 2px !important;
                    border: 1px solid #000;
                    font-size: 6px !important;
                    line-height: 7px !important;
                    height: 18px;
                    white-space: normal;
                    background-color: #f1f5f9 !important;
                    font-weight: bold;
                    vertical-align: middle;
                }
                td {
                    padding: 2px 3px !important;
                    border: none; /* Keep previous style preference */
                    white-space: nowrap; /* Don't wrap */
                    overflow-wrap: anywhere;
                    font-size: 7px !important;
                    line-height: 8px !important;
                    height: 23px;
                    vertical-align: middle;
                }
                td span {
                    line-height: 8px !important;
                }
                td .flex {
                    gap: 0 !important;
                }
                tbody tr {
                    min-height: 0;
                }
                .print-wrap {
                    white-space: normal !important;
                    word-break: break-word;
                }
                .print-scroll {
                    overflow: visible !important;
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
            
            {logPages.map((pageLogs, pageIndex) => (
                <div
                    key={`scan-log-page-${pageIndex}`}
                    className={`${pageIndex < totalPages - 1 ? 'print-page-break ' : ''}mb-6 bg-white shadow-lg rounded-xl overflow-hidden border border-slate-200 print:mb-0 print:shadow-none print:border-none print:rounded-none`}
                >
                    <div className="overflow-x-auto print-scroll">
                        <table className="w-full text-left border-collapse">
                            <colgroup>
                                <col className="w-[4%]" />
                                <col className="w-[10%]" />
                                <col className="w-[6%]" />
                                <col className="w-[25%]" />
                                <col className="w-[6%]" />
                                <col className="w-[13%]" />
                                <col className="w-[12%]" />
                                <col className="w-[7%]" />
                                <col className="w-[10%]" />
                                <col className="w-[7%]" />
                            </colgroup>
                            <thead className="bg-slate-50 border-b border-slate-200 print:bg-slate-100 print:border-black text-slate-700">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">#</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Scan Time</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 text-center">Sess.</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 print-wrap">Event</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1">Code</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 print-wrap">Name / Sex</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 print-wrap">Contact</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 print-wrap">Office</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 print-wrap">Scanner</th>
                                    <th className="px-4 py-3 text-xs font-bold tracking-wider whitespace-nowrap print:px-1 print:py-1 print-wrap">Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100 print:divide-y-0">
                                {pageLogs.map((log, rowIndex) => {
                                    const displayIndex = pageIndex * SCAN_LOG_ROWS_PER_PRINT_PAGE + rowIndex + 1;
                                    return (
                                        <tr key={log.attendance_id} className="hover:bg-slate-50 transition-colors print:hover:bg-transparent text-slate-600 print:text-black">
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 text-center font-mono text-slate-400 print:text-black whitespace-nowrap">{displayIndex}</td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 font-mono whitespace-nowrap">{formatDateTime(log.scan_time)}</td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 text-center whitespace-nowrap">
                                                {log.action_session}
                                            </td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-0">
                                                <span className="block whitespace-nowrap overflow-hidden text-ellipsis">{log.events?.event_name || '-'}</span>
                                            </td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 font-mono text-center whitespace-nowrap">
                                                {log.participants?.participant_code || '-'}
                                            </td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap print-wrap">
                                                <div className="flex flex-col">
                                                    <span>{log.participants?.full_name || '-'}</span>
                                                    <span className="text-[10px] print:text-[6px] text-slate-400 print:text-black">
                                                        {log.participants?.gender ? log.participants.gender.charAt(0).toUpperCase() + log.participants.gender.slice(1) : '-'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap print-wrap">
                                                <div className="flex flex-col">
                                                    <span>{log.participants?.email || ''}</span>
                                                    {log.participants?.mobile_no && <span className="text-[10px] print:text-[6px] text-slate-400 print:text-black">{log.participants.mobile_no}</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap print-wrap">
                                                {log.participants?.office || '-'}
                                            </td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 whitespace-nowrap print-wrap">
                                                <div className="flex flex-col">
                                                    <span>{log.users?.full_name || 'System'}</span>
                                                    {log.users?.email && <span className="text-[10px] print:text-[6px] text-slate-400 print:text-black">{log.users.email}</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-xs print:text-[7px] print:px-1 print:py-0.5 italic text-slate-500 print:text-black whitespace-nowrap print-wrap">
                                                {log.remarks || ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-8 text-center text-slate-400 italic">
                                            No scan records found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="hidden justify-between border-t border-slate-200 pt-1 text-[8px] text-slate-400 print:flex print:border-none">
                        <span>Scan Log Report - {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</span>
                        <span>Page {pageIndex + 1} of {totalPages}</span>
                    </div>
                </div>
            ))}

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
            <div className="mt-4 text-[10px] text-slate-400 flex justify-between border-t border-slate-200 pt-2 print:hidden">
                <span>Scan Log Report • {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</span>
                <span>{totalPages} page{totalPages === 1 ? '' : 's'}</span>
            </div>
        </div>
    </div>
  );
};

export default ScanLogsPrint;
