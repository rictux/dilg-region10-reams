import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Event } from '../../types/database';
import { CalendarPlus, Trash2, X, MapPin, Type, Clock, Share2, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';

const EventsList: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState<Partial<Event>>({
      event_name: '',
      venue: '',
      start_date: '',
      end_date: '',
      status: 'Scheduled'
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('events').select('*').order('start_date', { ascending: false });
    if (!error && data) setEvents(data);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      const { error } = await supabase.from('events').insert([formData]);
      if (!error) {
          setShowModal(false);
          setFormData({ event_name: '', venue: '', start_date: '', end_date: '', status: 'Scheduled' });
          fetchEvents();
      } else {
        alert("Error creating event: " + error.message);
      }
  };

  const handleDelete = async (id: number) => {
      if(!confirm('Are you sure? This will delete all attendance logs associated with this event.')) return;
      
      const { error } = await supabase.from('events').delete().eq('event_id', id);
      if (error) {
        alert("Error deleting event: " + error.message);
      } else {
        fetchEvents();
      }
  };

  const openShareModal = (event: Event) => {
      setSelectedEvent(event);
      setShowShareModal(true);
      setCopied(false);
  };

  const getRegistrationLink = (eventId: number) => {
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
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
        >
            <CalendarPlus size={20} /> New Event
        </button>
      </div>

      {loading ? (
          <div className="flex justify-center py-10">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
      ) : (
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
                        {events.map((event) => (
                            <tr key={event.event_id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-800">{event.event_name}</td>
                                <td className="px-6 py-4 text-slate-600">{event.venue}</td>
                                <td className="px-6 py-4 text-slate-600">
                                    {event.start_date ? format(new Date(event.start_date), 'MMM d, yyyy') : 'TBD'}
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
                                <td className="px-6 py-4 flex items-center gap-3">
                                    <button 
                                        onClick={() => openShareModal(event)}
                                        className="text-indigo-600 hover:text-indigo-800 transition-colors"
                                        title="Share Registration Link"
                                    >
                                        <Share2 size={18} />
                                    </button>
                                    <button onClick={() => handleDelete(event.event_id)} className="text-slate-400 hover:text-red-600 transition-colors">
                                        <Trash2 size={18} />
                                    </button>
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
                    </tbody>
                </table>
            </div>
        </div>
      )}

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
                        <p className="text-xs text-slate-400 mt-2 text-center">
                            Share this link or QR code with participants to let them register for <strong>{selectedEvent.event_name}</strong>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
                aria-hidden="true"
                onClick={() => setShowModal(false)}
            ></div>

            {/* Modal Panel */}
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-100">
              
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2" id="modal-title">
                  <CalendarPlus className="h-5 w-5 text-indigo-100" />
                  Create New Event
                </h3>
                <button 
                  onClick={() => setShowModal(false)}
                  className="text-indigo-100 hover:text-white hover:bg-white/10 p-1 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form body */}
              <form onSubmit={handleCreate} className="p-6 space-y-5">
                
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

                {/* Status */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Initial Status</label>
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
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={() => setShowModal(false)} 
                      className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-sm"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-md hover:shadow-lg transition-all"
                    >
                      Create Event
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