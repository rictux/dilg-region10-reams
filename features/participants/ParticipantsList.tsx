
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Participant, Event, RefLocation } from '../../types/database';
import { X, User, Printer, Calendar, RefreshCw, PlusCircle, Clock, Save, Loader2, UserCheck, UserX, AlertCircle, CheckCircle, Users, Search, Home, ChevronDown, Check, Filter, Building, Landmark, MapPin, Briefcase, Mail, Phone } from 'lucide-react';
import QRCode from 'react-qr-code';
import { format, parseISO, eachDayOfInterval, isSameMonth, isSameYear } from 'date-fns';
import { toPng } from 'html-to-image';

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
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Dropdown & Date Selection State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [eventSearchTerm, setEventSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [eventDays, setEventDays] = useState<Date[]>([]);

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

  // Add Participant State
  const [showAddModal, setShowAddModal] = useState(false);
  const [locations, setLocations] = useState<RefLocation[]>([]);
  const [addForm, setAddForm] = useState({
      full_name: '',
      email: '',
      mobile_no: '',
      position: '',
      office: '',
      gender: 'Male',
      age_group: '18-24',
      pwd: 'No',
      indigenous_people: 'No'
  });
  const [addAffiliationType, setAddAffiliationType] = useState<'Office' | 'LGU'>('Office');
  const [addProvince, setAddProvince] = useState('');
  const [addCity, setAddCity] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Click Outside Listener for Dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Events
  useEffect(() => {
    const fetchLocations = async () => {
        const { data } = await supabase
            .from('ref_locations')
            .select('*')
            .order('province_huc', { ascending: true })
            .order('city_mun', { ascending: true });
        if (data) setLocations(data);
    };
    fetchLocations();

    const fetchAllEvents = async () => {
        let query = supabase.from('events').select('*').order('start_date', { ascending: false });

        // Filter events by office for non-admins
        if (user?.role !== 'Admin' && user?.office_id) {
            query = query.eq('organize_by', user.office_id);
        }

        const { data } = await query;
        if (data && data.length > 0) {
            setEvents(data);
            // Default select the latest event
            handleEventSelect(data[0]);
        } else {
            setEvents([]);
            setLoading(false);
        }
    };
    
    if (user) {
        fetchAllEvents();
    }

    const channel = supabase
        .channel('participants_events_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
            if (user) fetchAllEvents();
        })
        .subscribe();
    
    return () => {
        supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch Attendance when Event or Date Changes
  useEffect(() => {
    if (selectedEventId && selectedDate) {
      fetchAttendance(selectedEventId, selectedDate);

      const channel = supabase
        .channel(`participants_data_${selectedEventId}`)
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'attendance_logs',
            filter: `event_id=eq.${selectedEventId}`
        }, () => fetchAttendance(selectedEventId, selectedDate))
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'event_participants',
            filter: `event_id=eq.${selectedEventId}`
        }, () => fetchAttendance(selectedEventId, selectedDate))
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      if (events.length === 0 && !loading) {
         setData([]);
      }
    }
  }, [selectedEventId, selectedDate]);

  const handleEventSelect = (event: Event) => {
      setSelectedEventId(event.event_id);
      setSelectedEvent(event);
      
      const start = parseISO(event.start_date);
      const end = event.end_date ? parseISO(event.end_date) : start;
      
      let days: Date[] = [];
      try {
          if (start <= end) {
               days = eachDayOfInterval({ start, end });
          } else {
               days = [start];
          }
      } catch (e) {
          days = [start];
      }
      setEventDays(days);
      
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const isTodayInRange = days.some(d => format(d, 'yyyy-MM-dd') === todayStr);
      
      const newDate = isTodayInRange ? todayStr : format(days[0], 'yyyy-MM-dd');
      setSelectedDate(newDate);
      
      setIsDropdownOpen(false);
      setEventSearchTerm('');
      
      setManualForm(prev => ({ ...prev, date: newDate }));
  };

  const fetchAttendance = async (eventId: number, dateStr: string) => {
    if (data.length === 0) setLoading(true); 
    
    try {
        const { data: eventParticipants, error: epError } = await supabase
            .from('event_participants')
            .select('participant_id, participants(*)')
            .eq('event_id', eventId);
        
        if (epError) throw epError;

        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('event_id', eventId);
            
        if (logsError) throw logsError;
            
        if (eventParticipants) {
            const rows = eventParticipants
                .map((ep: any) => ep.participants)
                .filter((p: any) => p !== null) 
                .map((p: Participant) => {
                    const pLogs = logs?.filter(l => l.participant_id === p.participant_id) || [];
                    const daysLogs = pLogs.filter(l => l.attendance_date === dateStr);

                    const amLogs = daysLogs.filter(l => l.action_session === 'AM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));
                    const pmLogs = daysLogs.filter(l => l.action_session === 'PM').sort((a,b) => b.scan_time.localeCompare(a.scan_time));

                    return {
                        participant: p,
                        amLog: amLogs.length > 0 ? { time: amLogs[0].scan_time, status: amLogs[0].scan_status } : undefined,
                        pmLog: pmLogs.length > 0 ? { time: pmLogs[pmLogs.length - 1].scan_time, status: pmLogs[pmLogs.length - 1].scan_status } : undefined,
                    };
                });

            // Sorting logic: AM logs on top, then sorted by AM time ascending, then alphabetically for those without
            const sortedRows = rows.sort((a, b) => {
                const hasAM_a = !!a.amLog;
                const hasAM_b = !!b.amLog;

                if (hasAM_a && !hasAM_b) return -1;
                if (!hasAM_a && hasAM_b) return 1;

                if (hasAM_a && hasAM_b) {
                    // Both have AM logs, sort by time ASC
                    return a.amLog!.time.localeCompare(b.amLog!.time);
                }

                // Neither have AM logs, sort alphabetically
                return a.participant.full_name.localeCompare(b.participant.full_name);
            });

            setData(sortedRows);
        }
    } catch (err) {
        console.error("Error fetching attendance:", err);
    } finally {
        setLoading(false);
    }
  };

  const filteredData = data.filter(row => {
    if (searchQuery && !row.participant.full_name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
    }
    
    const hasAM = !!row.amLog;
    const hasPM = !!row.pmLog;

    switch (filter) {
        case 'No Logs': return !hasAM && !hasPM;
        case 'Present': return hasAM || hasPM;
        case 'No PM': return hasAM && !hasPM;
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
    if (selectedEventId && selectedDate) {
        fetchAttendance(selectedEventId, selectedDate);
    }
  };

  const openManualModal = (e: React.MouseEvent, p: Participant) => {
      e.stopPropagation();
      setManualParticipant(p);
      setManualForm({
          date: selectedDate || new Date().toISOString().split('T')[0],
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
          const localDate = new Date(`${manualForm.date}T${manualForm.time}:00`);
          const scanTimeStr = localDate.toISOString();
          
          if (manualForm.session === 'PM') {
              // For PM, check if entry exists to have "latest time out"
              const { data: existingPM } = await supabase
                .from('attendance_logs')
                .select('attendance_id')
                .eq('event_id', selectedEventId)
                .eq('participant_id', manualParticipant.participant_id)
                .eq('attendance_date', manualForm.date)
                .eq('action_session', 'PM')
                .eq('scan_status', 'Valid')
                .maybeSingle();

              if (existingPM) {
                  // Update existing PM entry
                  const { error: updateError } = await supabase
                    .from('attendance_logs')
                    .update({
                        scan_time: scanTimeStr,
                        scan_status: manualForm.status,
                        remarks: 'Manual Entry (Updated PM)',
                        user_id: user.user_id
                    })
                    .eq('attendance_id', existingPM.attendance_id);
                  if (updateError) throw updateError;
              } else {
                  // Insert new PM entry
                  const { error: insertError } = await supabase.from('attendance_logs').insert({
                    event_id: selectedEventId,
                    participant_id: manualParticipant.participant_id,
                    user_id: user.user_id,
                    attendance_date: manualForm.date,
                    scan_time: scanTimeStr,
                    action_session: manualForm.session,
                    scan_status: manualForm.status,
                    remarks: 'Manual Entry (PM)',
                    scanner_device: 'Manual Input'
                  });
                  if (insertError) throw insertError;
              }
          } else {
              // AM Session - Insert (Standard manual log)
              const { error: insertError } = await supabase.from('attendance_logs').insert({
                  event_id: selectedEventId,
                  participant_id: manualParticipant.participant_id,
                  user_id: user.user_id,
                  attendance_date: manualForm.date,
                  scan_time: scanTimeStr,
                  action_session: manualForm.session,
                  scan_status: manualForm.status,
                  remarks: 'Manual Entry',
                  scanner_device: 'Manual Input'
              });
              if (insertError) throw insertError;
          }

          setShowManualModal(false);
          // fetchAttendance will be triggered by supabase real-time channel
      } catch (err: any) {
          alert("Error adding log: " + err.message);
      } finally {
          setSavingManual(false);
      }
  };

  const handleAddParticipantSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedEventId || !user) return;
      
      setIsAdding(true);
      try {
          let finalLocationId = null;
          let finalOfficeName = addForm.office;

          if (addAffiliationType === 'LGU') {
              if (!addProvince) throw new Error("Please select a Province/HUC for LGU.");
              
              if (addCity) {
                  const loc = locations.find(l => l.province_huc === addProvince && l.city_mun === addCity);
                  if (loc) {
                      finalLocationId = loc.location_id;
                      finalOfficeName = `LGU ${addCity}, ${addProvince}`;
                  } else {
                      throw new Error("Selected location is invalid.");
                  }
              } else {
                  const loc = locations.find(l => l.province_huc === addProvince && !l.city_mun);
                  if (loc) finalLocationId = loc.location_id;
                  
                  if (addProvince.toLowerCase().includes('city')) {
                       finalOfficeName = `LGU ${addProvince}`;
                  } else {
                       finalOfficeName = `Provincial Gov't of ${addProvince}`;
                  }
              }
          } else {
              if (!addForm.office.trim()) throw new Error("Please enter Office / Agency name.");
          }

          const finalEmail = addForm.email.trim() === '' ? null : addForm.email.trim();
          const finalMobile = addForm.mobile_no.trim() === '' ? null : addForm.mobile_no.trim();

          // Check existing
          let participantId: number;
          let existingUser = null;
          
          if (finalEmail) {
               const { data } = await supabase.from('participants').select('participant_id').eq('email', finalEmail).single();
               existingUser = data;
          }

          if (existingUser) {
              participantId = existingUser.participant_id;
              await supabase.from('participants').update({
                  full_name: addForm.full_name,
                  gender: addForm.gender,
                  position: addForm.position,
                  office: finalOfficeName,
                  location_id: finalLocationId,
                  mobile_no: finalMobile,
                  age_group: addForm.age_group,
                  pwd: addForm.pwd,
                  indigenous_people: addForm.indigenous_people
              }).eq('participant_id', participantId);
          } else {
              const initials = addForm.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3);
              const code = `${initials}-${Date.now().toString().slice(-6)}`;
              
              const { data: newUser, error: createError } = await supabase.from('participants').insert([{
                  full_name: addForm.full_name,
                  email: finalEmail,
                  mobile_no: finalMobile,
                  gender: addForm.gender,
                  position: addForm.position,
                  office: finalOfficeName,
                  location_id: finalLocationId,
                  participant_code: code,
                  age_group: addForm.age_group,
                  pwd: addForm.pwd,
                  indigenous_people: addForm.indigenous_people
              }]).select().single();
              
              if (createError) throw createError;
              participantId = newUser.participant_id;
          }

          const { error: regError } = await supabase.from('event_participants').insert({
              event_id: selectedEventId,
              participant_id: participantId,
              registration_status: 'Registered',
              role: 'Delegate',
              needs_accommodation: false,
              accommodation_pax: 0
          });

          if (regError && regError.code !== '23505') throw regError;

          setShowAddModal(false);
          setAddForm({
              full_name: '', email: '', mobile_no: '', position: '', office: '',
              gender: 'Male', age_group: '18-24', pwd: 'No', indigenous_people: 'No'
          });
          setAddAffiliationType('Office');
          setAddProvince('');
          setAddCity('');
          
          fetchAttendance(selectedEventId, selectedDate);
          alert("Participant added successfully!");

      } catch (err: any) {
          alert("Error adding participant: " + err.message);
      } finally {
          setIsAdding(false);
      }
  };

  const formatLogTime = (timeStr: string) => {
      const d = new Date(timeStr.endsWith('Z') || timeStr.includes('+') ? timeStr : timeStr + 'Z');
      return format(d, 'h:mm a');
  };

  const formatEventDate = (start: string, end: string) => {
    if (!start) return '';
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;

    if (start === end || !end) {
        return format(startDate, 'MMM. d, yyyy');
    }

    if (isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMM. d')}-${format(endDate, 'd, yyyy')}`;
    }

    if (!isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMM. d')} - ${format(endDate, 'MMM. d, yyyy')}`;
    }

    return `${format(startDate, 'MMM. d, yyyy')} - ${format(endDate, 'MMM. d, yyyy')}`;
  };

  const filteredEvents = events.filter(e => 
      e.event_name.toLowerCase().includes(eventSearchTerm.toLowerCase())
  );

  const totalParticipants = data.length;
  const presentCount = data.filter(r => r.amLog || r.pmLog).length;
  const notPresentCount = data.filter(r => !r.amLog && !r.pmLog).length;
  const noPmCount = data.filter(r => r.amLog && !r.pmLog).length;
  const completeLogsCount = data.filter(r => r.amLog && r.pmLog).length;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isFutureEvent = selectedDate > todayStr;
  
  const provinces = Array.from(new Set(locations.map(l => l.province_huc))).sort();
  const cities = locations.filter(l => l.province_huc === addProvince && l.city_mun).map(l => l.city_mun as string).sort();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                Attendance 
                <button 
                    onClick={handleRefresh} 
                    className="ml-2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                    title="Refresh Data"
                >
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
            </h2>
            <p className="text-slate-500 text-sm mt-1">
                {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : 'Select an event'}
            </p>
        </div>
        <button
            onClick={() => setShowAddModal(true)}
            disabled={!selectedEventId}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm
                ${selectedEventId ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
            `}
        >
            <PlusCircle size={18} />
            Add Participant
        </button>
      </div>

      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
        <div className="flex flex-col md:flex-row gap-4 w-full items-start md:items-center">
            <div className="w-full max-w-[60ch] relative" ref={dropdownRef}>
                <div 
                    className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 flex justify-between items-center cursor-pointer hover:border-indigo-400 transition-colors shadow-sm min-h-[42px]"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <div className="flex items-center gap-2 w-full">
                        <Calendar className="text-slate-400 shrink-0" size={16} />
                        <span className={`text-xs ${!selectedEvent ? 'text-slate-500' : 'text-slate-800 font-medium'} whitespace-normal text-left break-words`}>
                            {selectedEvent ? selectedEvent.event_name : "-- Select Event --"}
                        </span>
                    </div>
                    <ChevronDown className={`text-slate-400 transition-transform shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} size={14} />
                </div>

                {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search event..."
                                    value={eventSearchTerm}
                                    onChange={(e) => setEventSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            {filteredEvents.length > 0 ? (
                                filteredEvents.map(e => (
                                    <div 
                                        key={e.event_id}
                                        className={`px-4 py-2 text-xs cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50 transition-colors flex items-center justify-between group
                                            ${selectedEventId === e.event_id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}
                                        `}
                                        onClick={() => handleEventSelect(e)}
                                    >
                                        <div className="overflow-hidden w-full mr-2">
                                            <p className="whitespace-normal break-words leading-snug">{e.event_name}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">{formatEventDate(e.start_date, e.end_date)}</p>
                                        </div>
                                        {selectedEventId === e.event_id && <Check size={14} className="text-indigo-600 shrink-0" />}
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-8 text-center text-xs text-slate-400">
                                    No events found.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {eventDays.length > 1 && (
                <div className="flex bg-white rounded-lg border border-slate-200 p-1 overflow-x-auto no-scrollbar max-w-full">
                    {eventDays.map((day, idx) => {
                        const dStr = format(day, 'yyyy-MM-dd');
                        const isSelected = selectedDate === dStr;
                        return (
                            <button
                                key={dStr}
                                onClick={() => setSelectedDate(dStr)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md whitespace-nowrap transition-all flex flex-col items-center min-w-[60px]
                                    ${isSelected 
                                        ? 'bg-indigo-600 text-white shadow-sm' 
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                    }`}
                            >
                                <span>Day {idx + 1}</span>
                                <span className={`text-[9px] font-normal ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                    {format(day, 'MMM d')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="w-full md:w-64 relative ml-auto">
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
      </div>

      {/* Stats Cards as Filters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <button 
            onClick={() => setFilter('Show All')}
            className={`p-4 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                ${filter === 'Show All' ? 'ring-2 ring-slate-400 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-slate-300'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-2 w-full">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Total</p>
                  <div className={`p-1.5 rounded-lg ${filter === 'Show All' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>
                    <Users size={16} />
                  </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">{totalParticipants}</p>
          </button>

          <button 
            onClick={() => setFilter('Present')}
            className={`p-4 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                ${filter === 'Present' ? 'ring-2 ring-green-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-green-200'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-2 w-full">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Present</p>
                  <div className={`p-1.5 rounded-lg ${filter === 'Present' ? 'bg-green-200 text-green-700' : 'bg-green-100 text-green-600'}`}>
                    <UserCheck size={16} />
                  </div>
              </div>
              <p className="text-2xl font-bold text-green-600">{presentCount}</p>
          </button>

          <button 
            onClick={() => setFilter('No Logs')}
            className={`p-4 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                ${filter === 'No Logs' ? 'ring-2 ring-red-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-red-200'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-2 w-full">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Not Present</p>
                  <div className={`p-1.5 rounded-lg ${filter === 'No Logs' ? 'bg-red-200 text-red-700' : 'bg-red-100 text-red-600'}`}>
                    <UserX size={16} />
                  </div>
              </div>
              <p className="text-2xl font-bold text-red-600">{notPresentCount}</p>
          </button>

          <button 
            onClick={() => setFilter('No PM')}
            className={`p-4 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                ${filter === 'No PM' ? 'ring-2 ring-amber-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-amber-200'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-2 w-full">
                  <p className="text-xs font-semibold text-slate-500 uppercase">No PM</p>
                  <div className={`p-1.5 rounded-lg ${filter === 'No PM' ? 'bg-amber-200 text-amber-700' : 'bg-amber-100 text-amber-600'}`}>
                    <AlertCircle size={16} />
                  </div>
              </div>
              <p className="text-2xl font-bold text-amber-600">{noPmCount}</p>
          </button>

          <button 
            onClick={() => setFilter('Complete Logs')}
            className={`p-4 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200 col-span-2 sm:col-span-1
                ${filter === 'Complete Logs' ? 'ring-2 ring-indigo-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-indigo-200'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-2 w-full">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Complete</p>
                  <div className={`p-1.5 rounded-lg ${filter === 'Complete Logs' ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-100 text-indigo-600'}`}>
                    <CheckCircle size={16} />
                  </div>
              </div>
              <p className="text-2xl font-bold text-indigo-600">{completeLogsCount}</p>
          </button>
      </div>

      {loading && data.length === 0 ? (
        <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Active Filter Indicator in Table Header */}
            {filter !== 'Show All' && (
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-sm text-slate-600">
                    <Filter size={14} />
                    <span>Filtering by: <span className="font-bold text-slate-800">{filter}</span></span>
                    <button 
                        onClick={() => setFilter('Show All')}
                        className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                        Clear Filter
                    </button>
                </div>
            )}
            
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
                                            {formatLogTime(row.amLog.time)}
                                        </span>
                                    ) : (
                                        <span className="text-slate-300">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {row.pmLog ? (
                                        <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-semibold">
                                            {formatLogTime(row.pmLog.time)}
                                        </span>
                                    ) : (
                                        <span className="text-slate-300">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button
                                        onClick={(e) => !isFutureEvent && openManualModal(e, row.participant)}
                                        disabled={isFutureEvent}
                                        className={`p-2 rounded-lg transition-colors ${isFutureEvent ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                        title={isFutureEvent ? "Cannot add logs for future dates" : "Manual Log Entry"}
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

      {showManualModal && manualParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowManualModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Clock size={20} /> Manual Attendance
                    </h3>
                    <button onClick={() => setShowManualModal(false)} className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition">
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
                            <input type="date" required value={manualForm.date} onChange={e => setManualForm({...manualForm, date: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                            <input type="time" required value={manualForm.time} onChange={e => setManualForm({...manualForm, time: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Session</label>
                            <select value={manualForm.session} onChange={e => setManualForm({...manualForm, session: e.target.value as any})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white">
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                            <select value={manualForm.status} onChange={e => setManualForm({...manualForm, status: e.target.value as any})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white">
                                <option value="Valid">Valid</option>
                                <option value="Late">Late</option>
                                <option value="Excuse">Excuse</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" disabled={savingManual} className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-all shadow-md flex justify-center items-center gap-2 mt-4">
                        {savingManual ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Log Attendance
                    </button>
                </form>
            </div>
          </div>
      )}

      {selectedParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedParticipant(null)}></div>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-semibold flex items-center gap-2">
                        <User size={20} /> Participant Badge
                    </h3>
                    <button onClick={() => setSelectedParticipant(null)} className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>
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
                        </div>
                     </>
                </div>
            </div>
        </div>
      )}

      {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowAddModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-semibold flex items-center gap-2">
                        <PlusCircle size={20} /> Add Participant
                    </h3>
                    <button onClick={() => setShowAddModal(false)} className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="overflow-y-auto p-6">
                    <form onSubmit={handleAddParticipantSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        required 
                                        type="text"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        placeholder="Type name..."
                                        value={addForm.full_name}
                                        onChange={e => setAddForm({...addForm, full_name: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        type="email"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        placeholder="john@company.com"
                                        value={addForm.email}
                                        onChange={e => setAddForm({...addForm, email: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mobile No.</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        type="tel"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        placeholder="09123456789"
                                        value={addForm.mobile_no}
                                        onChange={e => setAddForm({...addForm, mobile_no: e.target.value.replace(/[^0-9]/g, '')})}
                                        maxLength={11}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Position / Title</label>
                                <div className="relative">
                                    <Briefcase className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        required 
                                        type="text"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        placeholder="Manager"
                                        value={addForm.position}
                                        onChange={e => setAddForm({...addForm, position: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                             <label className="block text-sm font-medium text-slate-700 mb-2">Affiliation Type</label>
                             <div className="flex gap-4 mb-4">
                                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${addAffiliationType === 'Office' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="radio" 
                                        className="hidden" 
                                        checked={addAffiliationType === 'Office'} 
                                        onChange={() => setAddAffiliationType('Office')}
                                    />
                                    <Building size={20} />
                                    <span className="font-medium">NGA / Office</span>
                                </label>
                                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${addAffiliationType === 'LGU' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="radio" 
                                        className="hidden" 
                                        checked={addAffiliationType === 'LGU'} 
                                        onChange={() => setAddAffiliationType('LGU')}
                                    />
                                    <Landmark size={20} />
                                    <span className="font-medium">LGU</span>
                                </label>
                             </div>

                             {addAffiliationType === 'Office' ? (
                                <div className="animate-in fade-in zoom-in-95 duration-200">
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Office / Agency Name</label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-3 text-slate-400" size={18} />
                                        <input 
                                            required={addAffiliationType === 'Office'}
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            placeholder="e.g. DILG Regional Office 10"
                                            value={addForm.office}
                                            onChange={e => setAddForm({...addForm, office: e.target.value})}
                                        />
                                    </div>
                                </div>
                             ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Province / HUC</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <select 
                                                required={addAffiliationType === 'LGU'}
                                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white appearance-none"
                                                value={addProvince}
                                                onChange={e => {
                                                    setAddProvince(e.target.value);
                                                    setAddCity('');
                                                }}
                                            >
                                                <option value="">-- Select Province --</option>
                                                {provinces.map(prov => (
                                                    <option key={prov} value={prov}>{prov}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">City / Municipality</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <select 
                                                disabled={!addProvince}
                                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white appearance-none disabled:bg-slate-100 disabled:text-slate-400"
                                                value={addCity}
                                                onChange={e => setAddCity(e.target.value)}
                                            >
                                                <option value="">-- Provincial / HUC Level (Optional) --</option>
                                                {cities.map(city => (
                                                    <option key={city} value={city}>{city}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                             )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender</label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={addForm.gender}
                                    onChange={e => setAddForm({...addForm, gender: e.target.value})}
                                >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Age Group</label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={addForm.age_group}
                                    onChange={e => setAddForm({...addForm, age_group: e.target.value})}
                                >
                                    <option value="18-24">18-24</option>
                                    <option value="25-34">25-34</option>
                                    <option value="35-44">35-44</option>
                                    <option value="45-54">45-54</option>
                                    <option value="55-65">55-65</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button 
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium mr-2"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                disabled={isAdding}
                                className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2"
                            >
                                {isAdding ? <Loader2 className="animate-spin" size={18} /> : <PlusCircle size={18} />}
                                Add Participant
                            </button>
                        </div>
                    </form>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default AttendanceList;
