import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Download, Printer, FileText, Calendar } from 'lucide-react';
import { Event } from '../../types/database';
import { useNavigate } from 'react-router-dom';

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const { data } = await supabase.from('events').select('*').order('start_date', { ascending: false });
    if (data) {
        setEvents(data);
        if (data.length > 0) setSelectedEventId(data[0].event_id.toString());
    }
    setLoading(false);
  };

  const downloadCSV = async () => {
    let query = supabase
        .from('attendance_logs')
        .select(`
            attendance_date,
            scan_time,
            action_session,
            scan_status,
            events (event_name),
            participants (full_name, participant_code, office)
        `)
        .order('scan_time', { ascending: false });

    // Filter by event if selected
    if (selectedEventId) {
        query = query.eq('event_id', parseInt(selectedEventId));
    }

    const { data, error } = await query;

    if (error || !data) {
        alert("Failed to fetch data: " + (error?.message || ""));
        return;
    }

    // Flatten data
    const csvRows = [
        ['Date', 'Time', 'Event', 'Participant Name', 'Code', 'Office', 'Session', 'Status'],
        ...data.map((row: any) => [
            row.attendance_date,
            new Date(row.scan_time).toLocaleTimeString(),
            row.events?.event_name || 'N/A',
            row.participants?.full_name || 'N/A',
            row.participants?.participant_code || 'N/A',
            row.participants?.office || 'N/A',
            row.action_session,
            row.scan_status
        ])
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
        + csvRows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_report_${selectedEventId ? 'event_' + selectedEventId : 'all'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  const handlePrintAttendance = () => {
    if (selectedEventId) {
        navigate(`/print-attendance/${selectedEventId}`);
    }
  };

  return (
    <div className="space-y-8">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Reports Center</h2>
            <p className="text-slate-500 mt-1">Generate and export attendance documentation.</p>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Report Settings</h3>
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:w-1/3">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Event</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <select
                            value={selectedEventId}
                            onChange={(e) => setSelectedEventId(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                            <option value="">All Events (CSV Only)</option>
                            {events.map(e => (
                                <option key={e.event_id} value={e.event_id}>{e.event_name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* CSV Export Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-start hover:border-indigo-200 transition-colors">
                <div className="bg-emerald-100 p-3 rounded-lg text-emerald-600 mb-4">
                    <FileText size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Raw Data Export</h3>
                <p className="text-slate-500 text-sm mb-6 flex-1">
                    Download a complete CSV file of attendance scans. Useful for spreadsheets and custom analysis.
                </p>
                <button 
                    onClick={downloadCSV}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-2 font-medium transition-colors"
                >
                    <Download size={18} /> Download CSV
                </button>
            </div>

            {/* Print Attendance Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-start hover:border-indigo-200 transition-colors">
                <div className="bg-indigo-100 p-3 rounded-lg text-indigo-600 mb-4">
                    <Printer size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Attendance Sheets</h3>
                <p className="text-slate-500 text-sm mb-6 flex-1">
                    Generate official printable attendance sheets formatted for DILG Region 10 requirements. 
                    {selectedEventId ? ' Creates a specific report for the selected event.' : ' Please select an event first.'}
                </p>
                <button 
                    onClick={handlePrintAttendance}
                    disabled={!selectedEventId}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-2 font-medium transition-colors"
                >
                    <Printer size={18} /> Print Attendance Sheet
                </button>
            </div>

        </div>
    </div>
  );
};

export default Reports;