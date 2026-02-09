import React from 'react';
import { supabase } from '../../lib/supabase';
import { Download } from 'lucide-react';

const Reports: React.FC = () => {

  const downloadCSV = async () => {
    const { data, error } = await supabase
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
    link.setAttribute("download", `attendance_report_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Reports</h2>
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 text-center">
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
                Download the complete attendance log including timestamps, participant details, and scan status for all events.
            </p>
            <button 
                onClick={downloadCSV}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 font-medium transition-colors shadow-lg"
            >
                <Download size={20} /> Export Full Attendance CSV
            </button>
        </div>
    </div>
  );
};

export default Reports;