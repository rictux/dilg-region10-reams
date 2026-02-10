import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Participant, Event } from '../../types/database';
import { X, User, Printer, Calendar, RefreshCw } from 'lucide-react';
import QRCode from 'react-qr-code';
import { format } from 'date-fns';

interface AttendanceRow {
    participant: Participant;
    amLog?: { time: string, status: string };
    pmLog?: { time: string, status: string };
}

const AttendanceList: React.FC = () => {
  const [data, setData] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Show All');
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [qrToken, setQrToken] = useState<string>('');
  
  // Event Selection State
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  useEffect(() => {
    fetchEventsToday();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchAttendance(selectedEventId);
    } else if (events.length === 0 && !loading) {
      setData([]);
    }
  }, [selectedEventId]);

  const fetchEventsToday = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch events that include today's date
    const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today);
    
    if (eventsData && eventsData.length > 0) {
        setEvents(eventsData);
        // Default to first event if not already selected
        if (!selectedEventId) {
            setSelectedEventId(eventsData[0].event_id);
        } else {
            // Verify selected event is still in the list, else switch
            const exists = eventsData.find(e => e.event_id === selectedEventId);
            if (!exists) setSelectedEventId(eventsData[0].event_id);
            else fetchAttendance(selectedEventId); // Refresh if exists
        }
    } else {
        setEvents([]);
        setData([]);
        setLoading(false);
    }
  };

  const fetchAttendance = async (eventId: number) => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // 1. Get All Participants registered for THIS event
        // We select the participant details via the foreign key relationship
        const { data: eventParticipants, error: epError } = await supabase
            .from('event_participants')
            .select('participant_id, participants(*)')
            .eq('event_id', eventId);
        
        if (epError) throw epError;

        // 2. Get Today's Logs for THIS event
        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('attendance_date', today)
            .eq('event_id', eventId);
            
        if (logsError) throw logsError;
            
        if (eventParticipants) {
            // Map the joined data structure back to flat participant list
            const rows = eventParticipants
                .map((ep: any) => ep.participants)
                .filter((p: any) => p !== null) // Safety check for deleted participants
                .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name))
                .map((p: Participant) => {
                    const pLogs = logs?.filter(l => l.participant_id === p.participant_id) || [];
                    
                    // Sort logs by time ascending to pick the earliest scan as the "Time In"
                    pLogs.sort((a, b) => new Date(a.scan_time).getTime() - new Date(b.scan_time).getTime());

                    const am = pLogs.find(l => l.action_session === 'AM');
                    const pm = pLogs.find(l => l.action_session === 'PM');
                    
                    return {
                        participant: p,
                        amLog: am ? { time: am.scan_time, status: am.scan_status } : undefined,
                        pmLog: pm ? { time: pm.scan_time, status: pm.scan_status } : undefined,
                    };
                });
            setData(rows);
        }
    } catch (err) {
        console.error("Error fetching attendance:", err);
    } finally {
        setLoading(false);
    }
  };

  const filteredData = data.filter(row => {
    const hasAM = !!row.amLog;
    const hasPM = !!row.pmLog;
    
    switch (filter) {
        case 'No Logs': return !hasAM && !hasPM;
        case 'With AM': return hasAM;
        case 'No PM': return hasAM && !hasPM; // Must have AM but NO PM
        case 'Complete Logs': return hasAM && hasPM;
        case 'Show All':
        default: return true;
    }
  });

  const handleRowClick = (p: Participant) => {
    setSelectedParticipant(p);
    setQrToken(p.participant_code);
  };

  const handleRefresh = () => {
    if (selectedEventId) {
        fetchAttendance(selectedEventId);
    } else {
        fetchEventsToday();
    }
  };

  const FilterButton = ({ label }: { label: string }) => (
      <button
        onClick={() => setFilter(label)}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border whitespace-nowrap ${
            filter === label 
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }`}
      >
        {label}
      </button>
  );

  return (
    <div className="space-y-6">
      
      {/* Header Section */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            Attendance 
            {events.length === 0 && !loading && (
                <span className="text-sm font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">No Events Today</span>
            )}
            <button 
                onClick={handleRefresh} 
                className="ml-2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                title="Refresh Data"
            >
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
        </h2>
        <p className="text-slate-500 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Toolbar Section: Event Dropdown (Left) & Filters (Right) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
        
        {/* Left: Event Selector */}
        <div className="w-full md:w-auto min-w-[280px]">
            {events.length > 0 ? (
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
                        value={selectedEventId || ''}
                        onChange={(e) => setSelectedEventId(Number(e.target.value))}
                        className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                    >
                        {events.map(e => (
                            <option key={e.event_id} value={e.event_id}>
                                {e.event_name}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            ) : (
                <div className="text-slate-500 text-sm italic py-2">No active events found for today.</div>
            )}
        </div>

        {/* Right: Filters */}
        <div className="w-full md:w-auto overflow-x-auto no-scrollbar">
            <div className="flex gap-2">
                <FilterButton label="Show All" />
                <FilterButton label="No Logs" />
                <FilterButton label="With AM" />
                <FilterButton label="No PM" />
                <FilterButton label="Complete Logs" />
            </div>
        </div>
      </div>

      {/* Table Section */}
      {loading && data.length === 0 ? (
        <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Position</th>
                            <th className="px-6 py-4">Office</th>
                            <th className="px-6 py-4">AM Time</th>
                            <th className="px-6 py-4">PM Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredData.map((row) => (
                            <tr 
                                key={row.participant.participant_id} 
                                onClick={() => handleRowClick(row.participant)}
                                className="hover:bg-slate-50 cursor-pointer transition-colors group"
                            >
                                <td className="px-6 py-4 font-medium text-slate-800 group-hover:text-indigo-600">
                                    {row.participant.full_name}
                                </td>
                                <td className="px-6 py-4 text-slate-600">{row.participant.position}</td>
                                <td className="px-6 py-4 text-slate-600">{row.participant.office}</td>
                                <td className="px-6 py-4">
                                    {row.amLog ? (
                                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold">
                                            {format(new Date(row.amLog.time), 'h:mm a')}
                                        </span>
                                    ) : (
                                        <span className="text-slate-300">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {row.pmLog ? (
                                        <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-semibold">
                                            {format(new Date(row.pmLog.time), 'h:mm a')}
                                        </span>
                                    ) : (
                                        <span className="text-slate-300">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredData.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-slate-400">
                                    {events.length === 0 ? (
                                        <div className="flex flex-col items-center">
                                            <Calendar className="w-10 h-10 mb-2 opacity-20" />
                                            <p>No events scheduled for today.</p>
                                        </div>
                                    ) : (
                                        <p>No participants found matching "{filter}"</p>
                                    )}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Badge Modal */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
                onClick={() => setSelectedParticipant(null)}
            ></div>
            
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-semibold flex items-center gap-2">
                        <User size={20} /> Participant Badge
                    </h3>
                    <button 
                        onClick={() => setSelectedParticipant(null)} 
                        className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Badge Content */}
                <div className="p-8 flex flex-col items-center text-center">
                     <>
                        <div className="border-4 border-slate-900 p-3 rounded-xl mb-6 bg-white shadow-sm">
                            {qrToken && <QRCode value={qrToken} size={160} />}
                        </div>
                        
                        <h2 className="text-xl font-bold text-slate-800">{selectedParticipant.full_name}</h2>
                        <p className="text-indigo-600 font-medium mb-1">{selectedParticipant.position}</p>
                        <p className="text-slate-500 text-sm">{selectedParticipant.office}</p>
                        
                        <div className="mt-6 pt-6 border-t border-slate-100 w-full">
                            <p className="text-xs text-slate-400 font-mono mb-4">{selectedParticipant.participant_code}</p>
                            <button 
                                onClick={() => window.print()}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                            >
                                <Printer size={18} /> Print Badge
                            </button>
                        </div>
                     </>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceList;