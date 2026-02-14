
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Event, Office, Participant } from '../../types/database';
import { CalendarPlus, Trash2, X, MapPin, Type, Clock, Share2, Edit, Users, Calendar, Check, Copy, Building2, Home, Lock, Unlock, UserPlus, Loader2, MoreVertical, ArrowRight, Search } from 'lucide-react';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import QRCode from 'react-qr-code';
// Use react-router for core library components and hooks
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';

const EventsList: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  
  // Modal States
  const [showEventModal, setShowEventModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  
  // Add Participant Modal State
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState<{
      full_name: string;
      email: string;
      role: string;
      office: string;
      mobile_no: string;
      age_group: string;
      pwd: string;
      indigenous_people: string;
      needs_accommodation: boolean;
      accommodation_pax: number;
      participant_id?: number | null; // Track ID if selected from suggestions
  }>({
      full_name: '',
      email: '',
      role: 'Delegate',
      office: '',
      mobile_no: '',
      age_group: '18-24',
      pwd: 'No',
      indigenous_people: 'No',
      needs_accommodation: false,
      accommodation_pax: 0,
      participant_id: null
  });

  // Auto-suggestion state
  const [suggestions, setSuggestions] = useState<Participant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Selection States
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [viewingParticipants, setViewingParticipants] = useState<any[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  
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
    fetchOffices();

    const subscription = supabase
      .channel('events_list_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

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

  const fetchEvents = async () => {
    // Only set loading on initial load to avoid UI flicker
    if (events.length === 0) setLoading(true);
    
    const { data, error } = await supabase.from('events').select('*').order('start_date', { ascending: false });
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
            registration_status,
            registered_at,
            role,
            needs_accommodation,
            accommodation_pax,
            participants (
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
      setFormData(initialFormState);
      setShowEventModal(true);
  };

  const openEditModal = (e: React.MouseEvent, event: Event) => {
      e.stopPropagation(); // Prevent row click
      setEditingEventId(event.event_id);
      setFormData({
          event_name: event.event_name,
          venue: event.venue,
          start_date: event.start_date,
          end_date: event.end_date,
          status: event.status,
          organize_by: event.organize_by,
          has_accommodation: event.has_accommodation,
          registration_open: event.registration_open
      });
      setShowEventModal(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      
      let error;
      if (editingEventId) {
          // Update
          const { error: updateError } = await supabase
            .from('events')
            .update(formData)
            .eq('event_id', editingEventId);
          error = updateError;
      } else {
          // Create
          const { error: insertError } = await supabase
            .from('events')
            .insert([formData]);
          error = insertError;
      }

      if (!error) {
          setShowEventModal(false);
          setEditingEventId(null);
          setFormData(initialFormState);
          // fetchEvents is handled by subscription, but calling it here ensures immediate UI feedback if desired
          fetchEvents(); 
      } else {
        alert("Error saving event: " + error.message);
      }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); // Prevent row click
      if(!confirm('Are you sure? This will delete all attendance logs associated with this event.')) return;
      
      const { error } = await supabase.from('events').delete().eq('event_id', id);
      if (error) {
        alert("Error deleting event: " + error.message);
      }
      // fetchEvents handled by subscription
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

  const handleNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Clear participant_id when user types manually (implies new or search again)
    setNewParticipant(prev => ({ ...prev, full_name: value, participant_id: null }));

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
      setNewParticipant(prev => ({
          ...prev,
          full_name: p.full_name,
          email: p.email || '',
          office: p.office || '',
          mobile_no: p.mobile_no || '',
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
      setIsAddingParticipant(true);
      
      try {
          // 1. Check or Create Participant
          let participantId: number;
          
          if (newParticipant.participant_id) {
             participantId = newParticipant.participant_id;
             // Optional: Update participant details if changed
             await supabase.from('participants').update({
                full_name: newParticipant.full_name,
                email: newParticipant.email || null,
                office: newParticipant.office,
                mobile_no: newParticipant.mobile_no || null,
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
                        full_name: newParticipant.full_name,
                        office: newParticipant.office,
                        mobile_no: newParticipant.mobile_no || null,
                        age_group: newParticipant.age_group,
                        pwd: newParticipant.pwd,
                        indigenous_people: newParticipant.indigenous_people
                    }).eq('participant_id', participantId);
               } else {
                   // Create
                    const initials = newParticipant.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3);
                    const code = `${initials}-${Date.now().toString().slice(-6)}`;
                    
                    const { data: newUser, error: createError } = await supabase
                    .from('participants')
                    .insert([{
                        full_name: newParticipant.full_name,
                        email: newParticipant.email,
                        office: newParticipant.office,
                        participant_code: code,
                        position: 'N/A', // Default
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
               const initials = newParticipant.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3);
               const code = `${initials}-${Date.now().toString().slice(-6)}`;
               const { data: newUser, error: createError } = await supabase
                .from('participants')
                .insert([{
                    full_name: newParticipant.full_name,
                    email: null,
                    office: newParticipant.office,
                    participant_code: code,
                    position: 'N/A',
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
                accommodation_pax: newParticipant.needs_accommodation ? Math.max(1, newParticipant.accommodation_pax) : 0
            });

          if (regError && regError.code !== '23505') throw regError;
          
          // Success
          setShowAddParticipantModal(false);
          setNewParticipant({
              full_name: '',
              email: '',
              role: 'Delegate',
              office: '',
              mobile_no: '',
              age_group: '18-24',
              pwd: 'No',
              indigenous_people: 'No',
              needs_accommodation: false,
              accommodation_pax: 0,
              participant_id: null
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
      // Constructs link based on current origin and HashRouter structure
      return `${window.location.origin}${window.location.pathname}#/register/${eventId}`;
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
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border inline-flex items-center gap-1.5 ring-1 ring-inset ${activeStyle}`}>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Event Management</h2>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
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
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                          <th className="px-6 py-4">Event Details</th>
                          <th className="px-6 py-4">Venue</th>
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {loading ? (
                          // Skeleton Rows
                          [...Array(5)].map((_, i) => (
                              <tr key={i} className="animate-pulse">
                                  <td className="px-6 py-4">
                                      <div className="h-5 bg-slate-200 rounded w-48 mb-2"></div>
                                      <div className="h-3 bg-slate-100 rounded w-24"></div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="h-4 bg-slate-200 rounded w-32"></div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="h-4 bg-slate-200 rounded w-24"></div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                                  </td>
                                  <td className="px-6 py-4 flex gap-2">
                                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                                      <div className="h-8 w-8 bg-slate-200 rounded"></div>
                                  </td>
                              </tr>
                          ))
                      ) : (
                          <>
                              {filteredEvents.map((event) => (
                                  <tr 
                                      key={event.event_id} 
                                      onClick={() => handleRowClick(event)}
                                      className="group hover:bg-indigo-50/30 transition-all duration-200 cursor-pointer hover:shadow-sm border-l-2 border-l-transparent hover:border-l-indigo-500"
                                      title="Click to view participants"
                                  >
                                      <td className="px-6 py-4">
                                          <div className="font-semibold text-base text-slate-800 group-hover:text-indigo-700 transition-colors">
                                            {event.event_name}
                                          </div>
                                          <div className="flex gap-2 mt-1.5">
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
                                      <td className="px-6 py-4 text-slate-600">
                                          <div className="flex items-center gap-1.5">
                                            <MapPin size={14} className="text-slate-400" />
                                            {event.venue}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-slate-600 font-medium">
                                          <div className="flex items-center gap-1.5">
                                            <Calendar size={14} className="text-slate-400" />
                                            {formatEventDate(event.start_date, event.end_date)}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          {getStatusBadge(event.status)}
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={(e) => openShareModal(e, event)}
                                                className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Share Registration Link"
                                            >
                                                <Share2 size={18} />
                                            </button>
                                            <button 
                                                onClick={(e) => openEditModal(e, event)}
                                                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit Event"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            {/* GRANULAR PERMISSION CHECK FOR DELETE */}
                                            {hasPermission('DELETE_EVENTS') && (
                                                <button 
                                                    onClick={(e) => handleDelete(e, event.event_id)} 
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete Event"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                                            <div className="text-slate-300">
                                                <ArrowRight size={18} />
                                            </div>
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
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowParticipantsModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Users className="text-indigo-600" size={24} /> 
                            {selectedEvent.event_name}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {formatEventDate(selectedEvent.start_date, selectedEvent.end_date)} • {selectedEvent.venue}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {hasPermission('MANAGE_PARTICIPANTS') && (
                             <button 
                                onClick={() => setShowAddParticipantModal(true)}
                                className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors mr-2 shadow-sm"
                            >
                                <UserPlus size={16} /> Add Participant
                            </button>
                        )}
                        <button onClick={() => setShowParticipantsModal(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-auto p-0">
                    {loadingParticipants ? (
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {specialParticipants.length > 0 && (
                                    <>
                                        <tr className="bg-indigo-50/50">
                                            <td colSpan={5} className="px-6 py-2 text-xs font-bold text-indigo-800 uppercase tracking-wider">
                                                Event Officials & Guests ({specialParticipants.length})
                                            </td>
                                        </tr>
                                        {specialParticipants.map((record, index) => (
                                            <tr key={record.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-slate-800">{record.participants?.full_name}</div>
                                                    <div className="text-xs text-slate-500">{record.participants?.email}</div>
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">
                                                    <span className="font-medium text-indigo-600">{record.role}</span>
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
                                            </tr>
                                        ))}
                                    </>
                                )}

                                {delegateParticipants.length > 0 && (
                                    <>
                                         <tr className="bg-slate-50/80">
                                            <td colSpan={5} className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
                                                Delegates ({delegateParticipants.length})
                                            </td>
                                        </tr>
                                        {delegateParticipants.map((record, index) => (
                                            <tr key={record.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-slate-800">{record.participants?.full_name}</div>
                                                    <div className="text-xs text-slate-500">{record.participants?.email}</div>
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">
                                                    {record.role}
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
                                            </tr>
                                        ))}
                                    </>
                                )}

                                {viewingParticipants.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center py-10 text-slate-400">
                                            No participants registered yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Footer stats */}
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
            </div>
        </div>
      )}

      {/* Add Participant Modal */}
      {showAddParticipantModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddParticipantModal(false)}></div>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative z-10 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
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
                    <div className="relative">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                        <input 
                            required
                            type="text"
                            placeholder="Full Name"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={newParticipant.full_name}
                            onChange={handleNameChange}
                            onFocus={() => { if(newParticipant.full_name.length >= 2 && suggestions.length > 0) setShowSuggestions(true); }}
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                        <input 
                            type="email"
                            placeholder="email@example.com"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={newParticipant.email}
                            onChange={e => setNewParticipant({...newParticipant, email: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Mobile No.</label>
                        <input 
                            type="tel"
                            placeholder="09123456789"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={newParticipant.mobile_no}
                            onChange={e => setNewParticipant({...newParticipant, mobile_no: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Office / Agency</label>
                        <input 
                            required
                            type="text"
                            placeholder="Office Name"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            value={newParticipant.office}
                            onChange={e => setNewParticipant({...newParticipant, office: e.target.value})}
                        />
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
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-100">
              
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

                {/* Organize By */}
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
                                <option key={office.office_id} value={office.office_id}>{office.name}</option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
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
