
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Calendar, MapPin, User, Clock, ChevronRight, Loader2, Landmark, History, AlertCircle, Shield } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface AttendedEvent {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string;
  end_date: string;
  role: string;
}

interface ParticipantSuggestion {
  participant_id: number;
  full_name: string;
  office: string;
  position: string;
}

interface NameLookupProps {
    isInternal?: boolean;
}

const NameLookup: React.FC<NameLookupProps> = ({ isInternal = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<ParticipantSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantSuggestion | null>(null);
  const [attendedEvents, setAttendedEvents] = useState<AttendedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside suggestions closer
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch suggestions as user types
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchTerm.length < 2) {
        setSuggestions([]);
        return;
      }

      setSearching(true);
      try {
        // Query participants who have at least one record in attendance_logs
        const { data, error } = await supabase
          .from('participants')
          .select(`
            participant_id,
            full_name,
            office,
            position,
            attendance_logs!inner(attendance_id)
          `)
          .ilike('full_name', `%${searchTerm}%`)
          .limit(8);

        if (!error && data) {
          const uniqueParticipants = data.map((p: any) => ({
            participant_id: p.participant_id,
            full_name: p.full_name,
            office: p.office || 'N/A',
            position: p.position || 'N/A'
          }));
          setSuggestions(uniqueParticipants);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error("Error fetching suggestions", err);
      } finally {
        setSearching(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSelectParticipant = async (participant: ParticipantSuggestion) => {
    setSelectedParticipant(participant);
    // Keep the search term visible during loading for context, then clear it after
    setShowSuggestions(false);
    setLoading(true);

    try {
      // 1. Get IDs of events the participant actually attended (scanned into)
      const { data: logsData } = await supabase
        .from('attendance_logs')
        .select('event_id')
        .eq('participant_id', participant.participant_id);
      
      const attendedEventIds = Array.from(new Set((logsData || []).map(l => l.event_id).filter(id => id !== null)));

      if (attendedEventIds.length === 0) {
        setAttendedEvents([]);
        setSearchTerm(''); // Clear if no events
        setLoading(false);
        return;
      }

      // 2. Fetch event details and roles from event_participants
      const { data: epData, error: epError } = await supabase
        .from('event_participants')
        .select(`
          role,
          event_id,
          events (
            event_id,
            event_name,
            venue,
            start_date,
            end_date
          )
        `)
        .eq('participant_id', participant.participant_id)
        .in('event_id', attendedEventIds);

      if (epError) throw epError;

      if (epData) {
        const mapped = epData.map((item: any) => ({
          event_id: item.events.event_id,
          event_name: item.events.event_name,
          venue: item.events.venue,
          start_date: item.events.start_date,
          end_date: item.events.end_date,
          role: item.role
        }));
        setAttendedEvents(mapped);
        setSearchTerm(''); // Clear the search bar when data is loaded
      }
    } catch (err) {
      console.error("Error fetching attended events", err);
    } finally {
      setLoading(false);
    }
  };

  const formatEventDate = (start: string, end: string) => {
    const startDate = parseISO(start);
    if (start === end || !end) return format(startDate, 'MMMM d, yyyy');
    return `${format(startDate, 'MMM d')} - ${format(parseISO(end), 'MMM d, yyyy')}`;
  };

  const contentClass = isInternal 
    ? "w-full max-w-4xl space-y-8" 
    : "min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8 w-full";

  return (
    <div className={contentClass}>
      {/* Brand Header - Only show if public */}
      {!isInternal && (
        <div className="w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between mb-12 gap-6">
            <div className="flex items-center gap-4">
            <div className="w-16 h-16 flex-shrink-0">
                <img 
                src="/assets/dilg_logo.png" 
                alt="DILG Logo" 
                className="w-full h-full object-contain" 
                />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">DILG Region 10</h1>
                <p className="text-sm text-indigo-600 font-semibold tracking-wide uppercase">Attendance History Portal</p>
            </div>
            </div>
            <div className="hidden sm:block text-right">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Public Access Service</p>
            <p className="text-xs text-slate-500 mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            </div>
        </div>
      )}

      <div className={isInternal ? "w-full space-y-8" : "w-full max-w-2xl space-y-8"}>
        {/* Search Section */}
        <div className="relative" ref={dropdownRef}>
          <div className={isInternal ? "mb-6" : "text-center mb-6"}>
            <h2 className="text-3xl font-black text-slate-800 mb-2">Participant Name Lookup</h2>
            <p className="text-slate-500">Verify attendance history across all Regional events.</p>
          </div>
          
          <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              {searching ? <Loader2 size={24} className="animate-spin" /> : <Search size={24} />}
            </div>
            <input 
              type="text"
              placeholder="Enter full name to search..."
              className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl text-lg font-medium shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => {
                const value = e.target.value;
                setSearchTerm(value);
                if (selectedParticipant && value !== '' && value !== selectedParticipant.full_name) {
                  setSelectedParticipant(null);
                  setAttendedEvents([]);
                }
              }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            />
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 border-b border-slate-50 bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suggested Names from Records</span>
              </div>
              <ul className="max-h-72 overflow-y-auto">
                {suggestions.map((p) => (
                  <li 
                    key={p.participant_id}
                    onClick={() => handleSelectParticipant(p)}
                    className="px-4 py-4 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                        {p.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 group-hover:text-indigo-700">{p.full_name}</div>
                        <div className="text-xs text-slate-500 line-clamp-1">{p.office} • {p.position}</div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin mb-4" size={40} />
              <p className="font-medium">Retrieving attendance logs...</p>
            </div>
          ) : selectedParticipant ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Profile Card Summary */}
              <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 mb-8 flex flex-col sm:flex-row items-center gap-6">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center text-3xl font-black">
                  {selectedParticipant.full_name.charAt(0)}
                </div>
                <div className="text-center sm:text-left flex-1">
                  <h3 className="text-2xl font-bold">{selectedParticipant.full_name}</h3>
                  <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-2 text-indigo-100 text-sm">
                    <span className="flex items-center gap-1 font-medium">{selectedParticipant.position}</span>
                    <span className="hidden sm:inline opacity-40">•</span>
                    <span className="flex items-center gap-1"><Landmark size={14} /> {selectedParticipant.office}</span>
                  </div>
                </div>
                <div className="bg-white/10 px-4 py-2 rounded-2xl text-center">
                  <p className="text-[10px] font-bold uppercase opacity-60">Events Attended</p>
                  <p className="text-2xl font-black">{attendedEvents.length}</p>
                </div>
              </div>

              <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                <History className="text-indigo-600" size={20} /> Event History
              </h4>

              {attendedEvents.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {attendedEvents.map((event) => (
                    <div key={event.event_id} className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1">
                        <h5 className="font-bold text-slate-900 text-lg mb-1">{event.event_name}</h5>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1.5"><Calendar size={14} className="text-indigo-500" /> {formatEventDate(event.start_date, event.end_date)}</span>
                          <span className="flex items-center gap-1.5"><MapPin size={14} className="text-slate-400" /> {event.venue}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-0 border-slate-50">
                        <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                           <Shield size={14} className="text-indigo-600" />
                           <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{event.role}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-400">
                  <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">No event attendance records found for this name.</p>
                  <p className="text-sm mt-1">Attendance might still be syncing or logs are unavailable.</p>
                </div>
              )}
            </div>
          ) : searchTerm.length >= 2 && suggestions.length === 0 && !searching ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-start gap-4 animate-in shake duration-500">
              <AlertCircle className="text-amber-500 shrink-0 mt-1" size={24} />
              <div>
                <h4 className="font-bold text-amber-800">No matching name found in attendance records</h4>
                <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                  Make sure you've spelled your name correctly. Only participants who have already registered and been scanned in at least one event will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 opacity-30 select-none pointer-events-none">
              <Landmark size={80} className="text-slate-300 mb-4" />
              <p className="text-xl font-bold text-slate-400">Search to view results</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer - Only show if public */}
      {!isInternal && (
        <footer className="w-full max-w-4xl mt-auto pt-12 pb-6 text-center">
            <p className="text-xs text-slate-400 font-medium">© {new Date().getFullYear()} Department of the Interior and Local Government Region 10</p>
            <p className="text-[10px] text-slate-400 mt-1">Regional Information and Communication Technology Unit</p>
        </footer>
      )}
    </div>
  );
};

export default NameLookup;
