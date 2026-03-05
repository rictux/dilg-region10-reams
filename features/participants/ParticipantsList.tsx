
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Participant, Event } from '../../types/database';
import { X, User, Printer, Calendar, RefreshCw, PlusCircle, Clock, Save, Loader2, UserCheck, UserX, AlertCircle, CheckCircle, Users, Search, Home, ChevronDown, Check, Filter, UserPlus, Building, Landmark, Download } from 'lucide-react';
import QRCode from 'react-qr-code';
import { format, parseISO, eachDayOfInterval, isSameMonth, isSameYear } from 'date-fns';
import { toPng } from 'html-to-image';
import * as XLSX from 'xlsx';

interface AttendanceRow {
    participant: Participant;
    role?: string;
    needs_accommodation?: boolean;
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
      gender: 'Male',
      age_group: '18-24',
      pwd: 'No',
      indigenous_people: 'No',
      needs_accommodation: false,
      accommodation_pax: 0,
      participant_id: null as number | null,
      accept_photo_video: false,
      store_to_db: false
  });
  const [suggestions, setSuggestions] = useState<Participant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Affiliation State
  const [affiliationType, setAffiliationType] = useState<'Office' | 'LGU'>('Office');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [locations, setLocations] = useState<any[]>([]);

  const provinces = Array.from(new Set(locations.map(l => l.province_huc))).sort();
  const cities = locations
      .filter(l => l.province_huc === selectedProvince && l.city_mun)
      .map(l => l.city_mun)
      .sort();

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
            .select('participant_id, role, needs_accommodation, participants(*)')
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
              exportData.push({
                  'Name': row.participant.full_name,
                  'Gender': row.participant.gender || 'N/A',
                  'Position': row.participant.position || 'N/A',
                  'Office': office,
                  'Mobile No': row.participant.mobile_no || 'N/A',
                  'Email': row.participant.email || 'N/A',
                  'Event Name': selectedEvent.title || selectedEvent.event_name,
                  'Role': row.role || 'Delegate',
                  'Needs Accomodation': row.needs_accommodation ? 'Yes' : 'No',
                  'Present': row.amLog ? 'Yes' : 'No'
              });
          });
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
      
      XLSX.writeFile(workbook, `Attendance_Report_${selectedEvent.title || selectedEvent.event_name}_${selectedDate}.xlsx`);
  };

  const openManualModal = (e: React.MouseEvent, p: Participant) => {
      e.stopPropagation();
      
      // Prevent manual entry for future dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const eventDate = new Date(selectedDate);
      eventDate.setHours(0, 0, 0, 0);
      
      if (eventDate > today) {
          alert("Cannot log attendance for future dates.");
          return;
      }

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

  const formatLogTime = (timeStr: string) => {
      const d = new Date(timeStr.endsWith('Z') || timeStr.includes('+') ? timeStr : timeStr + 'Z');
      return format(d, 'h:mm a');
  };

  const handleNameChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'f_name' | 'l_name') => {
    const val = e.target.value;
    setNewParticipant({ ...newParticipant, [field]: val, participant_id: null });
    
    if (val.length >= 2) {
        const { data } = await supabase
            .from('participants')
            .select('*')
            .ilike('full_name', `%${val}%`)
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
          f_name: p.f_name,
          l_name: p.l_name,
          m_initial: p.m_initial || '',
          suffix: p.suffix || '',
          full_name: p.full_name,
          email: p.email || '',
          office: p.office || '',
          mobile_no: p.mobile_no || '',
          position: p.position || '',
          gender: p.gender || 'Male',
          age_group: p.age_group || '18-24',
          pwd: p.pwd || 'No',
          indigenous_people: p.indigenous_people || 'No',
          participant_id: p.participant_id
      }));
      setSuggestions([]);
      setShowSuggestions(false);
  };
  
  const handleAddParticipant = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedEvent) return;
      
      let finalLocationId = null;
      let finalOfficeName = newParticipant.office;

      if (affiliationType === 'LGU') {
          if (!selectedProvince) {
              alert("Please select a Province/HUC for LGU.");
              return;
          }
          
          if (selectedCity) {
              const loc = locations.find(l => l.province_huc === selectedProvince && l.city_mun === selectedCity);
              if (loc) {
                  finalLocationId = loc.location_id;
                  finalOfficeName = `LGU ${selectedCity}, ${selectedProvince}`;
              } else {
                  alert("Selected location is invalid.");
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
              alert("Please enter your Office / Agency name.");
              return;
          }
      }

      if (newParticipant.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newParticipant.email)) {
          alert("Please enter a valid email address.");
          return;
      }

      if (newParticipant.mobile_no && !/^[0-9]{10,11}$/.test(newParticipant.mobile_no)) {
          alert("Please enter a valid mobile number (10 or 11 digits).");
          return;
      }

      setIsAddingParticipant(true);
      
      try {
          // 1. Check or Create Participant
          let participantId: number;
          
          if (newParticipant.participant_id) {
             participantId = newParticipant.participant_id;
             // Optional: Update participant details if changed
             await supabase.from('participants').update({
                f_name: newParticipant.f_name,
                l_name: newParticipant.l_name,
                m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim(),
                suffix: newParticipant.suffix.trim() === '' ? null : newParticipant.suffix.trim(),
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
                        f_name: newParticipant.f_name,
                        l_name: newParticipant.l_name,
                        m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim(),
                        suffix: newParticipant.suffix.trim() === '' ? null : newParticipant.suffix.trim(),
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
                    const initials = `${newParticipant.f_name[0] || ''}${newParticipant.l_name[0] || ''}`.toUpperCase().substring(0, 3);
                    const code = `${initials}-${Date.now().toString().slice(-6)}`;
                    
                    const { data: newUser, error: createError } = await supabase
                    .from('participants')
                    .insert([{
                        f_name: newParticipant.f_name,
                        l_name: newParticipant.l_name,
                        m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim(),
                        suffix: newParticipant.suffix.trim() === '' ? null : newParticipant.suffix.trim(),
                        email: newParticipant.email,
                        office: finalOfficeName,
                        location_id: finalLocationId,
                        participant_code: code,
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
               const initials = `${newParticipant.f_name[0] || ''}${newParticipant.l_name[0] || ''}`.toUpperCase().substring(0, 3);
               const code = `${initials}-${Date.now().toString().slice(-6)}`;
               const { data: newUser, error: createError } = await supabase
                .from('participants')
                .insert([{
                    f_name: newParticipant.f_name,
                    l_name: newParticipant.l_name,
                    m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim(),
                    suffix: newParticipant.suffix.trim() === '' ? null : newParticipant.suffix.trim(),
                    email: null,
                    office: finalOfficeName,
                    location_id: finalLocationId,
                    participant_code: code,
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
                accept_photo_video: newParticipant.accept_photo_video,
                store_to_db: newParticipant.store_to_db
            });

          if (regError && regError.code !== '23505') throw regError;
          
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
              gender: 'Male',
              age_group: '18-24',
              pwd: 'No',
              indigenous_people: 'No',
              needs_accommodation: false,
              accommodation_pax: 0,
              participant_id: null
          });
          setSuggestions([]);
          // fetchAttendance will be triggered by supabase real-time channel

      } catch (err: any) {
          alert("Error adding participant: " + err.message);
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
  const presentCount = data.filter(r => r.amLog || r.pmLog).length;
  const notPresentCount = data.filter(r => !r.amLog && !r.pmLog).length;
  const noPmCount = data.filter(r => r.amLog && !r.pmLog).length;
  const completeLogsCount = data.filter(r => r.amLog && r.pmLog).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
        <div className="flex flex-col md:flex-row gap-4 w-full items-start md:items-center">
            <div className="w-full md:w-[512px] relative" ref={dropdownRef}>
                <div 
                    className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 flex justify-between items-center cursor-pointer hover:border-indigo-400 transition-colors shadow-sm"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <div className="flex items-start gap-2 flex-1">
                        <Calendar className="text-slate-400 shrink-0 mt-0.5" size={16} />
                        <span className={`whitespace-normal break-words text-xs leading-snug ${!selectedEvent ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
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

            <div className="flex items-center gap-3 w-full md:w-auto ml-auto">
                 <div className="relative w-full md:w-64">
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
                 <button 
                     onClick={generateReport}
                     disabled={!selectedEvent || !selectedDate || data.length === 0}
                     className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors font-medium shrink-0"
                 >
                     <Download size={20} /> <span className="hidden sm:inline">Export</span>
                 </button>
                 <button 
                     onClick={() => setShowAddParticipantModal(true)}
                     disabled={!selectedEvent}
                     className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors font-medium shrink-0"
                 >
                     <UserPlus size={20} /> <span className="hidden sm:inline">Add</span>
                 </button>
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

      {/* Add Participant Modal */}
      {showAddParticipantModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddParticipantModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative z-10 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <UserPlus size={20} className="text-indigo-600" />
                        Add Participant
                    </h3>
                    <button onClick={() => setShowAddParticipantModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                
                <form onSubmit={handleAddParticipant} className="space-y-4">
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
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
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
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
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

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                        <select 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={newParticipant.gender}
                            onChange={e => setNewParticipant({...newParticipant, gender: e.target.value})}
                        >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Position</label>
                        <input 
                            type="text"
                            placeholder="e.g. Regional Director, Administrative Officer"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={newParticipant.position}
                            onChange={e => setNewParticipant({...newParticipant, position: e.target.value})}
                        />
                    </div>
                    
                    <div className="pt-2">
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
                                        disabled={!selectedProvince}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
                                        value={selectedCity}
                                        onChange={e => setSelectedCity(e.target.value)}
                                    >
                                        <option value="">-- Optional --</option>
                                        {cities.map(city => (
                                            <option key={city} value={city}>{city}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                         )}
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
                            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
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
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
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
                                    onChange={e => setNewParticipant({...newParticipant, needs_accommodation: e.target.checked})}
                                />
                                <span className="text-sm font-medium text-slate-700">Needs Accommodation</span>
                            </label>
                            
                            {newParticipant.needs_accommodation && (
                                <div className="mt-2 pl-6 animate-in fade-in slide-in-from-top-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Pax Count</label>
                                    <input 
                                        type="number"
                                        min="1"
                                        className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={newParticipant.accommodation_pax}
                                        onChange={e => setNewParticipant({...newParticipant, accommodation_pax: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                            )}
                        </div>
                    )}

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
                            <button onClick={() => window.print()} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors">
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
