import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Participant, Event } from '../../types/database';
import { X, User, Printer, Calendar, RefreshCw, PlusCircle, Clock, Save, Loader2, UserCheck, UserX, AlertCircle, CheckCircle, Users, Search } from 'lucide-react';
import QRCode from 'react-qr-code';
import { format } from 'date-fns';

interface AttendanceRow {
    participant: Participant;
    amLog?: { time: string, status: string };
    pmLog?: { time: string, status: string };
}

const AttendanceList: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Show All');
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [qrToken, setQrToken] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Event Selection State
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  // Manual Entry State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualParticipant, setManualParticipant] = useState<Participant | null>(null);
  const [manualForm, setManualForm] = useState({
      date: new Date().toISOString().split('T')[0],
      time: format(new Date(), 'HH:mm'),
      session: 'AM' as 'AM' | 'PM',
      status: 'Valid' as const
  });
  const [savingManual, setSavingManual] = useState(false);

  // Subscribe to new events creation
  useEffect(() => {
    fetchEventsToday();

    const channel = supabase
        .channel('participants_events_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
            fetchEventsToday();
        })
        .subscribe();
    
    return () => {
        supabase.removeChannel(channel);
    };
  }, []);

  // Subscribe to data changes for the selected event
  useEffect(() => {
    if (selectedEventId) {
      fetchAttendance(selectedEventId);

      const channel = supabase
        .channel(`participants_data_${selectedEventId}`)
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'attendance_logs',
            filter: `event_id=eq.${selectedEventId}`
        }, () => fetchAttendance(selectedEventId))
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'event_participants',
            filter: `event_id=eq.${selectedEventId}`
        }, () => fetchAttendance(selectedEventId))
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else if (events.length === 0 && !loading) {
      setData([]);
    }
  }, [selectedEventId]);

  const fetchEventsToday = async () => {
    // Note: We don't trigger loading=true here to avoid flickering on realtime updates
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
        }
    } else {
        // Fallback: Fetch ALL ongoing/scheduled events if none matched "today" logic strictly
        // This helps if admins want to view past events
        const { data: allEvents } = await supabase.from('events').select('*').order('start_date', { ascending: false }).limit(20);
        if (allEvents && allEvents.length > 0) {
             setEvents(allEvents);
             if (!selectedEventId) setSelectedEventId(allEvents[0].event_id);
        } else {
            setEvents([]);
            setData([]);
            setLoading(false);
        }
    }
  };

  const fetchAttendance = async (eventId: number) => {
    if (data.length === 0) setLoading(true); // Only show loading on empty state
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // 1. Get All Participants registered for THIS event
        const { data: eventParticipants, error: epError } = await supabase
            .from('event_participants')
            .select('participant_id, participants(*)')
            .eq('event_id', eventId);
        
        if (epError) throw epError;

        // 2. Get All Logs for THIS event (not just today, so we can see history if needed, 
        // but typically we filter by date in UI or Query. Let's get ALL logs for the event to handle manual entry of past dates correctly in view)
        // However, the View is designed for "Today's Attendance" mostly. 
        // Let's widen the query slightly or keep it to today. 
        // *Correction*: The prompt implies manual inputting date. If they input a past date, it won't show up if we only fetch today.
        // Let's fetch logs for ALL dates for this event to be safe, or just rely on the Manual Modal to insert and the user to select the date they want to view?
        // To keep the UI simple, the main view shows attendance based on the *Event's current context*.
        // We will fetch logs for ALL dates for this event.
        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('event_id', eventId);
            
        if (logsError) throw logsError;
            
        if (eventParticipants) {
            // Map the joined data structure back to flat participant list
            const rows = eventParticipants
                .map((ep: any) => ep.participants)
                .filter((p: any) => p !== null) // Safety check for deleted participants
                .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name))
                .map((p: Participant) => {
                    // Filter logs for this participant
                    const pLogs = logs?.filter(l => l.participant_id === p.participant_id) || [];
                    
                    // We need to decide WHICH date to show. 
                    // Default behavior: Show logs for "Today". 
                    // If the user manually added a log for yesterday, it won't show unless we have a Date Picker filter for the view.
                    // For now, we will filter logs to match the "today" variable which is system date.
                    // *Improvement*: If the event is multi-day, we might need a date selector.
                    // For this specific request, we'll stick to showing Today's logs in the columns, 
                    // but the manual entry allows inserting for any date.
                    
                    const todaysLogs = pLogs.filter(l => l.attendance_date === today);

                    todaysLogs.sort((a, b) => new Date(a.scan_time).getTime() - new Date(b.scan_time).getTime());

                    const am = todaysLogs.find(l => l.action_session === 'AM');
                    const pm = todaysLogs.find(l => l.action_session === 'PM');
                    
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

    // Search Filter
    if (searchQuery && !row.participant.full_name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
    }
    
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

  const openManualModal = (e: React.MouseEvent, p: Participant) => {
      e.stopPropagation();
      setManualParticipant(p);
      setManualForm({
          date: new Date().toISOString().split('T')[0],
          time: format(new Date(), 'HH:mm'),
          session: new Date().getHours() < 12 ? 'AM' : 'PM',
          status: 'Valid'
      });
      setShowManualModal(true);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!manualParticipant || !selectedEventId || !user) return;
      
      setSavingManual(true);
      try {
          // Construct timestamp
          // Note: scan_time expects full ISO string usually, or at least date+time
          const dateTimeStr = `${manualForm.date}T${manualForm.time}:00`;
          
          const { error } = await supabase.from('attendance_logs').insert({
              event_id: selectedEventId,
              participant_id: manualParticipant.participant_id,
              user_id: user.user_id,
              attendance_date: manualForm.date,
              scan_time: dateTimeStr,
              action_session: manualForm.session,
              scan_status: manualForm.status,
              remarks: 'Manual Entry',
              scanner_device: 'Manual Input'
          });

          if (error) throw error;
          
          setShowManualModal(false);
          // fetchAttendance handled by realtime subscription
          
      } catch (err: any) {
          alert("Error adding log: " + err.message);
      } finally {
          setSavingManual(false);
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

  // Stats Calculation
  const totalParticipants = data.length;
  const presentCount = data.filter(r => r.amLog || r.pmLog).length;
  const notPresentCount = data.filter(r => !r.amLog && !r.pmLog).length;
  const noPmCount = data.filter(r => r.amLog && !r.pmLog).length;
  const completeLogsCount = data.filter(r => r.amLog && r.pmLog).length;

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
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
        
        <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
            {/* Left: Event Selector */}
            <div className="w-full md:w-72">
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

            {/* Search Bar */}
            <div className="w-full md:w-64 relative">
                 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                     <Search size={18} />
                 </div>
                 <input 
                    type="text" 
                    placeholder="Search participants..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                 />
            </div>
        </div>

        {/* Right: Filters */}
        <div className="w-full xl:w-auto overflow-x-auto no-scrollbar">
            <div className="flex gap-2">
                <FilterButton label="Show All" />
                <FilterButton label="No Logs" />
                <FilterButton label="With AM" />
                <FilterButton label="No PM" />
                <FilterButton label="Complete Logs" />
            </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Total</p>
                  <div className="p-1.5 bg-slate-100 rounded-lg text-slate-600"><Users size={16} /></div>
              </div>
              <p className="text-2xl font-bold text-slate-800">{totalParticipants}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Present</p>
                  <div className="p-1.5 bg-green-100 rounded-lg text-green-600"><UserCheck size={16} /></div>
              </div>
              <p className="text-2xl font-bold text-green-600">{presentCount}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Not Present</p>
                  <div className="p-1.5 bg-red-100 rounded-lg text-red-600"><UserX size={16} /></div>
              </div>
              <p className="text-2xl font-bold text-red-600">{notPresentCount}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">No PM</p>
                  <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><AlertCircle size={16} /></div>
              </div>
              <p className="text-2xl font-bold text-amber-600">{noPmCount}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Complete</p>
                  <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600"><CheckCircle size={16} /></div>
              </div>
              <p className="text-2xl font-bold text-indigo-600">{completeLogsCount}</p>
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
                            <th className="px-6 py-4 w-16">#</th>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Position</th>
                            <th className="px-6 py-4">Office</th>
                            <th className="px-6 py-4">AM Time</th>
                            <th className="px-6 py-4">PM Time</th>
                            <th className="px-6 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredData.map((row, index) => (
                            <tr 
                                key={row.participant.participant_id} 
                                onClick={() => handleRowClick(row.participant)}
                                className="hover:bg-slate-50 cursor-pointer transition-colors group"
                            >
                                <td className="px-6 py-4 text-slate-500 font-mono text-xs">{index + 1}</td>
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
                                <td className="px-6 py-4 text-center">
                                    <button
                                        onClick={(e) => openManualModal(e, row.participant)}
                                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="Manual Log Entry"
                                    >
                                        <PlusCircle size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredData.length === 0 && (
                            <tr>
                                <td colSpan={7} className="text-center py-12 text-slate-400">
                                    {events.length === 0 ? (
                                        <div className="flex flex-col items-center">
                                            <Calendar className="w-10 h-10 mb-2 opacity-20" />
                                            <p>No events found.</p>
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

      {/* Manual Entry Modal */}
      {showManualModal && manualParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
                onClick={() => setShowManualModal(false)}
            ></div>

            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Clock size={20} /> Manual Attendance
                    </h3>
                    <button 
                        onClick={() => setShowManualModal(false)} 
                        className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 mb-2">
                        <p className="text-xs text-indigo-500 uppercase font-bold tracking-wider mb-1">Participant</p>
                        <p className="font-bold text-slate-800">{manualParticipant.full_name}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                            <input 
                                type="date"
                                required
                                value={manualForm.date}
                                onChange={e => setManualForm({...manualForm, date: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                            <input 
                                type="time"
                                required
                                value={manualForm.time}
                                onChange={e => setManualForm({...manualForm, time: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Session</label>
                            <select
                                value={manualForm.session}
                                onChange={e => setManualForm({...manualForm, session: e.target.value as any})}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                            >
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                            <select
                                value={manualForm.status}
                                onChange={e => setManualForm({...manualForm, status: e.target.value as any})}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                            >
                                <option value="Valid">Valid</option>
                                <option value="Late">Late</option>
                                <option value="Excuse">Excuse</option>
                            </select>
                        </div>
                    </div>

                    <button 
                        type="submit"
                        disabled={savingManual}
                        className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-all shadow-md flex justify-center items-center gap-2 mt-4"
                    >
                        {savingManual ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Log Attendance
                    </button>
                </form>
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
