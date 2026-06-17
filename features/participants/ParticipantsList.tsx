
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Participant, Event, GiveawayItem } from '../../types/database';
import { X, User, Printer, Calendar, RefreshCw, PlusCircle, Clock, Save, Loader2, UserCheck, UserX, AlertCircle, CheckCircle, Users, Search, Bed, ChevronDown, Check, UserPlus, Building, Landmark, Download, Gift } from 'lucide-react';
import QRCode from 'react-qr-code';
import { format, parseISO, eachDayOfInterval, isSameMonth, isSameYear } from 'date-fns';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface AttendanceRow {
    participant: Participant;
    role?: string;
    needs_accommodation?: boolean;
    giveaway_selections?: Record<string, string | boolean> | null;
    amLog?: { time: string, status: string };
    pmLog?: { time: string, status: string };
}

// Distinct color per size/option value so different sizes are visually separable.
// Picked deterministically by hashing the value, so the same size always maps to
// the same color across rows.
const GIVEAWAY_SIZE_COLORS = [
    'bg-blue-100 text-blue-700',
    'bg-amber-100 text-amber-700',
    'bg-teal-100 text-teal-700',
    'bg-violet-100 text-violet-700',
    'bg-orange-100 text-orange-700',
    'bg-cyan-100 text-cyan-700',
    'bg-rose-100 text-rose-700',
    'bg-lime-100 text-lime-700',
];
const giveawaySizeColor = (value: string) => {
    let h = 0;
    for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
    return GIVEAWAY_SIZE_COLORS[h % GIVEAWAY_SIZE_COLORS.length];
};

type GiveawayChip = { key: string; text: string; className: string };

// Build per-value colored chips + a full tooltip describing a participant's giveaway
// choices made at registration. Yes → green, No → grey, and each size/option gets its
// own color. Returns null when the event offers no giveaways.
const summarizeGiveaways = (
    giveaways: GiveawayItem[] | null | undefined,
    selections: Record<string, string | boolean> | null | undefined,
): { chips: GiveawayChip[]; detail: string } | null => {
    if (!giveaways || giveaways.length === 0) return null;
    const chips: GiveawayChip[] = [];
    const detailParts: string[] = [];
    for (const item of giveaways) {
        const value = selections?.[item.key];
        if (item.type === 'boolean') {
            const yes = value === true;
            chips.push({
                key: item.key,
                text: yes ? 'Yes' : 'No',
                className: yes ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
            });
            detailParts.push(`${item.label}: ${yes ? 'Yes' : 'No'}`);
        } else {
            const sel = typeof value === 'string' ? value.trim() : '';
            chips.push({
                key: item.key,
                text: sel || '—',
                className: sel ? giveawaySizeColor(sel) : 'bg-slate-100 text-slate-400',
            });
            detailParts.push(`${item.label}: ${sel || '—'}`);
        }
    }
    return { chips, detail: detailParts.join('\n') };
};

const ATTENDANCE_EVENT_STATUS_SORT_ORDER: Record<string, number> = {
    Ongoing: 0,
    Completed: 1
};

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
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(new Date(), 'HH:mm'),
      session: 'AM' as 'AM' | 'PM',
      status: 'Valid' as const
  });
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [showManualBlockedModal, setShowManualBlockedModal] = useState(false);
  const [manualBlockedMessage, setManualBlockedMessage] = useState('');
  const [selectedManualIds, setSelectedManualIds] = useState<number[]>([]);
  const [showBulkManualModal, setShowBulkManualModal] = useState(false);
  const [savingBulkManual, setSavingBulkManual] = useState(false);
  const [bulkManualError, setBulkManualError] = useState<string | null>(null);

  // Add Participant State
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({
      f_name: '',
      l_name: '',
      m_initial: '',
      suffix: '',
      full_name: '',
      email: '',
      role: 'Delegate',
      office: '',
      mobile_no: '',
      position: '',
      gender: '',
      age_group: '18-24',
      pwd: 'No',
      indigenous_people: 'No',
      needs_accommodation: false,
      accommodation_pax: 0,
      date_accommodation: [] as string[],
      participant_id: null as number | null,
      accept_photo_video: true,
      store_to_db: true,
      need_ca: false,
      giveaway_selections: {} as Record<string, string | boolean>
  });
  const [suggestions, setSuggestions] = useState<Participant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [logAttendanceOnRegister, setLogAttendanceOnRegister] = useState(false);

  // Affiliation State
  const [affiliationType, setAffiliationType] = useState<'Office' | 'LGU'>('Office');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [locations, setLocations] = useState<any[]>([]);
  const badgeRef = useRef<HTMLDivElement>(null);

  const provinces = Array.from(new Set(locations.map(l => l.province_huc))).sort();
  const cities = locations
      .filter(l => l.province_huc === selectedProvince && l.city_mun)
      .map(l => l.city_mun)
      .sort();

  const getEventDateRangeOptions = (start?: string, end?: string) => {
      if (!start) return [] as string[];

      try {
          const startDate = parseISO(start);
          const endDate = end ? parseISO(end) : startDate;
          if (startDate > endDate) {
              return [format(startDate, 'yyyy-MM-dd')];
          }

          return eachDayOfInterval({ start: startDate, end: endDate }).map((date) => format(date, 'yyyy-MM-dd'));
      } catch {
          return [start];
      }
  };

  const formatAccommodationDateLabel = (value: string) => {
      try {
          return format(parseISO(value), 'EEE, MMM d, yyyy');
      } catch {
          return value;
      }
  };

  const getSelectedEventAccommodationDates = (event?: Event | null) => {
      if (!event?.has_accommodation) return [] as string[];
      const savedDates = (event.dates_with_accom || []).filter(Boolean);
      return savedDates.length > 0 ? savedDates : getEventDateRangeOptions(event.start_date, event.end_date);
  };

  const getDefaultSessionForEvent = (event?: Event | null): 'AM' | 'PM' => {
      if (!event || event.session === 'All_Day') {
          return new Date().getHours() < 12 ? 'AM' : 'PM';
      }

      return event.session;
  };

  // True when today's date falls within the event's date range, i.e. the participant
  // is being registered on an actual day of the event.
  const isTodayEventDay = (event?: Event | null) => {
      if (!event) return false;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      return getEventDateRangeOptions(event.start_date, event.end_date).includes(todayStr);
  };

  // Attendance session to auto-log on registration: AM for All_Day / AM-only events, PM for PM-only events.
  const getRegistrationAttendanceSession = (event?: Event | null): 'AM' | 'PM' =>
      event?.session === 'PM' ? 'PM' : 'AM';

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
    const fetchAllEvents = async () => {
        let query = supabase
            .from('events')
            .select('*')
            .in('status', ['Ongoing', 'Completed'])
            .is('deleted_at', null)
            .order('start_date', { ascending: false });

        // Filter events by office for non-admins
        if (user?.role !== 'Admin' && user?.office_id) {
            query = query.eq('organize_by', user.office_id);
        }

        const { data } = await query;
        if (data && data.length > 0) {
            const sortedEvents = [...data].sort((a, b) => {
                const statusPriorityDiff =
                    (ATTENDANCE_EVENT_STATUS_SORT_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER) -
                    (ATTENDANCE_EVENT_STATUS_SORT_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER);

                if (statusPriorityDiff !== 0) {
                    return statusPriorityDiff;
                }

                const startDateA = new Date(a.start_date).getTime();
                const startDateB = new Date(b.start_date).getTime();

                if (!Number.isNaN(startDateA) && !Number.isNaN(startDateB) && startDateA !== startDateB) {
                    return startDateB - startDateA;
                }

                return a.event_name.localeCompare(b.event_name);
            });

            setEvents(sortedEvents);
            const defaultEvent = sortedEvents.find((event) => event.status === 'Ongoing') || sortedEvents[0];
            handleEventSelect(defaultEvent);
        } else {
            setEvents([]);
            setSelectedEventId(null);
            setSelectedEvent(null);
            setSelectedDate('');
            setEventDays([]);
            setLoading(false);
        }
    };
    
    const fetchLocations = async () => {
        const { data } = await supabase
            .from('ref_locations')
            .select('*')
            .order('province_huc', { ascending: true })
            .order('city_mun', { ascending: true });
        
        if (data) {
            setLocations(data);
        }
    };

    if (user) {
        fetchAllEvents();
        fetchLocations();
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
      setSelectedManualIds([]);

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
      if (event.session !== 'All_Day' && (filter === 'No PM' || filter === 'Complete Logs')) {
          setFilter('Show All');
      }
      if (!event.has_accommodation && filter === 'Accommodation') {
          setFilter('Show All');
      }
      setSelectedManualIds([]);
      
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
      
      setManualForm(prev => ({ ...prev, date: newDate, session: getDefaultSessionForEvent(event) }));
  };

  const fetchAttendance = async (eventId: number, dateStr: string) => {
    if (data.length === 0) setLoading(true); 
    
    try {
        const { data: eventParticipants, error: epError } = await supabase
            .from('event_participants')
            .select('participant_id, role, needs_accommodation, giveaway_selections, participants(*)')
            .eq('event_id', eventId);
        
        if (epError) throw epError;

        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('event_id', eventId);
            
        if (logsError) throw logsError;
            
        if (eventParticipants) {
            const rows = eventParticipants
                .filter((ep: any) => ep.participants !== null) 
                .map((ep: any) => {
                    const p = ep.participants as Participant;
                    const pLogs = logs?.filter(l => l.participant_id === p.participant_id) || [];
                    const daysLogs = pLogs.filter(l => l.attendance_date === dateStr);

                    const amLogs = daysLogs.filter(l => l.action_session === 'AM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));
                    const pmLogs = daysLogs.filter(l => l.action_session === 'PM').sort((a,b) => b.scan_time.localeCompare(a.scan_time));

                    return {
                        participant: p,
                        role: ep.role,
                        needs_accommodation: ep.needs_accommodation,
                        giveaway_selections: ep.giveaway_selections,
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

  const visibleSessions: Array<'AM' | 'PM'> =
      selectedEvent?.session === 'All_Day'
          ? ['AM', 'PM']
          : selectedEvent?.session
              ? [selectedEvent.session]
              : ['AM', 'PM'];
  const hasMultipleSessions = visibleSessions.length > 1;

  const filteredData = data.filter(row => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = row.participant.full_name?.toLowerCase().includes(query);
      const matchesOffice = row.participant.office?.toLowerCase().includes(query);
      if (!matchesName && !matchesOffice) return false;
    }
    
    const hasAM = !!row.amLog;
    const hasPM = !!row.pmLog;
    const isPresent = visibleSessions.some(session => session === 'AM' ? hasAM : hasPM);

    switch (filter) {
        case 'No Logs': return !isPresent;
        case 'Present': return isPresent;
        case 'No PM': return hasMultipleSessions && hasAM && !hasPM;
        case 'Complete Logs': return hasMultipleSessions && hasAM && hasPM;
        case 'Accommodation': return !!row.needs_accommodation;
        case 'Show All':
        default: return true;
    }
  });
  const filteredManualIds = filteredData.map(row => row.participant.participant_id);
  const allFilteredSelected = filteredManualIds.length > 0 && filteredManualIds.every(id => selectedManualIds.includes(id));
  const selectedManualRows = data.filter(row => selectedManualIds.includes(row.participant.participant_id));

  const handleRowClick = (p: Participant) => {
    setSelectedParticipant(p);
    setQrToken(p.participant_code);
  };

  const handleRefresh = () => {
    if (selectedEventId && selectedDate) {
        fetchAttendance(selectedEventId, selectedDate);
    }
  };

  const generateReport = () => {
      if (!selectedEvent || !selectedDate) return;

      // Group data by Office
      const groupedData = data.reduce((acc, row) => {
          const office = row.participant.office || 'N/A';
          if (!acc[office]) acc[office] = [];
          acc[office].push(row);
          return acc;
      }, {} as Record<string, AttendanceRow[]>);

      // Flatten grouped data into an array of objects for XLSX
      const exportData: any[] = [];
      
      Object.keys(groupedData).sort().forEach(office => {
          groupedData[office].forEach(row => {
              const exportRow: Record<string, string> = {
                  'Name': row.participant.full_name,
                  'Gender': row.participant.gender || 'N/A',
                  'Position': row.participant.position || 'N/A',
                  'Office': office,
                  'Mobile No': row.participant.mobile_no || 'N/A',
                  'Email': row.participant.email || 'N/A',
                  'Event Name': selectedEvent.title || selectedEvent.event_name,
                  'Role': row.role || 'Delegate',
                  'Needs Accomodation': row.needs_accommodation ? 'Yes' : 'No',
                  'Present': visibleSessions.some(session => session === 'AM' ? !!row.amLog : !!row.pmLog) ? 'Yes' : 'No'
              };

              if (visibleSessions.includes('AM')) {
                  exportRow['AM Time'] = row.amLog ? formatLogTime(row.amLog.time) : '';
              }
              if (visibleSessions.includes('PM')) {
                  exportRow['PM Time'] = row.pmLog ? formatLogTime(row.pmLog.time) : '';
              }

              exportData.push(exportRow);
          });
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
      
      XLSX.writeFile(workbook, `Attendance_Report_${selectedEvent.title || selectedEvent.event_name}_${selectedDate}.xlsx`);
  };

  const isSelectedDateInFuture = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const eventDate = new Date(selectedDate);
      eventDate.setHours(0, 0, 0, 0);

      return eventDate > today;
  };

  const toggleManualSelection = (participantId: number) => {
      setSelectedManualIds(prev =>
          prev.includes(participantId)
              ? prev.filter(id => id !== participantId)
              : [...prev, participantId]
      );
  };

  const toggleAllFilteredManualSelection = () => {
      setSelectedManualIds(prev => {
          if (allFilteredSelected) {
              return prev.filter(id => !filteredManualIds.includes(id));
          }

          return Array.from(new Set([...prev, ...filteredManualIds]));
      });
  };

  const openBulkManualModal = () => {
      if (selectedManualIds.length === 0) return;

      if (isSelectedDateInFuture()) {
          setManualBlockedMessage(
              'Manual attendance is not available yet because the selected event date has not started.'
          );
          setShowManualBlockedModal(true);
          return;
      }

      setBulkManualError(null);
      setManualForm({
          date: selectedDate || format(new Date(), 'yyyy-MM-dd'),
          time: format(new Date(), 'HH:mm'),
          session: getDefaultSessionForEvent(selectedEvent),
          status: 'Valid'
      });
      setShowBulkManualModal(true);
  };

  const saveManualAttendance = async (participantId: number, remarksLabel: string) => {
      if (!selectedEventId || !user) return;

      const localDate = new Date(`${manualForm.date}T${manualForm.time}:00`);
      const scanTimeStr = localDate.toISOString();
      const { data: existingLog } = await supabase
          .from('attendance_logs')
          .select('attendance_id')
          .eq('event_id', selectedEventId)
          .eq('participant_id', participantId)
          .eq('attendance_date', manualForm.date)
          .eq('action_session', manualForm.session)
          .eq('scan_status', 'Valid')
          .maybeSingle();

      if (existingLog) {
          const { error: updateError } = await supabase
              .from('attendance_logs')
              .update({
                  scan_time: scanTimeStr,
                  scan_status: manualForm.status,
                  remarks: `${remarksLabel} (Updated ${manualForm.session})`,
                  user_id: user.user_id
              })
              .eq('attendance_id', existingLog.attendance_id);

          if (updateError) throw updateError;
          return;
      }

      const { error: insertError } = await supabase.from('attendance_logs').insert({
          event_id: selectedEventId,
          participant_id: participantId,
          user_id: user.user_id,
          attendance_date: manualForm.date,
          scan_time: scanTimeStr,
          action_session: manualForm.session,
          scan_status: manualForm.status,
          remarks: remarksLabel,
          scanner_device: 'Manual Input'
      });

      if (insertError) throw insertError;
  };

  const openManualModal = (e: React.MouseEvent, p: Participant) => {
      e.stopPropagation();
      
      if (isSelectedDateInFuture()) {
          setManualBlockedMessage(
              'Manual attendance is not available yet because the selected event date has not started.'
          );
          setShowManualBlockedModal(true);
          return;
      }

      setManualParticipant(p);
      setManualForm({
          date: selectedDate || format(new Date(), 'yyyy-MM-dd'),
          time: format(new Date(), 'HH:mm'),
          session: getDefaultSessionForEvent(selectedEvent),
          status: 'Valid'
      });
      setShowManualModal(true);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!manualParticipant || !selectedEventId || !user) return;
      
      setSavingManual(true);
      setManualError(null);
      try {
          await saveManualAttendance(manualParticipant.participant_id, `Manual Entry (${manualForm.session})`);

          setShowManualModal(false);
          // fetchAttendance will be triggered by supabase real-time channel
      } catch (err: any) {
          if (err.code === '23505') {
              setManualError("Duplicate entry: This participant already has an attendance log for this session.");
          } else {
              setManualError(err.message || "An error occurred while saving attendance.");
          }
      } finally {
          setSavingManual(false);
      }
  };

  const handleBulkManualSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedEventId || !user || selectedManualIds.length === 0) return;

      setSavingBulkManual(true);
      setBulkManualError(null);

      try {
          for (const participantId of selectedManualIds) {
              await saveManualAttendance(participantId, `Bulk Manual Entry (${manualForm.session})`);
          }

          setShowBulkManualModal(false);
          setSelectedManualIds([]);
          toast.success(`Manual ${manualForm.session} attendance logged for ${selectedManualIds.length} participant${selectedManualIds.length === 1 ? '' : 's'}.`);
      } catch (err: any) {
          setBulkManualError(err.message || 'An error occurred while saving bulk attendance.');
      } finally {
          setSavingBulkManual(false);
      }
  };

  const formatLogTime = (timeStr: string) => {
      const d = new Date(timeStr.endsWith('Z') || timeStr.includes('+') ? timeStr : timeStr + 'Z');
      return format(d, 'h:mm a');
  };

  const handleSaveBadge = async () => {
      if (badgeRef.current && selectedParticipant) {
          try {
              const dataUrl = await toPng(badgeRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
              const link = document.createElement('a');
              link.download = `${selectedParticipant.full_name.replace(/\s+/g, '_')}_Badge.png`;
              link.href = dataUrl;
              link.click();
          } catch (err) {
              console.error('Error generating badge image:', err);
              toast.error('Failed to save badge image.');
          }
      }
  };

  const handleNameChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'f_name' | 'l_name') => {
    const val = e.target.value;
    setNewParticipant({ ...newParticipant, [field]: val, participant_id: null });
    
    if (val.length >= 2) {
        const { data } = await supabase
            .from('participants')
            .select('*')
            .or(`full_name.ilike.%${val}%,office.ilike.%${val}%`)
            .limit(5);
            
        if (data && data.length > 0) {
            setSuggestions(data);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    } else {
        setSuggestions([]);
        setShowSuggestions(false);
    }
  };

  const selectSuggestion = (p: Participant) => {
      let affType: 'Office' | 'LGU' = 'Office';
      let prov = '';
      let city = '';
      let locId = p.location_id || null;

      if (locId && locations.length > 0) {
          const loc = locations.find(l => l.location_id === locId);
          if (loc) {
              affType = 'LGU';
              prov = loc.province_huc;
              city = loc.city_mun || '';
          }
      }

      setAffiliationType(affType);
      setSelectedProvince(prov);
      setSelectedCity(city);

      setNewParticipant(prev => ({
          ...prev,
          f_name: p.f_name || '',
          l_name: p.l_name || '',
          m_initial: p.m_initial || '',
          suffix: p.suffix || '',
          full_name: p.full_name || '',
          email: p.email || '',
          office: p.office || '',
          mobile_no: p.mobile_no || '',
          position: p.position || '',
          gender: p.gender || '',
          age_group: p.age_group || '18-24',
          pwd: p.pwd || 'No',
          indigenous_people: p.indigenous_people || 'No',
          participant_id: p.participant_id
      }));
      setSuggestions([]);
      setShowSuggestions(false);
  };
  
  const toProperCase = (str: string) => {
    const lowerStr = str.toLowerCase();
    const parts = lowerStr.split('-');

    // Known Filipino/indigenous particle suffixes that shouldn't be capitalized
    const particles = ['a', 'an', 'om', 'ay', 'in', 'oy', 'on', 'ud'];

    return parts
      .map((part, index) => {
        // First part always capitalize, or if not a known particle
        if (index === 0 || !particles.includes(part)) {
          return part.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
        return part; // Keep known particles lowercase
      })
      .join('-');
  };

  const formatSuffix = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^[ivx]+$/i.test(trimmed)) return trimmed.toUpperCase();
    return toProperCase(trimmed);
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedEvent) return;

      const availableAccommodationDates = getSelectedEventAccommodationDates(selectedEvent);
      const normalizedAccommodationDates = selectedEvent.has_accommodation && newParticipant.needs_accommodation
          ? (() => {
                const selectedDates = (newParticipant.date_accommodation || []).filter((date) => availableAccommodationDates.includes(date));
                if (selectedDates.length > 0) return selectedDates;
                if (availableAccommodationDates.length === 1) return [availableAccommodationDates[0]];
                return [];
            })()
          : [];
      
      let finalLocationId = null;
      let finalOfficeName = newParticipant.office;

      if (affiliationType === 'LGU') {
          if (!selectedProvince) {
              toast.error("Please select a Province/HUC for LGU.");
              return;
          }
          
          if (selectedCity) {
              const loc = locations.find(l => l.province_huc === selectedProvince && l.city_mun === selectedCity);
              if (loc) {
                  finalLocationId = loc.location_id;
                  finalOfficeName = `LGU ${selectedCity}, ${selectedProvince}`;
              } else {
                  toast.error("Selected location is invalid.");
                  return;
              }
          } else {
              const loc = locations.find(l => l.province_huc === selectedProvince && !l.city_mun);
              if (loc) {
                  finalLocationId = loc.location_id;
              }
              if (selectedProvince.toLowerCase().includes('city')) {
                    finalOfficeName = `LGU ${selectedProvince}`;
              } else {
                    finalOfficeName = `Provincial Gov't of ${selectedProvince}`;
              }
          }
      } else {
          if (!newParticipant.office.trim()) {
              toast.error("Please enter your Office / Agency name.");
              return;
          }
      }

      if (newParticipant.gender !== 'Male' && newParticipant.gender !== 'Female') {
          toast.error("Please select a gender (Male or Female).");
          return;
      }

      if (newParticipant.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newParticipant.email)) {
          toast.error("Please enter a valid email address.");
          return;
      }

      if (newParticipant.mobile_no && !/^[0-9]{10,11}$/.test(newParticipant.mobile_no)) {
          toast.error("Please enter a valid mobile number (10 or 11 digits).");
          return;
      }

      const suffixTrimmed = newParticipant.suffix.trim().toLowerCase();
      if (suffixTrimmed && ['none', 'n/a', 'na'].includes(suffixTrimmed)) {
          toast.error("Not a valid Suffix.");
          return;
      }

      if (selectedEvent.has_accommodation && newParticipant.needs_accommodation && normalizedAccommodationDates.length === 0) {
          toast.error("Please select at least one accommodation date.");
          return;
      }

      // Giveaways: validate required selections and keep only answers for items this event defines.
      // When giveaway selection is closed, skip required checks — it can no longer be chosen.
      const giveawaysClosed = selectedEvent.giveaways_open === false;
      const eventGiveaways = selectedEvent.giveaways || [];
      const normalizedGiveawaySelections: Record<string, string | boolean> = {};
      for (const item of eventGiveaways) {
          const value = newParticipant.giveaway_selections[item.key];
          if (item.type === 'single-select') {
              if (item.required && !value && !giveawaysClosed) {
                  toast.error(`Please select ${item.label}.`);
                  return;
              }
              if (value) normalizedGiveawaySelections[item.key] = value;
          } else if (item.type === 'boolean') {
              normalizedGiveawaySelections[item.key] = !!value;
          }
      }

      setIsAddingParticipant(true);
      
      try {
          // 1. Check or Create Participant
          let participantId: number;
          
          if (newParticipant.participant_id) {
             participantId = newParticipant.participant_id;
             // Optional: Update participant details if changed
             await supabase.from('participants').update({
                f_name: toProperCase(newParticipant.f_name.trim()),
                l_name: toProperCase(newParticipant.l_name.trim()),
                m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim().toUpperCase(),
                suffix: newParticipant.suffix.trim() === '' ? null : formatSuffix(newParticipant.suffix.trim()),
                email: newParticipant.email || null,
                office: finalOfficeName,
                location_id: finalLocationId,
                mobile_no: newParticipant.mobile_no || null,
                position: newParticipant.position || 'N/A',
                gender: newParticipant.gender,
                age_group: newParticipant.age_group,
                pwd: newParticipant.pwd,
                indigenous_people: newParticipant.indigenous_people
             }).eq('participant_id', participantId);

          } else if (newParticipant.email) {
               const { data: existingUser } = await supabase
                .from('participants')
                .select('participant_id')
                .eq('email', newParticipant.email)
                .single();
                
               if (existingUser) {
                   participantId = existingUser.participant_id;
                   // Update details
                   await supabase.from('participants').update({
                        f_name: toProperCase(newParticipant.f_name.trim()),
                        l_name: toProperCase(newParticipant.l_name.trim()),
                        m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim().toUpperCase(),
                        suffix: newParticipant.suffix.trim() === '' ? null : formatSuffix(newParticipant.suffix.trim()),
                        office: finalOfficeName,
                        location_id: finalLocationId,
                        mobile_no: newParticipant.mobile_no || null,
                        position: newParticipant.position || 'N/A',
                        gender: newParticipant.gender,
                        age_group: newParticipant.age_group,
                        pwd: newParticipant.pwd,
                        indigenous_people: newParticipant.indigenous_people
                    }).eq('participant_id', participantId);
               } else {
                   // Create
                    const { data: newUser, error: createError } = await supabase
                    .from('participants')
                    .insert([{
                        f_name: toProperCase(newParticipant.f_name.trim()),
                        l_name: toProperCase(newParticipant.l_name.trim()),
                        m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim().toUpperCase(),
                        suffix: newParticipant.suffix.trim() === '' ? null : formatSuffix(newParticipant.suffix.trim()),
                        email: newParticipant.email,
                        office: finalOfficeName,
                        location_id: finalLocationId,
                        position: newParticipant.position || 'N/A',
                        mobile_no: newParticipant.mobile_no || null,
                        age_group: newParticipant.age_group,
                        pwd: newParticipant.pwd,
                        indigenous_people: newParticipant.indigenous_people
                    }])
                    .select()
                    .single();
                    if(createError) throw createError;
                    participantId = newUser.participant_id;
               }
          } else {
               // Create (No Email provided)
               const { data: newUser, error: createError } = await supabase
                .from('participants')
                .insert([{
                    f_name: toProperCase(newParticipant.f_name.trim()),
                    l_name: toProperCase(newParticipant.l_name.trim()),
                    m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim().toUpperCase(),
                    suffix: newParticipant.suffix.trim() === '' ? null : formatSuffix(newParticipant.suffix.trim()),
                    email: null,
                    office: finalOfficeName,
                    location_id: finalLocationId,
                    position: newParticipant.position || 'N/A',
                    gender: newParticipant.gender,
                    mobile_no: newParticipant.mobile_no || null,
                    age_group: newParticipant.age_group,
                    pwd: newParticipant.pwd,
                    indigenous_people: newParticipant.indigenous_people
                }])
                .select()
                .single();
                if(createError) throw createError;
                participantId = newUser.participant_id;
          }

          // 2. Register
          const { error: regError } = await supabase
            .from('event_participants')
            .insert({
                event_id: selectedEvent.event_id,
                participant_id: participantId,
                registration_status: 'Registered',
                role: newParticipant.role,
                needs_accommodation: newParticipant.needs_accommodation,
                accommodation_pax: newParticipant.needs_accommodation ? Math.max(1, newParticipant.accommodation_pax) : 0,
                date_accommodation: selectedEvent.has_accommodation && newParticipant.needs_accommodation ? normalizedAccommodationDates : null,
                accept_photo_video: newParticipant.accept_photo_video,
                store_to_db: newParticipant.store_to_db,
                need_ca: newParticipant.need_ca,
                giveaway_selections: normalizedGiveawaySelections
            });

          if (regError && regError.code !== '23505') throw regError;

          // 3. Optionally auto-log attendance when registering on the day of the event.
          // The logged-in user acts as the "scanner" and the device is recorded as Web.
          if (logAttendanceOnRegister && user && isTodayEventDay(selectedEvent)) {
              try {
                  const session = getRegistrationAttendanceSession(selectedEvent);
                  const attendanceDate = format(new Date(), 'yyyy-MM-dd');

                  const { data: existingLog } = await supabase
                    .from('attendance_logs')
                    .select('attendance_id')
                    .eq('event_id', selectedEvent.event_id)
                    .eq('participant_id', participantId)
                    .eq('attendance_date', attendanceDate)
                    .eq('action_session', session)
                    .eq('scan_status', 'Valid')
                    .maybeSingle();

                  if (!existingLog) {
                      const { error: attendanceError } = await supabase
                        .from('attendance_logs')
                        .insert({
                            event_id: selectedEvent.event_id,
                            participant_id: participantId,
                            user_id: user.user_id,
                            attendance_date: attendanceDate,
                            scan_time: new Date().toISOString(),
                            action_session: session,
                            scan_status: 'Valid',
                            remarks: `Auto-logged on registration (${session})`,
                            scanner_device: 'Web'
                        });

                      if (attendanceError) throw attendanceError;
                      toast.success(`${session} attendance logged for today.`);
                  } else {
                      toast.info(`${session} attendance was already logged for today.`);
                  }
              } catch (attendanceErr: any) {
                  // Registration already succeeded; surface attendance issue without failing the whole flow.
                  toast.error('Participant registered, but attendance logging failed: ' + attendanceErr.message);
              }
          }

          // Success
          setShowAddParticipantModal(false);
          setNewParticipant({
              f_name: '',
              l_name: '',
              m_initial: '',
              suffix: '',
              full_name: '',
              email: '',
              role: 'Delegate',
              office: '',
              mobile_no: '',
              position: '',
              gender: '',
              age_group: '18-24',
              pwd: 'No',
              indigenous_people: 'No',
              needs_accommodation: false,
              accommodation_pax: 0,
              date_accommodation: [],
              participant_id: null,
              accept_photo_video: true,
              store_to_db: true,
              need_ca: false,
              giveaway_selections: {}
          });
          setSuggestions([]);
          setLogAttendanceOnRegister(false);
          // fetchAttendance will be triggered by supabase real-time channel

      } catch (err: any) {
          toast.error("Error adding participant: " + err.message);
      } finally {
          setIsAddingParticipant(false);
      }
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
  const presentCount = data.filter(r => visibleSessions.some(session => session === 'AM' ? !!r.amLog : !!r.pmLog)).length;
  const notPresentCount = data.filter(r => !visibleSessions.some(session => session === 'AM' ? !!r.amLog : !!r.pmLog)).length;
  const noPmCount = hasMultipleSessions ? data.filter(r => r.amLog && !r.pmLog).length : 0;
  const completeLogsCount = hasMultipleSessions ? data.filter(r => r.amLog && r.pmLog).length : 0;
  const hasAccommodationFilter = !!selectedEvent?.has_accommodation;
  const accommodationCount = hasAccommodationFilter ? data.filter(r => r.needs_accommodation).length : 0;
  const statsGridClassName = hasMultipleSessions
      ? hasAccommodationFilter
          ? 'grid-cols-6 xl:[grid-template-columns:repeat(6,minmax(0,1fr))]'
          : 'grid-cols-5 xl:[grid-template-columns:repeat(5,minmax(0,1fr))]'
      : hasAccommodationFilter
          ? 'grid-cols-4 sm:[grid-template-columns:repeat(4,minmax(0,1fr))]'
          : 'sm:[grid-template-columns:repeat(3,minmax(0,1fr))]';

  return (
    <div className="attendance-page -mt-4 -mb-6 h-[calc(100%+2.5rem)] min-h-0 flex flex-col gap-2 overflow-y-auto md:-mt-6 md:-mb-8 md:h-[calc(100%+3.5rem)] lg:overflow-visible">
      <div className="attendance-toolbar">
        <div className="flex w-full flex-col gap-3 sm:gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3 xl:flex-nowrap xl:gap-4">
            <div className="relative w-full sm:mx-auto sm:max-w-[32rem] lg:mx-0 lg:max-w-[32rem] lg:flex-[1.25] xl:max-w-[36rem]" ref={dropdownRef}>
                <div 
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm transition-colors hover:border-indigo-400 sm:px-4 sm:py-2 lg:py-2"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Calendar className="text-slate-400 shrink-0" size={16} />
                        <span className={`min-w-0 flex-1 truncate text-[11px] leading-snug sm:text-xs lg:text-sm ${!selectedEvent ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                            {selectedEvent ? selectedEvent.event_name : "-- Select Event --"}
                        </span>
                    </div>
                    <ChevronDown className={`text-slate-400 transition-transform shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} size={14} />
                </div>

                {isDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-100">
                        <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search event..."
                                    value={eventSearchTerm}
                                    onChange={(e) => setEventSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-14 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                                {eventSearchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setEventSearchTerm('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="max-h-[30rem] overflow-y-auto">
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

            {/* Mobile: days + search + actions share one row. Desktop: `lg:contents` dissolves
                this wrapper so the day selector and search group are direct toolbar flex children. */}
            <div className="flex w-full items-stretch gap-2 lg:contents">
            {eventDays.length > 1 && (
                <div className="max-w-[42%] shrink-0 rounded-lg border border-slate-200 bg-white p-0 lg:max-w-none">
                    <div className="flex gap-0.5 overflow-x-auto no-scrollbar">
                        {eventDays.map((day, idx) => {
                            const dStr = format(day, 'yyyy-MM-dd');
                            const isSelected = selectedDate === dStr;
                            return (
                                <button
                                    key={dStr}
                                    onClick={() => setSelectedDate(dStr)}
                                    className={`flex w-[2.75rem] shrink-0 flex-col items-center justify-center rounded-md px-0.5 py-1 text-[8px] font-bold leading-tight whitespace-nowrap transition-all md:w-[3.1rem] md:text-[9px] lg:w-auto lg:px-3 lg:py-1.5 lg:text-xs
                                        ${isSelected 
                                            ? 'bg-indigo-600 text-white shadow-sm' 
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                        }`}
                                >
                                    <span>Day {idx + 1}</span>
                                    <span className={`text-[6px] font-normal sm:text-[6px] md:text-[7px] lg:text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                        {format(day, 'MMM d')}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 lg:ml-auto lg:w-[24rem] lg:max-w-none lg:flex-none xl:w-[28rem]">
                <div className="relative min-w-0 w-full">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Search size={18} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search by name or office..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full min-w-0 rounded-lg border border-slate-300 bg-white py-1.5 pl-10 pr-12 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:py-2 sm:text-sm lg:py-2"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:contents shrink-0">
                    <button 
                        onClick={generateReport}
                        disabled={!selectedEvent || !selectedDate || data.length === 0}
                        type="button"
                        aria-label="Export attendance"
                        title="Export attendance"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:h-10 sm:w-10 lg:h-10 lg:w-auto lg:gap-2 lg:px-4 xl:px-5"
                    >
                        <Download size={16} />
                        <span className="hidden lg:inline text-sm">Export</span>
                    </button>
                    <button 
                        onClick={() => setShowAddParticipantModal(true)}
                        disabled={!selectedEvent}
                        type="button"
                        aria-label="Add participant"
                        title="Add participant"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:h-10 sm:w-10 lg:h-10 lg:w-auto lg:gap-2 lg:px-4 xl:px-5"
                    >
                        <UserPlus size={16} />
                        <span className="hidden lg:inline text-sm">Add</span>
                    </button>
                </div>
            </div>
            </div>
        </div>
      </div>

      {/* Stats Cards as Filters */}
      <div className="attendance-stats w-full -mt-1.5 md:mt-4">
          <div
            className={`grid w-full gap-1 sm:gap-3 lg:gap-4 ${statsGridClassName}`}
          >
          <button 
            onClick={() => setFilter('Show All')}
            className={`attendance-stat-card min-w-0 min-h-[44px] sm:min-h-[56px] p-1 sm:p-2.5 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                ${filter === 'Show All' ? 'ring-2 ring-slate-400 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-slate-300'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-0.5 w-full">
                  <p className="text-[7px] sm:text-xs font-semibold text-slate-500 uppercase leading-tight">Total</p>
                  <div className={`rounded-md p-0.5 sm:p-1 ${filter === 'Show All' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>
                    <Users size={10} className="sm:h-3.5 sm:w-3.5" />
                  </div>
              </div>
              <p className="attendance-stat-value text-[11px] sm:text-base font-bold text-slate-800">{totalParticipants}</p>
          </button>

          <button 
            onClick={() => setFilter('Present')}
            className={`attendance-stat-card min-w-0 min-h-[44px] sm:min-h-[56px] p-1 sm:p-2.5 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                ${filter === 'Present' ? 'ring-2 ring-green-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-green-200'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-0.5 w-full">
                  <p className="text-[7px] sm:text-xs font-semibold text-slate-500 uppercase leading-tight">Present</p>
                  <div className={`rounded-md p-0.5 sm:p-1 ${filter === 'Present' ? 'bg-green-200 text-green-700' : 'bg-green-100 text-green-600'}`}>
                    <UserCheck size={10} className="sm:h-3.5 sm:w-3.5" />
                  </div>
              </div>
              <p className="attendance-stat-value text-[11px] sm:text-base font-bold text-green-600">{presentCount}</p>
          </button>

          <button 
            onClick={() => setFilter('No Logs')}
            className={`attendance-stat-card min-w-0 min-h-[44px] sm:min-h-[56px] p-1 sm:p-2.5 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                ${filter === 'No Logs' ? 'ring-2 ring-red-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-red-200'}
                bg-white
            `}
          >
              <div className="flex justify-between items-start mb-0.5 w-full">
                  <p className="text-[7px] sm:text-xs font-semibold text-slate-500 uppercase leading-tight">
                    <span className="sm:hidden">Absent</span>
                    <span className="hidden sm:inline">Not Present</span>
                  </p>
                  <div className={`rounded-md p-0.5 sm:p-1 ${filter === 'No Logs' ? 'bg-red-200 text-red-700' : 'bg-red-100 text-red-600'}`}>
                    <UserX size={10} className="sm:h-3.5 sm:w-3.5" />
                  </div>
              </div>
              <p className="attendance-stat-value text-[11px] sm:text-base font-bold text-red-600">{notPresentCount}</p>
          </button>

          {hasMultipleSessions && (
            <button 
              onClick={() => setFilter('No PM')}
              className={`attendance-stat-card min-w-0 min-h-[44px] sm:min-h-[56px] p-1 sm:p-2.5 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                  ${filter === 'No PM' ? 'ring-2 ring-amber-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-amber-200'}
                  bg-white
              `}
            >
                <div className="flex justify-between items-start mb-0.5 w-full">
                    <p className="text-[7px] sm:text-xs font-semibold text-slate-500 uppercase leading-tight">No PM</p>
                    <div className={`rounded-md p-0.5 sm:p-1 ${filter === 'No PM' ? 'bg-amber-200 text-amber-700' : 'bg-amber-100 text-amber-600'}`}>
                      <AlertCircle size={10} className="sm:h-3.5 sm:w-3.5" />
                    </div>
                </div>
                <p className="attendance-stat-value text-[11px] sm:text-base font-bold text-amber-600">{noPmCount}</p>
            </button>
          )}

          {hasMultipleSessions && (
            <button 
              onClick={() => setFilter('Complete Logs')}
              className={`attendance-stat-card min-w-0 min-h-[44px] sm:min-h-[56px] p-1 sm:p-2.5 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                  ${filter === 'Complete Logs' ? 'ring-2 ring-indigo-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-indigo-200'}
                  bg-white
              `}
            >
                <div className="flex justify-between items-start mb-0.5 w-full">
                    <p className="text-[7px] sm:text-xs font-semibold text-slate-500 uppercase leading-tight">Complete</p>
                    <div className={`rounded-md p-0.5 sm:p-1 ${filter === 'Complete Logs' ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-100 text-indigo-600'}`}>
                      <CheckCircle size={10} className="sm:h-3.5 sm:w-3.5" />
                    </div>
                </div>
                <p className="attendance-stat-value text-[11px] sm:text-base font-bold text-indigo-600">{completeLogsCount}</p>
            </button>
          )}

          {hasAccommodationFilter && (
            <button
              onClick={() => setFilter('Accommodation')}
              className={`attendance-stat-card min-w-0 min-h-[44px] sm:min-h-[56px] p-1 sm:p-2.5 rounded-xl shadow-sm border flex flex-col justify-between text-left transition-all duration-200
                  ${filter === 'Accommodation' ? 'ring-2 ring-sky-500 border-transparent transform scale-[1.02]' : 'bg-white border-slate-100 hover:border-sky-200'}
                  bg-white
              `}
            >
                <div className="flex justify-between items-start mb-0.5 w-full">
                    <p className="text-[7px] sm:text-xs font-semibold text-slate-500 uppercase leading-tight">
                      <span className="sm:hidden">Accom</span>
                      <span className="hidden sm:inline">Accommodation</span>
                    </p>
                    <div className={`rounded-md p-0.5 sm:p-1 ${filter === 'Accommodation' ? 'bg-purple-100 text-[#9333ea]' : 'bg-purple-50 text-[#9333ea]'}`}>
                      <Bed size={10} className="sm:h-3.5 sm:w-3.5" />
                    </div>
                </div>
                <p className="attendance-stat-value text-[11px] sm:text-base font-bold text-[#9333ea]">{accommodationCount}</p>
            </button>
          )}
          </div>
      </div>

      {loading && data.length === 0 ? (
        <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="attendance-table bg-white rounded-xl shadow-sm border border-slate-100 overflow-visible lg:overflow-hidden flex-none lg:flex-1 min-h-0 flex flex-col">
            <div className="flex flex-col gap-2 border-b border-slate-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4 lg:px-6">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        disabled={filteredManualIds.length === 0}
                        onChange={toggleAllFilteredManualSelection}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                    Select visible
                </label>
                <div className="flex items-center gap-2">
                    {filter !== 'Show All' && (
                        <button
                            type="button"
                            onClick={() => setFilter('Show All')}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700"
                        >
                            Clear Filter
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={openBulkManualModal}
                        disabled={selectedManualIds.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        <Clock size={14} />
                        Bulk Manual ({selectedManualIds.length})
                    </button>
                </div>
            </div>
            
            <div className="hidden lg:block flex-1 min-h-0 overflow-auto">
                <table className="datatable w-full table-fixed text-[13px] lg:text-sm text-left">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                            <th className="px-5 py-1.5 lg:px-6 lg:py-1.5 w-14 bg-slate-50 text-center">
                                <input
                                    type="checkbox"
                                    checked={allFilteredSelected}
                                    disabled={filteredManualIds.length === 0}
                                    onChange={toggleAllFilteredManualSelection}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                            </th>
                            <th className="px-5 py-1.5 lg:px-6 lg:py-1.5 w-14 bg-slate-50">#</th>
                            <th className="px-5 py-1.5 lg:px-6 lg:py-1.5 w-[28%] bg-slate-50">Name</th>
                            <th className="px-5 py-1.5 lg:px-6 lg:py-1.5 w-[18%] bg-slate-50">Position</th>
                            <th className="px-5 py-1.5 lg:px-6 lg:py-1.5 w-[16%] bg-slate-50">Office</th>
                            {visibleSessions.map((session) => (
                                <th key={session} className="px-4 py-1.5 lg:px-5 lg:py-1.5 w-[112px] text-center bg-slate-50">
                                    {session} Time
                                </th>
                            ))}
                            <th className="px-4 py-1.5 lg:px-5 lg:py-1.5 w-[84px] text-center bg-slate-50">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredData.map((row, index) => (
                            <tr 
                                key={row.participant.participant_id} 
                                onClick={() => handleRowClick(row.participant)}
                                className="hover:bg-indigo-50 cursor-pointer transition-colors group"
                            >
                                <td className="px-5 py-1.5 lg:px-6 lg:py-1.5 text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedManualIds.includes(row.participant.participant_id)}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => toggleManualSelection(row.participant.participant_id)}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                </td>
                                <td className="px-5 py-1.5 lg:px-6 lg:py-1.5 text-slate-500 font-mono text-xs lg:text-sm">{index + 1}</td>
                                <td className="px-5 py-1.5 lg:px-6 lg:py-1.5 font-medium text-slate-800 group-hover:text-indigo-600">
                                    <div className="flex items-start gap-1.5 whitespace-normal break-words leading-snug">
                                        <span>{row.participant.full_name}</span>
                                        {row.needs_accommodation && (
                                            <Bed
                                                size={13}
                                                className="mt-0.5 shrink-0 text-[#9333ea]"
                                                aria-label="Needs accommodation"
                                            />
                                        )}
                                        {(() => {
                                            const g = summarizeGiveaways(selectedEvent?.giveaways, row.giveaway_selections);
                                            if (!g) return null;
                                            return (
                                                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1" title={g.detail}>
                                                    <Gift size={11} className="shrink-0 text-pink-600" />
                                                    {g.chips.map((c) => (
                                                        <span key={c.key} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${c.className}`}>
                                                            {c.text}
                                                        </span>
                                                    ))}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </td>
                                <td className="px-5 py-1.5 lg:px-6 lg:py-1.5 text-slate-600">
                                    <div className="whitespace-normal break-words leading-snug">
                                        {row.participant.position}
                                    </div>
                                </td>
                                <td className="px-5 py-1.5 lg:px-6 lg:py-1.5 text-slate-600">
                                    <div className="whitespace-normal break-words leading-snug">
                                        {row.participant.office}
                                    </div>
                                </td>
                                {visibleSessions.map((session) => {
                                    const sessionLog = session === 'AM' ? row.amLog : row.pmLog;
                                    const badgeClassName = session === 'AM'
                                        ? 'inline-flex min-w-[78px] items-center justify-center whitespace-nowrap bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold'
                                        : 'inline-flex min-w-[78px] items-center justify-center whitespace-nowrap bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-semibold';

                                    return (
                                        <td key={session} className="px-4 py-1.5 lg:px-5 lg:py-1.5 text-center">
                                            {sessionLog ? (
                                                <span className={badgeClassName}>
                                                    {formatLogTime(sessionLog.time)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="px-4 py-1.5 lg:px-5 lg:py-1.5 text-center">
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
                                <td colSpan={6 + visibleSessions.length} className="text-center py-12 text-slate-400">
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

            <div className="overflow-visible p-3 sm:p-4 lg:hidden">
                {filteredData.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
                        {events.length === 0 ? (
                            <div className="flex flex-col items-center">
                                <Calendar className="w-10 h-10 mb-2 opacity-20" />
                                <p>No events found.</p>
                            </div>
                        ) : (
                            <p>No participants found matching "{filter}"</p>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        {filteredData.map((row) => (
                            <div
                                key={row.participant.participant_id}
                                onClick={() => handleRowClick(row.participant)}
                                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:scale-[0.99] transition-transform sm:p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedManualIds.includes(row.participant.participant_id)}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => toggleManualSelection(row.participant.participant_id)}
                                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        aria-label={`Select ${row.participant.full_name}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <h3 className="flex flex-wrap items-start gap-1.5 text-[13px] font-semibold leading-tight text-slate-800 sm:text-sm">
                                            <span className="min-w-0 break-words">{row.participant.full_name}</span>
                                            {row.needs_accommodation && (
                                                <Bed
                                                    size={13}
                                                    className="mt-0.5 shrink-0 text-[#9333ea]"
                                                    aria-label="Needs accommodation"
                                                />
                                            )}
                                            {(() => {
                                                const g = summarizeGiveaways(selectedEvent?.giveaways, row.giveaway_selections);
                                                if (!g) return null;
                                                return (
                                                    <span className="inline-flex shrink-0 items-center gap-1" title={g.detail}>
                                                        <Gift size={11} className="shrink-0 text-pink-600" />
                                                        {g.chips.map((c) => (
                                                            <span key={c.key} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${c.className}`}>
                                                                {c.text}
                                                            </span>
                                                        ))}
                                                    </span>
                                                );
                                            })()}
                                        </h3>
                                    </div>
                                    <button
                                        onClick={(e) => openManualModal(e, row.participant)}
                                        className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                                        title="Manual Log Entry"
                                    >
                                        <PlusCircle size={18} />
                                    </button>
                                </div>

                                <div className={`mt-2.5 grid gap-2 ${hasMultipleSessions ? 'grid-cols-2' : 'grid-cols-1'} sm:mt-3`}>
                                    {visibleSessions.map((session) => {
                                        const sessionLog = session === 'AM' ? row.amLog : row.pmLog;
                                        const valueClassName = session === 'AM'
                                            ? 'text-green-700'
                                            : 'text-indigo-700';

                                        return (
                                            <div key={session} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                        {session} Time
                                                    </span>
                                                    <span className={`text-sm font-semibold ${sessionLog ? valueClassName : 'text-slate-300'}`}>
                                                        {sessionLog ? formatLogTime(sessionLog.time) : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Add Participant Modal */}
      {showAddParticipantModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddParticipantModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 relative z-10 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <UserPlus size={20} className="text-indigo-600" />
                        Add Participant
                    </h3>
                    <button onClick={() => setShowAddParticipantModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                <div className="max-w-2xl mx-auto w-full">
                    <form onSubmit={handleAddParticipant} className="space-y-10">
                        {/* SECTION: Personal Information */}
                        <div className="space-y-6">
                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Personal Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                            <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                            <input 
                                required
                                type="text"
                                placeholder="First Name"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                value={newParticipant.f_name}
                                onChange={(e) => handleNameChange(e, 'f_name')}
                                onFocus={() => { if(newParticipant.f_name.length >= 2 && suggestions.length > 0) setShowSuggestions(true); }}
                                onBlur={(e) => {
                                    setNewParticipant({ ...newParticipant, f_name: toProperCase(e.target.value) });
                                    setTimeout(() => setShowSuggestions(false), 200);
                                }}
                                autoComplete="off"
                            />
                             {showSuggestions && suggestions.length > 0 && (
                                <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                    {suggestions.map((p) => (
                                        <li 
                                            key={p.participant_id}
                                            onClick={() => selectSuggestion(p)}
                                            className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group"
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="font-medium text-slate-800 group-hover:text-indigo-700">{p.full_name}</div>
                                                <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Select</span>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">{p.email} • {p.office}</div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                            <input 
                                required
                                type="text"
                                placeholder="Last Name"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                value={newParticipant.l_name}
                                onChange={(e) => handleNameChange(e, 'l_name')}
                                onBlur={(e) => setNewParticipant({ ...newParticipant, l_name: toProperCase(e.target.value) })}
                                autoComplete="off"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Middle Initial</label>
                            <input 
                                type="text"
                                maxLength={1}
                                placeholder="e.g. A"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                value={newParticipant.m_initial}
                                onChange={e => setNewParticipant({...newParticipant, m_initial: e.target.value.toUpperCase()})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Suffix</label>
                            <input 
                                type="text"
                                placeholder="e.g. Jr"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                value={newParticipant.suffix}
                                onChange={e => setNewParticipant({...newParticipant, suffix: e.target.value})}
                                onBlur={e => setNewParticipant({...newParticipant, suffix: formatSuffix(e.target.value)})}
                            />
                        </div>
                    </div>
                        </div>

                        {/* SECTION: Contact & Professional */}
                        <div className="space-y-6">
                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Contact & Professional</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                                    <input 
                                        type="email"
                                        placeholder="email@example.com"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={newParticipant.email}
                                        onChange={e => setNewParticipant({...newParticipant, email: e.target.value})}
                                        pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                                        title="Please enter a valid email address"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mobile No.</label>
                                    <input 
                                        type="tel"
                                        placeholder="09123456789"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={newParticipant.mobile_no}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            if (val.length <= 11) {
                                                setNewParticipant({...newParticipant, mobile_no: val});
                                            }
                                        }}
                                        pattern="[0-9]{10,11}"
                                        title="Mobile number must be 10 or 11 digits"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Position / Job Title</label>
                                <input 
                                    type="text"
                                    placeholder="e.g. Regional Director, Administrative Officer"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                    value={newParticipant.position}
                                    onChange={e => setNewParticipant({...newParticipant, position: e.target.value})}
                                />
                            </div>
                    
                            <div className="pt-1">
                         <label className="block text-sm font-medium text-slate-700 mb-2">Affiliation Type</label>
                         <div className="flex gap-4 mb-4">
                            <label className={`flex-1 cursor-pointer border rounded-lg p-2.5 flex items-center gap-2 transition-all ${affiliationType === 'Office' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                <input 
                                    type="radio" 
                                    className="hidden" 
                                    checked={affiliationType === 'Office'} 
                                    onChange={() => setAffiliationType('Office')}
                                />
                                <Building size={18} />
                                <span className="font-medium text-sm">NGA / Office</span>
                            </label>
                            <label className={`flex-1 cursor-pointer border rounded-lg p-2.5 flex items-center gap-2 transition-all ${affiliationType === 'LGU' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                <input 
                                    type="radio" 
                                    className="hidden" 
                                    checked={affiliationType === 'LGU'} 
                                    onChange={() => setAffiliationType('LGU')}
                                />
                                <Landmark size={18} />
                                <span className="font-medium text-sm">LGU</span>
                            </label>
                         </div>

                         {affiliationType === 'Office' ? (
                            <div className="animate-in fade-in zoom-in-95 duration-200">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Office / Agency Name</label>
                                <input 
                                    required={affiliationType === 'Office'}
                                    type="text"
                                    placeholder="e.g. DILG Regional Office 10"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                    value={newParticipant.office}
                                    onChange={e => setNewParticipant({...newParticipant, office: e.target.value})}
                                />
                            </div>
                         ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Province / HUC</label>
                                    <select 
                                        required={affiliationType === 'LGU'}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                        value={selectedProvince}
                                        onChange={e => {
                                            setSelectedProvince(e.target.value);
                                            setSelectedCity('');
                                            const officeName = e.target.value.toLowerCase().includes('city') ? `LGU ${e.target.value}` : `Provincial Gov't of ${e.target.value}`;
                                            setNewParticipant({...newParticipant, office: officeName});
                                        }}
                                    >
                                        <option value="">-- Select Province --</option>
                                        {provinces.map(prov => (
                                            <option key={prov} value={prov}>{prov}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">City / Municipality</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
                                        value={selectedCity}
                                        onChange={e => {
                                            setSelectedCity(e.target.value);
                                            setNewParticipant({...newParticipant, office: `LGU ${e.target.value}, ${selectedProvince}`});
                                        }}
                                        disabled={!selectedProvince}
                                    >
                                        <option value="">-- Select City/Mun --</option>
                                        {cities.map(city => (
                                            <option key={city} value={city}>{city}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                         )}
                    </div>
                        </div>
                    
                        {/* SECTION: Event Options & Demographics */}
                        <div className="space-y-6">
                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Event & Demographics</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Event Role</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                        value={newParticipant.role}
                                        onChange={e => setNewParticipant({...newParticipant, role: e.target.value as any})}
                                    >
                                        <option value="Delegate">Delegate</option>
                                        <option value="Speaker">Speaker</option>
                                        <option value="Secretariat">Secretariat</option>
                                        <option value="Guest">Guest</option>
                                        <option value="VIP">VIP</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                        value={newParticipant.gender}
                                        onChange={e => setNewParticipant({...newParticipant, gender: e.target.value})}
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Age Group</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                        value={newParticipant.age_group}
                                        onChange={e => setNewParticipant({...newParticipant, age_group: e.target.value})}
                                    >
                                        <option value="18-24">18-24</option>
                                        <option value="25-34">25-34</option>
                                        <option value="35-44">35-44</option>
                                        <option value="45-54">45-54</option>
                                        <option value="55-65">55-65</option>
                                        <option value="65+">65+</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">PWD</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                        value={newParticipant.pwd}
                                        onChange={e => setNewParticipant({...newParticipant, pwd: e.target.value})}
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Indigenous People</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                    value={newParticipant.indigenous_people}
                                    onChange={e => setNewParticipant({...newParticipant, indigenous_people: e.target.value})}
                                >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                </select>
                            </div>
                        </div>

                    {selectedEvent?.has_accommodation && (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                    checked={newParticipant.needs_accommodation}
                                    onChange={e => {
                                        const availableDates = getSelectedEventAccommodationDates(selectedEvent);
                                        const nextDates = e.target.checked && availableDates.length === 1 ? [availableDates[0]] : [];
                                        setNewParticipant({
                                            ...newParticipant,
                                            needs_accommodation: e.target.checked,
                                            accommodation_pax: e.target.checked ? 1 : 0,
                                            date_accommodation: nextDates
                                        });
                                    }}
                                />
                                <span className="text-sm font-medium text-slate-700">Needs Accommodation</span>
                            </label>
                            {newParticipant.needs_accommodation && getSelectedEventAccommodationDates(selectedEvent).length === 1 && (
                                <p className="mt-2 text-xs text-slate-500">
                                    Accommodation date is set automatically to {formatAccommodationDateLabel(getSelectedEventAccommodationDates(selectedEvent)[0])}.
                                </p>
                            )}
                            {newParticipant.needs_accommodation && getSelectedEventAccommodationDates(selectedEvent).length > 1 && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Select Accommodation Dates</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {getSelectedEventAccommodationDates(selectedEvent).map((date) => {
                                            const isChecked = newParticipant.date_accommodation.includes(date);
                                            return (
                                                <label
                                                    key={date}
                                                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                                        isChecked ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => setNewParticipant((prev) => {
                                                            const selectedDates = prev.date_accommodation.includes(date)
                                                                ? prev.date_accommodation.filter((value) => value !== date)
                                                                : [...prev.date_accommodation, date];
                                                            return { ...prev, date_accommodation: selectedDates };
                                                        })}
                                                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm font-medium">{formatAccommodationDateLabel(date)}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Giveaways (Conditional, separate from CA) */}
                    {(selectedEvent?.giveaways && selectedEvent.giveaways.length > 0) && (
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 space-y-3">
                            <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wider flex items-center gap-2">
                                <Gift size={14}/> Giveaways
                            </h4>
                            {selectedEvent.giveaways_open === false && (
                                <p className="rounded-lg bg-purple-100 px-3 py-2 text-xs font-medium text-purple-800">
                                    Giveaway selection is closed for this event.
                                </p>
                            )}
                            {selectedEvent.giveaways.map((item) => {
                                const giveawaysClosed = selectedEvent.giveaways_open === false;
                                return (
                                <div key={item.key} className={giveawaysClosed ? 'opacity-60' : ''}>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        {item.label}
                                        {item.required && item.type === 'single-select' && !giveawaysClosed && <span className="text-red-500"> *</span>}
                                    </label>
                                    {item.type === 'single-select' ? (
                                        <select
                                            disabled={giveawaysClosed}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                                            value={(newParticipant.giveaway_selections[item.key] as string) || ''}
                                            onChange={(e) => setNewParticipant({ ...newParticipant, giveaway_selections: { ...newParticipant.giveaway_selections, [item.key]: e.target.value } })}
                                        >
                                            <option value="">-- Select --</option>
                                            {(item.options || []).map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <label className={`flex items-center gap-2 ${giveawaysClosed ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <input
                                                type="checkbox"
                                                disabled={giveawaysClosed}
                                                className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 disabled:cursor-not-allowed"
                                                checked={!!newParticipant.giveaway_selections[item.key]}
                                                onChange={(e) => setNewParticipant({ ...newParticipant, giveaway_selections: { ...newParticipant.giveaway_selections, [item.key]: e.target.checked } })}
                                            />
                                            <span className="text-sm text-slate-700">Yes</span>
                                        </label>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Certificate of Appearance */}
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                checked={newParticipant.need_ca}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewParticipant({ ...newParticipant, need_ca: e.target.checked })}
                            />
                            <span className="text-sm font-medium text-slate-700">Needs Certificate of Appearance (CA)</span>
                        </label>
                    </div>

                    {/* Data Privacy Consent */}
                    <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-lg border border-slate-100 mt-4">


                        <div className="text-xs font-bold text-slate-700 mt-2">Consent:</div>
                        
                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="modal-accept-photo-video"
                                    type="checkbox"
                                    checked={newParticipant.accept_photo_video}
                                    onChange={(e) => setNewParticipant({...newParticipant, accept_photo_video: e.target.checked})}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="modal-accept-photo-video" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                He/She consents to the capture of his/her photo, video, and audio for use in DILG publications.
                            </label>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="modal-store-to-db"
                                    type="checkbox"
                                    checked={newParticipant.store_to_db}
                                    onChange={(e) => setNewParticipant({...newParticipant, store_to_db: e.target.checked})}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="modal-store-to-db" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                He/She consents to the storage of his/her data in the organizer’s database for future document processing.
                            </label>
                        </div>
                    </div>

                    {isTodayEventDay(selectedEvent) && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                            <div className="flex items-center h-5">
                                <input
                                    id="modal-log-attendance"
                                    type="checkbox"
                                    checked={logAttendanceOnRegister}
                                    onChange={(e) => setLogAttendanceOnRegister(e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="modal-log-attendance" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                Log <span className="font-semibold text-indigo-700">{getRegistrationAttendanceSession(selectedEvent)}</span> attendance for today ({format(new Date(), 'MMM d, yyyy')}) upon registration.
                            </label>
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isAddingParticipant}
                            className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-all flex justify-center items-center gap-2"
                        >
                            {isAddingParticipant ? <Loader2 className="animate-spin" size={18} /> : 'Add to Event'}
                        </button>
                    </div>
                </form>
                </div>
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
                    {manualError && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg border border-red-100 flex items-start gap-2 text-sm">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <p>{manualError}</p>
                        </div>
                    )}
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
                                disabled
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                            />
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
                                {visibleSessions.map((session) => (
                                    <option key={session} value={session}>{session}</option>
                                ))}
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

      {showBulkManualModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowBulkManualModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Clock size={20} /> Bulk Manual Attendance
                    </h3>
                    <button onClick={() => setShowBulkManualModal(false)} className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleBulkManualSubmit} className="p-6 space-y-4">
                    {bulkManualError && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg border border-red-100 flex items-start gap-2 text-sm">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <p>{bulkManualError}</p>
                        </div>
                    )}
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                        <p className="text-xs text-indigo-500 uppercase font-bold tracking-wider mb-1">Selected Participants</p>
                        <p className="font-bold text-slate-800">{selectedManualRows.length} participant{selectedManualRows.length === 1 ? '' : 's'}</p>
                        <div className="mt-2 max-h-24 overflow-y-auto text-xs text-slate-600">
                            {selectedManualRows.slice(0, 6).map(row => (
                                <p key={row.participant.participant_id} className="truncate">{row.participant.full_name}</p>
                            ))}
                            {selectedManualRows.length > 6 && (
                                <p className="font-semibold text-slate-500">+{selectedManualRows.length - 6} more</p>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                            <input
                                type="date"
                                required
                                value={manualForm.date}
                                disabled
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                            />
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
                                {visibleSessions.map((session) => (
                                    <option key={session} value={session}>{session}</option>
                                ))}
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
                    <button type="submit" disabled={savingBulkManual || selectedManualRows.length === 0} className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-all shadow-md flex justify-center items-center gap-2 mt-4 disabled:cursor-not-allowed disabled:bg-slate-300">
                        {savingBulkManual ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Log {manualForm.session} Attendance
                    </button>
                </form>
            </div>
          </div>
      )}

      {showManualBlockedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => setShowManualBlockedModal(false)}
            ></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-[#4322A7] px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-semibold flex items-center gap-2">
                        <AlertCircle size={20} /> Manual Entry Unavailable
                    </h3>
                    <button onClick={() => setShowManualBlockedModal(false)} className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-indigo-50 text-[#4322A7] p-4 rounded-lg border border-indigo-200 text-sm leading-relaxed">
                        {manualBlockedMessage}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Selected Event Date</p>
                        <p className="font-semibold text-slate-800">
                            {selectedDate ? format(new Date(selectedDate), 'MMMM d, yyyy') : 'No date selected'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowManualBlockedModal(false)}
                        className="w-full bg-[#4322A7] text-white font-bold py-2.5 rounded-lg hover:bg-indigo-800 transition-all"
                    >
                        Close
                    </button>
                </div>
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
                <div className="p-8 flex flex-col items-center text-center" ref={badgeRef}>
                     <>
                        <div className="border-4 border-slate-900 p-3 rounded-xl mb-6 bg-white shadow-sm">
                            {qrToken && <QRCode value={qrToken} size={160} />}
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">{selectedParticipant.full_name}</h2>
                        <p className="text-indigo-600 font-medium mb-1">{selectedParticipant.position}</p>
                        <p className="text-slate-500 text-sm">{selectedParticipant.office}</p>
                     </>
                </div>
                <div className="px-8 pb-8 pt-0">
                    <button onClick={handleSaveBadge} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors">
                        <Download size={18} /> Save Badge
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceList;
