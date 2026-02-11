import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Event, Office } from '../../types/database';
import { CalendarPlus, Trash2, X, MapPin, Type, Clock, Share2, Edit, Users, Calendar, Check, Copy, Building2, Home } from 'lucide-react';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import QRCode from 'react-qr-code';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const EventsList: React.FC = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Modal States
  const [showEventModal, setShowEventModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  
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
      has_accommodation: false
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
        return `${format(startDate, 'MMM d')}-${format(endDate, 'd, yyyy')}`;
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
          has_accommodation: event.has_accommodation
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Event Management</h2>
        <button 
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
        >
            <CalendarPlus size={20} /> New Event
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                          <th className="px-6 py-4">Event Name</th>
                          <th className="px-6 py-4">Venue</th>
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Actions</th>
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
                              {events.map((event) => (
                                  <tr 
                                      key={event.event_id} 
                                      onClick={() => handleRowClick(event)}
                                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                                      title="Click to view participants"
                                  >
                                      <td className="px-6 py-4 font-medium text-slate-800 group-hover:text-indigo-600 transition-colors">
                                          {event.event_name}
                                          {event.has_accommodation && (
                                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                                                  <Home size={10} className="mr-1" /> Stay
                                              </span>
                                          )}
                                      </td>
                                      <td className="px-6 py-4 text-slate-600">{event.venue}</td>
                                      <td className="px-6 py-4 text-slate-600 font-medium">
                                          {formatEventDate(event.start_date, event.end_date)}
                                      </td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1
                                              ${event.status === 'Ongoing' ? 'bg-green-100 text-green-700' : ''}
                                              ${event.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' : ''}
                                              ${event.status === 'Completed' ? 'bg-slate-100 text-slate-700' : ''}
                                              ${event.status === 'Cancelled' ? 'bg-red-100 text-red-700' : ''}
                                          `}>
                                              <span className={`w-1.5 h-1.5 rounded-full 
                                                  ${event.status === 'Ongoing' ? 'bg-green-500' : ''}
                                                  ${event.status === 'Scheduled' ? 'bg-blue-500' : ''}
                                                  ${event.status === 'Completed' ? 'bg-slate-500' : ''}
                                                  ${event.status === 'Cancelled' ? 'bg-red-500' : ''}
                                              `}></span>
                                              {event.status.toUpperCase()}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 flex items-center gap-2">
                                          <button 
                                              onClick={(e) => openShareModal(e, event)}
                                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                                              title="Share Registration Link"
                                          >
                                              <Share2 size={18} />
                                          </button>
                                          <button 
                                              onClick={(e) => openEditModal(e, event)}
                                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                              title="Edit Event"
                                          >
                                              <Edit size={18} />
                                          </button>
                                          {user?.role === 'Admin' && (
                                              <button 
                                                  onClick={(e) => handleDelete(e, event.event_id)} 
                                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                  title="Delete Event"
                                              >
                                                  <Trash2 size={18} />
                                              </button>
                                          )}
                                      </td>
                                  </tr>
                              ))}
                              {events.length === 0 && (
                                  <tr>
                                      <td colSpan={5} className="text-center py-8 text-slate-400">
                                          No events found. Create one to get started.
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
                    <button onClick={() => setShowParticipantsModal(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-auto p-0">
                    {loadingParticipants ? (
                        <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div> Loading participants...
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 w-16 text-center">#</th>
                                    <th className="px-6 py-4">Participant Name</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Office</th>
                                    <th className="px-6 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {viewingParticipants.map((record, index) => (
                                    <tr key={index} className="hover:bg-slate-50">
                                        <td className="px-6 py-3 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
                                        <td className="px-6 py-3">
                                            <div className="font-medium text-slate-800">{record.participants?.full_name}</div>
                                            <div className="text-xs text-slate-500">{record.participants?.email}</div>
                                        </td>
                                        <td className="px-6 py-3 text-slate-600">
                                            {record.role || 'Delegate'}
                                            {record.needs_accommodation && (
                                                <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded">
                                                    Stay ({record.accommodation_pax})
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
                <div className="p-4 border-t border-slate-100 text-sm text-slate-500 bg-slate-50 rounded-b-xl flex justify-between">
                    <span>Total Participants: <b>{viewingParticipants.length}</b></span>
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

                <div className="grid grid-cols-2 gap-5">
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

                    {/* Accommodation Checkbox */}
                    <div className="flex items-center pt-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox"
                                className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                checked={formData.has_accommodation || false}
                                onChange={e => setFormData({...formData, has_accommodation: e.target.checked})}
                            />
                            <span className="text-sm font-medium text-slate-700">Offers Accommodation</span>
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
