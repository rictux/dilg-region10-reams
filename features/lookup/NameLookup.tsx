
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchTerm.length < 2) {
        setSuggestions([]);
        return;
      }

      setSearching(true);
      try {
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
    setShowSuggestions(false);
    setLoading(true);

    try {
      const { data: logsData } = await supabase
        .from('attendance_logs')
        .select('event_id')
        .eq('participant_id', participant.participant_id);
      
      const attendedEventIds = Array.from(new Set((logsData || []).map(l => l.event_id).filter(id => id !== null)));

      if (attendedEventIds.length === 0) {
        setAttendedEvents([]);
        setSearchTerm(''); 
        setLoading(false);
        return;
      }

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
        setSearchTerm(''); 
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
    ? "w-full max-w-5xl space-y-6" 
    : "min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8 w-full";

  return (
    <div className={contentClass}>
      {!isInternal && (
        <div className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex-shrink-0">
                <img 
                src="/assets/dilg_logo.png" 
                alt="DILG Logo" 
                className="w-full h-full object-contain" 
                />
            </div>
            <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">DILG Region 10</h1>
                <p className="text-xs text-indigo-600 font-semibold tracking-wide uppercase">Attendance History Portal</p>
            </div>
            </div>
            <div className="hidden sm:block text-right">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Public Access Service</p>
            <p className="text-xs text-slate-500 mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            </div>
        </div>
      )}

      <div className={isInternal ? "w-full space-y-6" : "w-full max-w-5xl space-y-6"}>
        <div className="relative" ref={dropdownRef}>
          <div className="text-center mb-4">
            <p className="text-sm text-slate-500">Verify attendance history across all Regional events.</p>
          </div>
          
          <div className="relative group max-w-2xl mx-auto">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            </div>
            <input 
              type="text"
              placeholder="Enter full name to search..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400"
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

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-full max-w-2xl mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2 border-b border-slate-50 bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suggested Names from Records</span>
              </div>
              <ul className="max-h-60 overflow-y-auto">
                {suggestions.map((p) => (
                  <li 
                    key={p.participant_id}
                    onClick={() => handleSelectParticipant(p)}
                    className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                        {p.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-800 group-hover:text-indigo-700">{p.full_name}</div>
                        <div className="text-xs text-slate-500 line-clamp-1">{p.office} • {p.position}</div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mb-3" size={32} />
              <p className="text-sm font-medium">Retrieving attendance logs...</p>
            </div>
          ) : selectedParticipant ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-center gap-5">
                <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xl font-bold">
                  {selectedParticipant.full_name.charAt(0)}
                </div>
                <div className="text-center sm:text-left flex-1">
                  <h3 className="text-lg font-bold text-slate-900">{selectedParticipant.full_name}</h3>
                  <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-1 text-slate-600 text-sm">
                    <span className="flex items-center gap-1 font-medium">{selectedParticipant.position}</span>
                    <span className="hidden sm:inline text-slate-300">•</span>
                    <span className="flex items-center gap-1"><Landmark size={14} className="text-slate-400" /> {selectedParticipant.office}</span>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-lg text-center min-w-[120px]">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Events Attended</p>
                  <p className="text-xl font-bold text-indigo-600">{attendedEvents.length}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <History className="text-indigo-600" size={18} />
                    <h4 className="text-sm font-bold text-slate-800">Event History</h4>
                </div>
                
                {attendedEvents.length > 0 ? (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm text-left min-w-[600px]">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-5 py-3 w-1/3">Event Name</th>
                                <th className="px-5 py-3 w-1/4">Date</th>
                                <th className="px-5 py-3 w-1/4">Venue</th>
                                <th className="px-5 py-3 w-auto">Role</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {attendedEvents.map((event) => (
                                <tr key={event.event_id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-4 font-medium text-slate-800 align-top">
                                        <div className="whitespace-normal break-words">{event.event_name}</div>
                                    </td>
                                    <td className="px-5 py-4 text-slate-600 align-top">
                                        <div className="flex items-start gap-1.5">
                                            <Calendar size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                            <span className="whitespace-normal break-words">{formatEventDate(event.start_date, event.end_date)}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-slate-600 align-top">
                                        <div className="flex items-start gap-1.5">
                                            <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                            <span className="whitespace-normal break-words">{event.venue}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 align-top">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100 whitespace-nowrap">
                                            <Shield size={12} />
                                            {event.role}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    <Calendar size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium text-slate-600">No event attendance records found.</p>
                    <p className="text-xs mt-1">Attendance might still be syncing or logs are unavailable.</p>
                  </div>
                )}
              </div>
            </div>
          ) : searchTerm.length >= 2 && suggestions.length === 0 && !searching ? (
            <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in duration-300">
              <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-sm font-bold text-amber-800">No matching name found</h4>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  Make sure you've spelled your name correctly. Only participants who have already registered and been scanned in at least one event will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 opacity-40 select-none pointer-events-none">
              <Search size={48} className="text-slate-300 mb-4" />
              <p className="text-sm font-medium text-slate-500">Search to view attendance history</p>
            </div>
          )}
        </div>
      </div>

      {!isInternal && (
        <footer className="w-full max-w-5xl mt-auto pt-8 pb-4 text-center border-t border-slate-200/60">
            <p className="text-xs text-slate-500 font-medium">© {new Date().getFullYear()} Department of the Interior and Local Government Region 10</p>
            <p className="text-[10px] text-slate-400 mt-1">Regional Information and Communication Technology Unit</p>
        </footer>
      )}
    </div>
  );
};

export default NameLookup;
