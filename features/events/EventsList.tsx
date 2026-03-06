
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Event, Participant, Office } from '../../types/database';
import { CalendarPlus, Trash2, X, MapPin, Type, Clock, Share2, Edit, Users, Calendar, Check, Copy, Home, Lock, UserPlus, Loader2, ArrowRight, Search, Building2, Save, XCircle, AlertTriangle, MoreVertical, Building, Landmark } from 'lucide-react';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import QRCode from 'react-qr-code';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';

const EventsList: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const navigate = useNavigate();
  
  // Modal States
  const [showEventModal, setShowEventModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  
  // Add Participant Modal State
  const [participantModalView, setParticipantModalView] = useState<'list' | 'add'>('list');
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState<{
      f_name: string;
      l_name: string;
      m_initial: string;
      suffix: string;
      full_name: string;
      email: string;
      role: string;
      office: string;
      mobile_no: string;
      position: string;
      gender: string;
      age_group: string;
      pwd: string;
      indigenous_people: string;
      needs_accommodation: boolean;
      accommodation_pax: number;
      participant_id?: number | null; 
      accept_photo_video: boolean;
      store_to_db: boolean;
  }>({
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
      participant_id: null,
      accept_photo_video: false,
      store_to_db: false
  });

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

  // Auto-suggestion state
  const [suggestions, setSuggestions] = useState<Participant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Selection States
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [viewingParticipants, setViewingParticipants] = useState<any[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Role Editing State
  const [editingRole, setEditingRole] = useState<{ participantId: number; role: string } | null>(null);

  // Delete Confirmation State
  const [participantToDelete, setParticipantToDelete] = useState<number | null>(null);
  const [eventToDelete, setEventToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  
  // Form State
  const initialFormState = {
      event_name: '',
      venue: '',
      start_date: '',
      end_date: '',
      status: 'Scheduled' as const,
      organize_by: null as number | null,
      has_accommodation: false,
      registration_open: true
  };
  const [formData, setFormData] = useState<Partial<Event>>(initialFormState);

  useEffect(() => {
    fetchEvents();
    fetchLocations();
    if (user?.role === 'Admin') {
        fetchOffices();
    }

    const subscription = supabase
      .channel('events_list_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

  // Realtime updates for the Participants Modal
  useEffect(() => {
    if (showParticipantsModal && selectedEvent) {
        // Initial fetch
        fetchEventParticipants(selectedEvent.event_id);

        // Subscribe to changes for this specific event's participants
        const channel = supabase
            .channel(`modal_participants_${selectedEvent.event_id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'event_participants',
                filter: `event_id=eq.${selectedEvent.event_id}`
            }, () => {
                fetchEventParticipants(selectedEvent.event_id);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
  }, [showParticipantsModal, selectedEvent]);

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

  const fetchEvents = async () => {
    // Only set loading on initial load to avoid UI flicker
    if (events.length === 0) setLoading(true);
    
    let query = supabase.from('events').select('*').order('start_date', { ascending: false });

    // Display only the event with same office_id of the login user IF NOT ADMIN
    // If the user has an office assigned, filter events organized by that office
    // Admin sees everything regardless of their office_id
    if (user?.role !== 'Admin' && user?.office_id) {
        query = query.eq('organize_by', user.office_id);
    }
    
    const { data, error } = await query;
    if (!error && data) setEvents(data);
    setLoading(false);
  };

  const fetchOffices = async () => {
      const { data } = await supabase.from('offices').select('*').order('name');
      if (data) setOffices(data);
  };

  const fetchEventParticipants = async (eventId: number) => {
    setLoadingParticipants(true);
    const { data, error } = await supabase
        .from('event_participants')
        .select(`
            id,
            registration_status,
            registered_at,
            role,
            needs_accommodation,
            accommodation_pax,
            participants (
                participant_id,
                full_name,
                participant_code,
                email,
                position,
                office
            )
        `)
        .eq('event_id', eventId);
    
    if (!error && data) {
        setViewingParticipants(data);
    }
    setLoadingParticipants(false);
  };

  // --- Date Formatting Logic ---
  const formatEventDate = (start: string, end: string) => {
    if (!start) return 'TBD';
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;

    if (start === end) {
        return format(startDate, 'MMM d, yyyy');
    }

    if (isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMM d')} - ${format(endDate, 'd, yyyy')}`;
    }

    if (!isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
    }

    return `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
  };

  // --- Handlers ---

  const openCreateModal = () => {
      setEditingEventId(null);
      // Pre-select user's office if applicable, unless Admin who can choose
      setFormData({
          ...initialFormState,
          organize_by: user?.role === 'Admin' ? null : (user?.office_id || null)
      });
      setShowEventModal(true);
  };

  const openEditModal = (e: React.MouseEvent, event: Event) => {
      e.stopPropagation(); // Prevent row click
      setEditingEventId(event.event_id);
      setFormData({
          event_name: event.event_name || '',
          venue: event.venue || '',
          start_date: event.start_date || '',
          end_date: event.end_date || '',
          status: event.status,
          organize_by: event.organize_by,
          has_accommodation: event.has_accommodation,
          registration_open: event.registration_open
      });
      setShowEventModal(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // If not admin, force assignment to their office (security fallback)
      let payload = { ...formData };
      if (user?.role !== 'Admin' && user?.office_id) {
          payload.organize_by = user.office_id;
      }

      let error;
      if (editingEventId) {
          // Update
          const { error: updateError } = await supabase
            .from('events')
            .update(payload)
            .eq('event_id', editingEventId);
          error = updateError;
      } else {
          // Create
          const { error: insertError } = await supabase
            .from('events')
            .insert([payload]);
          error = insertError;
      }

      if (!error) {
          setShowEventModal(false);
          setEditingEventId(null);
          setFormData(initialFormState);
          fetchEvents(); 
      } else {
        alert("Error saving event: " + error.message);
      }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); // Prevent row click
      setEventToDelete(id);
  };

  const confirmDeleteEvent = async () => {
      if (!eventToDelete) return;
      
      setIsDeleting(true);
      try {
          const { error } = await supabase.from('events').delete().eq('event_id', eventToDelete);
          if (error) throw error;
          setEventToDelete(null);
      } catch (err: any) {
          alert("Error deleting event: " + err.message);
      } finally {
          setIsDeleting(false);
      }
  };

  const openShareModal = (e: React.MouseEvent, event: Event) => {
      e.stopPropagation(); // Prevent row click
      setSelectedEvent(event);
      setShowShareModal(true);
      setCopied(false);
  };

  const handleRowClick = (event: Event) => {
      setSelectedEvent(event);
      setShowParticipantsModal(true);
      // fetchEventParticipants is called in useEffect when modal opens
  };

  const initiateRemoveParticipant = (participantId: number) => {
      setParticipantToDelete(participantId);
  };

  const confirmRemoveParticipant = async () => {
      if (!selectedEvent || !participantToDelete) return;
      
      setIsDeleting(true);
      try {
          // Attempt to delete. DB constraints might prevent this if attendance logs exist and cascade isn't set.
          // Ideally, we would delete attendance logs first or handle the error.
          await supabase.from('attendance_logs').delete().eq('event_id', selectedEvent.event_id).eq('participant_id', participantToDelete);

          const { error } = await supabase
            .from('event_participants')
            .delete()
            .eq('event_id', selectedEvent.event_id)
            .eq('participant_id', participantToDelete);

          if (error) throw error;
          
          // Refresh happens via realtime subscription or we can force it
          fetchEventParticipants(selectedEvent.event_id);
          setParticipantToDelete(null); // Close modal
      } catch (err: any) {
          alert("Error removing participant: " + err.message);
      } finally {
          setIsDeleting(false);
      }
  };

  const handleUpdateRole = async () => {
      if (!editingRole || !selectedEvent) return;
      
      try {
          const { error } = await supabase
              .from('event_participants')
              .update({ role: editingRole.role })
              .eq('event_id', selectedEvent.event_id)
              .eq('participant_id', editingRole.participantId);

          if (error) throw error;
          
          setEditingRole(null);
          // fetchEventParticipants triggered by subscription
      } catch (err: any) {
          alert("Error updating role: " + err.message);
      }
  };

  const handleNameChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'f_name' | 'l_name') => {
    const value = e.target.value;
    // Clear participant_id when user types manually (implies new or search again)
    setNewParticipant(prev => ({ ...prev, [field]: value, participant_id: null }));

    if (value.length >= 2) {
        const { data } = await supabase
            .from('participants')
            .select('*')
            .ilike('full_name', `%${value}%`)
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
          gender: p.gender || 'Male',
          age_group: p.age_group || '18-24',
          pwd: p.pwd || 'No',
          indigenous_people: p.indigenous_people || 'No',
          participant_id: p.participant_id
      }));
      setSuggestions([]);
      setShowSuggestions(false);
  };
  
  const toProperCase = (str: string) => {
    return str.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
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
                f_name: toProperCase(newParticipant.f_name.trim()),
                l_name: toProperCase(newParticipant.l_name.trim()),
                m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim().toUpperCase(),
                suffix: newParticipant.suffix.trim() === '' ? null : toProperCase(newParticipant.suffix.trim()),
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
                        suffix: newParticipant.suffix.trim() === '' ? null : toProperCase(newParticipant.suffix.trim()),
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
                        suffix: newParticipant.suffix.trim() === '' ? null : toProperCase(newParticipant.suffix.trim()),
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
                    suffix: newParticipant.suffix.trim() === '' ? null : toProperCase(newParticipant.suffix.trim()),
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
                accept_photo_video: newParticipant.accept_photo_video,
                store_to_db: newParticipant.store_to_db
            });

          if (regError && regError.code !== '23505') throw regError;
          
          // Success
          setParticipantModalView('list');
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
              participant_id: null,
              accept_photo_video: false,
              store_to_db: false
          });
          setSuggestions([]);
          fetchEventParticipants(selectedEvent.event_id);

      } catch (err: any) {
          alert("Error adding participant: " + err.message);
      } finally {
          setIsAddingParticipant(false);
      }
  };

  const getRegistrationLink = (eventId: number) => {
      // Determine base URL, assuming the events page is at /events
      const baseUrl = window.location.href.split('/events')[0];
      return `${baseUrl}/register/${eventId}`;
  };

  const copyToClipboard = () => {
      if (!selectedEvent) return;
      navigator.clipboard.writeText(getRegistrationLink(selectedEvent.event_id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  // Grouping Logic
  const specialRoles = ['Speaker', 'Secretariat', 'VIP', 'Guest'];
  const specialParticipants = viewingParticipants.filter(p => specialRoles.includes(p.role));
  const delegateParticipants = viewingParticipants.filter(p => p.role === 'Delegate');

  // Stats Logic
  const totalCount = viewingParticipants.length;
  const delegateCount = delegateParticipants.length;
  const accommodationCount = React.useMemo(() => {
      return viewingParticipants.filter(p => p.needs_accommodation).length;
  }, [viewingParticipants]);

  // Helper for status badges
  const getStatusBadge = (status: string) => {
    const styles = {
      'Ongoing': 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
      'Scheduled': 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20',
      'Completed': 'bg-slate-50 text-slate-600 border-slate-200 ring-slate-500/20',
      'Cancelled': 'bg-red-50 text-red-700 border-red-200 ring-red-500/20',
    };
    
    // @ts-ignore
    const activeStyle = styles[status] || styles['Completed'];

    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border inline-flex items-center gap-1.5 ring-1 ring-inset ${activeStyle}`}>
         <span className={`w-1.5 h-1.5 rounded-full ${status === 'Ongoing' ? 'animate-pulse bg-emerald-500' : 'bg-current opacity-60'}`}></span>
         {status.toUpperCase()}
      </span>
    );
  };

  // Filtered list for search
  const filteredEvents = useMemo(() => {
    if (!searchTerm.trim()) return events;
    const lower = searchTerm.toLowerCase();
    return events.filter(e => 
      e.event_name.toLowerCase().includes(lower) || 
      e.venue.toLowerCase().includes(lower)
    );
  }, [events, searchTerm]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(start, start + itemsPerPage);
  }, [filteredEvents, currentPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-64">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Search events..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <button 
            onClick={openCreateModal}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
            <CalendarPlus size={20} /> New Event
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-visible">
          <div className="overflow-visible">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                          <th className="px-6 py-4 text-center">Event Details</th>
                          <th className="px-6 py-4 text-center">Venue</th>
                          <th className="px-6 py-4 text-center">Date</th>
                          <th className="px-6 py-4 text-center">Status</th>
                          <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {loading ? (
                          // Skeleton Rows
                          [...Array(5)].map((_, i) => (
                              <tr key={i} className="animate-pulse">
                                  <td className="px-6 py-4">
                                      <div className="h-5 bg-slate-200 rounded w-48 mb-2 mx-auto"></div>
                                      <div className="h-3 bg-slate-100 rounded w-24 mx-auto"></div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="h-4 bg-slate-200 rounded w-32 mx-auto"></div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="h-4 bg-slate-200 rounded w-24 mx-auto"></div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="h-6 bg-slate-200 rounded-full w-20 mx-auto"></div>
                                  </td>
                                  <td className="px-6 py-4 flex gap-2 justify-center">
                                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                                  </td>
                              </tr>
                          ))
                      ) : (
                          <>
                              {paginatedEvents.map((event) => (
                                  <tr 
                                      key={event.event_id} 
                                      onClick={() => handleRowClick(event)}
                                      className="group hover:bg-indigo-50/30 transition-all duration-200 cursor-pointer hover:shadow-sm"
                                      title="Click to view participants"
                                  >
                                      <td className="px-6 py-4 text-center border-l-2 border-l-transparent group-hover:border-l-indigo-500">
                                          <div className="font-semibold text-sm text-slate-800 group-hover:text-indigo-700 transition-colors">
                                            {event.event_name}
                                          </div>
                                          <div className="flex gap-2 mt-1.5 justify-center">
                                            {event.has_accommodation && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                    <Home size={10} className="mr-1" /> Accommodation
                                                </span>
                                            )}
                                            {!event.registration_open && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-100">
                                                    <Lock size={10} className="mr-1" /> Closed
                                                </span>
                                            )}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-slate-600 text-center">
                                          <div className="flex items-center justify-center gap-1.5 text-xs">
                                            <MapPin size={12} className="text-slate-400" />
                                            {event.venue}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-slate-600 font-medium text-center">
                                          <div className="flex items-center justify-center gap-1.5 text-xs">
                                            <Calendar size={12} className="text-slate-400" />
                                            {formatEventDate(event.start_date, event.end_date)}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          {getStatusBadge(event.status)}
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center justify-center relative">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenActionMenuId(openActionMenuId === event.event_id ? null : event.event_id);
                                                }}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Actions"
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                            
                                            {openActionMenuId === event.event_id && (
                                                <>
                                                    <div 
                                                        className="fixed inset-0 z-10"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenActionMenuId(null);
                                                        }}
                                                    />
                                                    <div className="absolute right-10 top-1/2 -translate-y-1/2 w-36 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                                        <button 
                                                            onClick={(e) => {
                                                                setOpenActionMenuId(null);
                                                                openShareModal(e, event);
                                                            }}
                                                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-left"
                                                        >
                                                            <Share2 size={16} /> Share
                                                        </button>
                                                        <button 
                                                            onClick={(e) => {
                                                                setOpenActionMenuId(null);
                                                                openEditModal(e, event);
                                                            }}
                                                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors text-left"
                                                        >
                                                            <Edit size={16} /> Edit
                                                        </button>
                                                        {hasPermission('DELETE_EVENTS') && (
                                                            <button 
                                                                onClick={(e) => {
                                                                    setOpenActionMenuId(null);
                                                                    handleDelete(e, event.event_id);
                                                                }} 
                                                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                                                            >
                                                                <Trash2 size={16} /> Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                              {filteredEvents.length === 0 && (
                                  <tr>
                                      <td colSpan={5} className="text-center py-12 text-slate-400 bg-slate-50/50">
                                          <div className="flex flex-col items-center justify-center">
                                            {searchTerm ? <Search className="w-12 h-12 text-slate-300 mb-3" /> : <Calendar className="w-12 h-12 text-slate-300 mb-3" />}
                                            <p className="font-medium text-slate-500">{searchTerm ? `No results for "${searchTerm}"` : 'No events found'}</p>
                                            <p className="text-xs mt-1">{searchTerm ? 'Try adjusting your search terms' : 'Create a new event to get started'}</p>
                                          </div>
                                      </td>
                                  </tr>
                              )}
                          </>
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* Share / Registration Modal */}
      {showShareModal && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowShareModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative z-10 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800">Event Registration</h3>
                    <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="space-y-6 flex flex-col items-center">
                    {!selectedEvent.registration_open ? (
                        <div className="w-full bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <div className="flex justify-center mb-2">
                                <Lock className="text-red-500" size={32} />
                            </div>
                            <h4 className="font-bold text-red-700 mb-1">Registration is Closed</h4>
                            <p className="text-sm text-red-600">
                                Users cannot register for this event. Enable registration in event settings to share.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="p-4 border-2 border-indigo-100 rounded-lg bg-indigo-50/50">
                                <QRCode value={getRegistrationLink(selectedEvent.event_id)} size={180} />
                            </div>
                            
                            <div className="w-full">
                                <label className="block text-sm font-medium text-slate-700 mb-2">Registration Link</label>
                                <div className="flex gap-2">
                                    <input 
                                        readOnly 
                                        value={getRegistrationLink(selectedEvent.event_id)}
                                        className="flex-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 bg-slate-50 focus:outline-none"
                                    />
                                    <button 
                                        onClick={copyToClipboard}
                                        className={`px-3 py-2 rounded-lg border flex items-center gap-2 transition-all
                                            ${copied ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}
                                        `}
                                    >
                                        {copied ? <Check size={18} /> : <Copy size={18} />}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Participants List Modal */}
      {showParticipantsModal && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowParticipantsModal(false); setParticipantModalView('list'); }}></div>
            <div className={`bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200`}>
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            {participantModalView === 'list' ? (
                                <>
                                    <Users className="text-indigo-600" size={24} /> 
                                    {selectedEvent.event_name}
                                </>
                            ) : (
                                <>
                                    <UserPlus className="text-indigo-600" size={24} /> 
                                    Add Participant
                                </>
                            )}
                        </h3>
                        {participantModalView === 'list' && (
                            <p className="text-sm text-slate-500 mt-1">
                                {formatEventDate(selectedEvent.start_date, selectedEvent.end_date)} • {selectedEvent.venue}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {participantModalView === 'list' ? (
                            hasPermission('MANAGE_PARTICIPANTS') && (
                                <button 
                                    onClick={() => setParticipantModalView('add')}
                                    className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors mr-2 shadow-sm"
                                >
                                    <UserPlus size={16} /> Add
                                </button>
                            )
                        ) : (
                            <button 
                                onClick={() => setParticipantModalView('list')}
                                className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-200 transition-colors mr-2 shadow-sm"
                            >
                                <ArrowRight size={16} className="rotate-180" /> Return to List
                            </button>
                        )}
                        <button onClick={() => { setShowParticipantsModal(false); setParticipantModalView('list'); }} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-0">
                    {participantModalView === 'list' ? (
                        loadingParticipants ? (
                        <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div> Loading participants...
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-6 py-4 w-16 text-center">#</th>
                                    <th className="px-6 py-4">Participant Name</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Office</th>
                                    <th className="px-6 py-4">Status</th>
                                    {hasPermission('MANAGE_PARTICIPANTS') && <th className="px-6 py-4 text-right">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {specialParticipants.length > 0 && (
                                    <>
                                        <tr className="bg-indigo-50/50">
                                            <td colSpan={hasPermission('MANAGE_PARTICIPANTS') ? 6 : 5} className="px-6 py-2 text-xs font-bold text-indigo-800 uppercase tracking-wider">
                                                Event Officials & Guests ({specialParticipants.length})
                                            </td>
                                        </tr>
                                        {specialParticipants.map((record, index) => {
                                            const isEditing = editingRole?.participantId === record.participants.participant_id;
                                            return (
                                            <tr key={record.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-slate-800">{record.participants?.full_name}</div>
                                                    <div className="text-xs text-slate-500">{record.participants?.email}</div>
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                className="text-xs border border-slate-300 rounded p-1 bg-white focus:outline-none focus:border-indigo-500"
                                                                value={editingRole.role}
                                                                onChange={(e) => setEditingRole({ ...editingRole, role: e.target.value })}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <option value="Delegate">Delegate</option>
                                                                <option value="Speaker">Speaker</option>
                                                                <option value="Secretariat">Secretariat</option>
                                                                <option value="Guest">Guest</option>
                                                                <option value="VIP">VIP</option>
                                                            </select>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateRole(); }} 
                                                                className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"
                                                                title="Save Role"
                                                            >
                                                                <Save size={16}/>
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setEditingRole(null); }} 
                                                                className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                                                title="Cancel Edit"
                                                            >
                                                                <XCircle size={16}/>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 group/role">
                                                            <span className="font-medium text-indigo-600">{record.role}</span>
                                                            {hasPermission('MANAGE_PARTICIPANTS') && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setEditingRole({ participantId: record.participants.participant_id, role: record.role }); }}
                                                                    className="opacity-0 group-hover/role:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity p-1"
                                                                    title="Edit Role"
                                                                >
                                                                    <Edit size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                    {record.needs_accommodation && (
                                                        <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded flex items-center w-fit gap-1 mt-0.5">
                                                            <Home size={8} /> Stay
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">{record.participants?.office}</td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                                                        ${record.registration_status === 'Registered' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
                                                    `}>
                                                        {record.registration_status}
                                                    </span>
                                                </td>
                                                {hasPermission('MANAGE_PARTICIPANTS') && (
                                                    <td className="px-6 py-3 text-right">
                                                        <button 
                                                            onClick={() => initiateRemoveParticipant(record.participants.participant_id)}
                                                            className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                                            title="Remove Participant"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                        })}
                                    </>
                                )}

                                {delegateParticipants.length > 0 && (
                                    <>
                                         <tr className="bg-slate-50/80">
                                            <td colSpan={hasPermission('MANAGE_PARTICIPANTS') ? 6 : 5} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
                                                Delegates ({delegateParticipants.length})
                                            </td>
                                        </tr>
                                        {delegateParticipants.map((record, index) => {
                                            const isEditing = editingRole?.participantId === record.participants.participant_id;
                                            return (
                                            <tr key={record.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-slate-800">{record.participants?.full_name}</div>
                                                    <div className="text-xs text-slate-500">{record.participants?.email}</div>
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                className="text-xs border border-slate-300 rounded p-1 bg-white focus:outline-none focus:border-indigo-500"
                                                                value={editingRole.role}
                                                                onChange={(e) => setEditingRole({ ...editingRole, role: e.target.value })}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <option value="Delegate">Delegate</option>
                                                                <option value="Speaker">Speaker</option>
                                                                <option value="Secretariat">Secretariat</option>
                                                                <option value="Guest">Guest</option>
                                                                <option value="VIP">VIP</option>
                                                            </select>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateRole(); }} 
                                                                className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"
                                                                title="Save Role"
                                                            >
                                                                <Save size={16}/>
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setEditingRole(null); }} 
                                                                className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                                                title="Cancel Edit"
                                                            >
                                                                <XCircle size={16}/>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 group/role">
                                                            <span className="font-medium text-indigo-600">{record.role}</span>
                                                            {hasPermission('MANAGE_PARTICIPANTS') && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setEditingRole({ participantId: record.participants.participant_id, role: record.role }); }}
                                                                    className="opacity-0 group-hover/role:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity p-1"
                                                                    title="Edit Role"
                                                                >
                                                                    <Edit size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                    {record.needs_accommodation && (
                                                        <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded flex items-center w-fit gap-1 mt-0.5">
                                                            <Home size={8} /> Stay
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">{record.participants?.office}</td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                                                        ${record.registration_status === 'Registered' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
                                                    `}>
                                                        {record.registration_status}
                                                    </span>
                                                </td>
                                                {hasPermission('MANAGE_PARTICIPANTS') && (
                                                    <td className="px-6 py-3 text-right">
                                                        <button 
                                                            onClick={() => initiateRemoveParticipant(record.participants.participant_id)}
                                                            className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                                            title="Remove Participant"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                            );
                                        })}
                                    </>
                                )}

                                {viewingParticipants.length === 0 && (
                                    <tr>
                                        <td colSpan={hasPermission('MANAGE_PARTICIPANTS') ? 6 : 5} className="text-center py-10 text-slate-400">
                                            No participants registered yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )) : (
                        <div className="p-6 max-w-2xl mx-auto w-full">
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
                                            onBlur={e => setNewParticipant({...newParticipant, suffix: toProperCase(e.target.value)})}
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
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                                    value={selectedProvince}
                                                    onChange={e => {
                                                        setSelectedProvince(e.target.value);
                                                        setSelectedCity('');
                                                        const officeName = e.target.value.toLowerCase().includes('city') ? `LGU ${e.target.value}` : `Provincial Gov't of ${e.target.value}`;
                                                        setNewParticipant({...newParticipant, office: officeName});
                                                    }}
                                                >
                                                    <option value="">Select Province/HUC</option>
                                                    {provinces.map(p => (
                                                        <option key={p} value={p}>{p}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">City / Municipality</label>
                                                <select 
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                                    value={selectedCity}
                                                    onChange={e => {
                                                        setSelectedCity(e.target.value);
                                                        setNewParticipant({...newParticipant, office: `LGU ${e.target.value}, ${selectedProvince}`});
                                                    }}
                                                    disabled={!selectedProvince}
                                                >
                                                    <option value="">-- Select City/Mun --</option>
                                                    {cities.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                     )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                                        <select 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            value={newParticipant.role}
                                            onChange={e => setNewParticipant({...newParticipant, role: e.target.value})}
                                        >
                                            <option value="Delegate">Delegate</option>
                                            <option value="Speaker">Speaker</option>
                                            <option value="Secretariat">Secretariat</option>
                                            <option value="Guest">Guest</option>
                                            <option value="VIP">VIP</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Age Group</label>
                                        <select 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            value={newParticipant.age_group}
                                            onChange={e => setNewParticipant({...newParticipant, age_group: e.target.value})}
                                        >
                                            <option value="18-24">18-24</option>
                                            <option value="25-34">25-34</option>
                                            <option value="35-44">35-44</option>
                                            <option value="45-54">45-54</option>
                                            <option value="55-64">55-64</option>
                                            <option value="65+">65+</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">PWD</label>
                                        <select 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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
                                                onChange={e => setNewParticipant({...newParticipant, needs_accommodation: e.target.checked, accommodation_pax: e.target.checked ? 1 : 0})}
                                            />
                                            <span className="text-sm font-medium text-slate-700">Needs Accommodation</span>
                                        </label>
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

                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                                    <button 
                                        type="button"
                                        onClick={() => setParticipantModalView('list')}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={isAddingParticipant}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
                                    >
                                        {isAddingParticipant ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                                        Add Participant
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
                
                {/* Footer stats */}
                {participantModalView === 'list' && (
                    <div className="p-4 border-t border-slate-100 text-sm text-slate-500 bg-slate-50 rounded-b-xl grid grid-cols-1 sm:grid-cols-3 gap-4">
                         <div className="flex flex-col">
                            <span className="text-xs uppercase text-slate-400 font-bold">Total Participants</span>
                            <span className="text-lg font-bold text-slate-800">{totalCount}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs uppercase text-slate-400 font-bold">Total Delegates</span>
                            <span className="text-lg font-bold text-slate-800">{delegateCount}</span>
                        </div>
                         <div className="flex flex-col">
                            <span className="text-xs uppercase text-slate-400 font-bold">Accommodation</span>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-purple-700">{accommodationCount}</span>
                                <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">Pax Requested</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Participant */}
      {participantToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setParticipantToDelete(null)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative z-20 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="bg-red-100 p-3 rounded-full mb-4">
                        <AlertTriangle className="text-red-600" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Remove Participant?</h3>
                    <p className="text-sm text-slate-500 mb-6">
                        Are you sure you want to remove this participant from the event? This action cannot be undone and will delete all attendance records associated with this event.
                    </p>
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={() => setParticipantToDelete(null)}
                            className="flex-1 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmRemoveParticipant}
                            disabled={isDeleting}
                            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                        >
                            {isDeleting ? <Loader2 className="animate-spin" size={18} /> : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Event */}
      {eventToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEventToDelete(null)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative z-20 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="bg-red-100 p-3 rounded-full mb-4">
                        <AlertTriangle className="text-red-600" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Delete Event?</h3>
                    <p className="text-sm text-slate-500 mb-6">
                        Are you sure you want to delete this event? This action cannot be undone and will delete all attendance logs associated with this event.
                    </p>
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={() => setEventToDelete(null)}
                            className="flex-1 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDeleteEvent}
                            disabled={isDeleting}
                            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                        >
                            {isDeleting ? <Loader2 className="animate-spin" size={18} /> : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}



      {/* Create/Edit Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
                aria-hidden="true"
                onClick={() => setShowEventModal(false)}
            ></div>

            {/* Modal Panel */}
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl border border-slate-100">
              
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2" id="modal-title">
                  <CalendarPlus className="h-5 w-5 text-indigo-100" />
                  {editingEventId ? 'Edit Event' : 'Create New Event'}
                </h3>
                <button 
                  onClick={() => setShowEventModal(false)}
                  className="text-indigo-100 hover:text-white hover:bg-white/10 p-1 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form body */}
              <form onSubmit={handleSaveEvent} className="p-6 space-y-5">
                
                {/* Event Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Event Name</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Type className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    </div>
                    <input 
                      required 
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all" 
                      placeholder="e.g. Annual Tech Conference 2024"
                      value={formData.event_name} 
                      onChange={e => setFormData({...formData, event_name: e.target.value})} 
                    />
                  </div>
                </div>

                {/* Venue */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Venue Location</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MapPin className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    </div>
                    <input 
                      required 
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all" 
                      placeholder="e.g. Grand Convention Center, Hall A"
                      value={formData.venue} 
                      onChange={e => setFormData({...formData, venue: e.target.value})} 
                    />
                  </div>
                </div>

                {/* Organized By - Admin Only */}
                {user?.role === 'Admin' && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Organized By</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Building2 className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                            </div>
                            <select 
                                className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm bg-white transition-all appearance-none"
                                value={formData.organize_by || ''}
                                onChange={e => setFormData({...formData, organize_by: e.target.value ? Number(e.target.value) : null})}
                            >
                                <option value="">-- Select Office --</option>
                                {offices.map(office => (
                                    <option key={office.office_id} value={office.office_id}>
                                        {office.name} ({office.code})
                                    </option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                )}

                {/* Dates Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date</label>
                    <div className="relative group">
                       <input 
                        type="date" 
                        required 
                        className="block w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all" 
                        value={formData.start_date} 
                        onChange={e => setFormData({...formData, start_date: e.target.value})} 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">End Date</label>
                    <div className="relative group">
                       <input 
                        type="date" 
                        required 
                        className="block w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all" 
                        value={formData.end_date} 
                        onChange={e => setFormData({...formData, end_date: e.target.value})} 
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Status */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Clock className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                            </div>
                            <select 
                                className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm bg-white transition-all appearance-none"
                                value={formData.status}
                                onChange={e => setFormData({...formData, status: e.target.value as any})}
                            >
                                <option value="Scheduled">Scheduled</option>
                                <option value="Ongoing">Ongoing</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-2">
                         {/* Registration Open Toggle */}
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <div className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.registration_open ? 'bg-green-500' : 'bg-slate-200'}`}>
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.registration_open ? 'translate-x-4' : 'translate-x-0'}`}
                                />
                             </div>
                             <input 
                                type="checkbox"
                                className="hidden"
                                checked={formData.registration_open}
                                onChange={e => setFormData({...formData, registration_open: e.target.checked})}
                            />
                            <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Registration Open</span>
                        </label>

                        {/* Accommodation Checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                                type="checkbox"
                                className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                checked={formData.has_accommodation || false}
                                onChange={e => setFormData({...formData, has_accommodation: e.target.checked})}
                            />
                            <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Offers Accommodation</span>
                        </label>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={() => setShowEventModal(false)} 
                      className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-sm"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-md hover:shadow-lg transition-all"
                    >
                      {editingEventId ? 'Save Changes' : 'Create Event'}
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

export default EventsList;
