import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Search,
  Calendar,
  MapPin,
  ChevronRight,
  Loader2,
  Landmark,
  History,
  AlertCircle,
  Shield,
  ScanLine,
  RefreshCw,
  Camera,
  X
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import QrScanner from '../events/QrScanner';

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
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<ParticipantSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantSuggestion | null>(null);
  const [attendedEvents, setAttendedEvents] = useState<AttendedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortEvents = (events: AttendedEvent[]) => {
    return [...events].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  };

  const loadParticipantHistory = async (participant: ParticipantSuggestion) => {
    setSelectedParticipant(participant);
    setShowSuggestions(false);
    setLoading(true);

    try {
      const { data: logsData } = await supabase
        .from('attendance_logs')
        .select('event_id')
        .eq('participant_id', participant.participant_id);

      const attendedEventIds = Array.from(
        new Set((logsData || []).map((log) => log.event_id).filter((id) => id !== null))
      );

      if (attendedEventIds.length === 0) {
        setAttendedEvents([]);
        setSearchTerm('');
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
        let mapped = epData.map((item: any) => ({
          event_id: item.events.event_id,
          event_name: item.events.event_name,
          venue: item.events.venue,
          start_date: item.events.start_date,
          end_date: item.events.end_date,
          role: item.role
        }));

        const eventIdParam = searchParams.get('event');
        if (eventIdParam) {
          mapped = mapped.filter((event) => event.event_id === parseInt(eventIdParam));
        }

        setAttendedEvents(sortEvents(mapped));
        setSearchTerm('');
      }
    } catch (err) {
      console.error('Error fetching attended events', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectParticipant = async (participant: ParticipantSuggestion) => {
    setScannerError(null);
    setScannerMessage(null);
    await loadParticipantHistory(participant);
  };

  const handlePublicScan = async (decodedText: string) => {
    const qrValue = decodedText.trim();

    setScannerActive(false);
    setScannerError(null);
    setScannerMessage('QR code scanned. Looking up participant records...');
    setSelectedParticipant(null);
    setAttendedEvents([]);
    setLoading(true);

    try {
      const parsedUrl = qrValue.startsWith('http') ? new URL(qrValue) : null;
      const participantIdFromUrl = parsedUrl?.searchParams.get('participant');

      let query = supabase
        .from('participants')
        .select('participant_id, full_name, office, position');

      if (participantIdFromUrl && !Number.isNaN(Number(participantIdFromUrl))) {
        query = query.eq('participant_id', Number(participantIdFromUrl));
      } else {
        query = query.eq('participant_code', qrValue);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        throw new Error('Participant not found for this QR code.');
      }

      setScannerMessage(`Showing attendance history for ${data.full_name}.`);

      await loadParticipantHistory({
        participant_id: data.participant_id,
        full_name: data.full_name,
        office: data.office || 'N/A',
        position: data.position || 'N/A'
      });
    } catch (err: any) {
      console.error('Error fetching participant from QR', err);
      setScannerError(err.message || 'Unable to find participant from the scanned QR code.');
      setLoading(false);
    }
  };

  const resetPublicScanner = () => {
    setScannerActive(true);
    setScannerMessage(null);
    setScannerError(null);
    setSelectedParticipant(null);
    setAttendedEvents([]);
    setScannerKey((prev) => prev + 1);
  };

  const openPublicScanner = () => {
    setScannerActive(true);
    setScannerMessage(null);
    setScannerError(null);
    setScannerKey((prev) => prev + 1);
  };

  const closePublicScanner = () => {
    setScannerActive(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const participantIdParam = searchParams.get('participant');
    const participantCodeParam = searchParams.get('participant_code') || searchParams.get('code');

    if (!participantIdParam && !participantCodeParam) {
      return;
    }

    setScannerActive(false);

    const fetchParticipant = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('participants')
          .select('participant_id, full_name, office, position');

        if (participantIdParam) {
          query = query.eq('participant_id', parseInt(participantIdParam));
        } else if (participantCodeParam) {
          query = query.eq('participant_code', participantCodeParam);
        }

        const { data, error } = await query.single();

        if (data && !error) {
          await loadParticipantHistory({
            participant_id: data.participant_id,
            full_name: data.full_name,
            office: data.office || 'N/A',
            position: data.position || 'N/A'
          });
        } else {
          setScannerError('Participant not found from the provided lookup link.');
        }
      } catch (err) {
        console.error('Error fetching participant from URL', err);
        setScannerError('Unable to load participant from the provided lookup link.');
      } finally {
        setLoading(false);
      }
    };

    fetchParticipant();
  }, [searchParams]);

  useEffect(() => {
    if (!isInternal) {
      return;
    }

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
          const uniqueParticipants = data.map((participant: any) => ({
            participant_id: participant.participant_id,
            full_name: participant.full_name,
            office: participant.office || 'N/A',
            position: participant.position || 'N/A'
          }));
          setSuggestions(uniqueParticipants);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Error fetching suggestions', err);
      } finally {
        setSearching(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, isInternal]);

  const formatEventDate = (start: string, end: string) => {
    const startDate = parseISO(start);
    if (start === end || !end) return format(startDate, 'MMMM d, yyyy');
    return `${format(startDate, 'MMM d')} - ${format(parseISO(end), 'MMM d, yyyy')}`;
  };

  const contentClass = isInternal
    ? 'w-full h-full min-h-0 flex flex-col gap-6'
    : 'min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8 w-full';

  const renderPublicTimeline = () => {
    if (attendedEvents.length === 0) {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium text-slate-600">No event attendance records found.</p>
          <p className="text-xs mt-1">Attendance might still be syncing or logs are unavailable.</p>
        </div>
      );
    }

    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-center gap-2 mb-6">
          <History className="text-indigo-600" size={18} />
          <h4 className="text-base font-bold text-slate-800">Historical View</h4>
        </div>

        <div className="relative">
          <div className="absolute left-[19px] top-1 bottom-1 w-px bg-slate-200"></div>
          <div className="space-y-5">
            {attendedEvents.map((event) => (
              <div key={event.event_id} className="relative pl-12">
                <div className="absolute left-0 top-1 w-10 h-10 rounded-full bg-indigo-100 border-4 border-white shadow-sm flex items-center justify-center">
                  <Calendar size={16} className="text-indigo-600" />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.18em]">Event</p>
                        <h5 className="text-lg font-bold text-slate-900 mt-1">{event.event_name}</h5>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="flex items-start gap-2 text-slate-600">
                          <Calendar size={16} className="text-slate-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-slate-800">Schedule</p>
                            <p>{formatEventDate(event.start_date, event.end_date)}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 text-slate-600">
                          <MapPin size={16} className="text-slate-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-slate-800">Venue</p>
                            <p>{event.venue}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100 whitespace-nowrap">
                        <Shield size={12} />
                        {event.role}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderInternalTable = () => {
    if (attendedEvents.length === 0) {
      return (
        <div className="p-8 text-center text-slate-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium text-slate-600">No event attendance records found.</p>
          <p className="text-xs mt-1">Attendance might still be syncing or logs are unavailable.</p>
        </div>
      );
    }

    return (
      <div className="flex-1 min-h-0 overflow-auto w-full">
        <table className="datatable w-full text-[13px] text-left min-w-[600px]">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
            <tr>
              <th className="px-5 py-3 w-[36%]">Event Name</th>
              <th className="px-5 py-3 w-[18%]">Date</th>
              <th className="px-5 py-3 w-[30%]">Venue</th>
              <th className="px-5 py-3 w-[16%]">Role</th>
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
    );
  };

  return (
    <div className={contentClass}>
      {!isInternal && (
        <div className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex-shrink-0">
              <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain" />
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

      <div className={isInternal ? 'w-full flex-1 min-h-0 flex flex-col gap-6' : 'w-full max-w-5xl space-y-6'}>
        {isInternal ? (
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
                className="w-full pl-10 pr-16 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  if (selectedParticipant && value !== '' && value !== selectedParticipant.full_name) {
                    setSelectedParticipant(null);
                    setAttendedEvents([]);
                  }
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setShowSuggestions(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-full max-w-2xl mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2 border-b border-slate-50 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suggested Names from Records</span>
                </div>
                <ul className="max-h-60 overflow-y-auto">
                  {suggestions.map((participant) => (
                    <li
                      key={participant.participant_id}
                      onClick={() => handleSelectParticipant(participant)}
                      className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                          {participant.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-800 group-hover:text-indigo-700">{participant.full_name}</div>
                          <div className="text-xs text-slate-500 line-clamp-1">{participant.office} &bull; {participant.position}</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium">
                  <ScanLine size={16} />
                  QR Verification
                </div>
                <h2 className="text-xl font-bold text-slate-900">Participant Event History</h2>
                <p className="text-sm text-slate-500 max-w-2xl">
                  Open the camera only when you want to scan a participant QR code. The main view below focuses on the participant&apos;s historical event record.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={scannerActive ? closePublicScanner : openPublicScanner}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                >
                  {scannerActive ? <X size={16} /> : <Camera size={16} />}
                  {scannerActive ? 'Close Camera' : 'Open Camera to Scan'}
                </button>
                {!scannerActive && selectedParticipant && (
                  <button
                    type="button"
                    onClick={resetPublicScanner}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 rounded-lg font-medium border border-slate-300 hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw size={16} />
                    Scan Another QR
                  </button>
                )}
              </div>
            </div>

            {scannerActive ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="max-w-xs mx-auto space-y-3">
                  <QrScanner key={scannerKey} onScanSuccess={handlePublicScan} />
                  <p className="text-xs text-center text-slate-500">
                    Point the camera at a participant QR code.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  <ScanLine size={18} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Camera scanner is closed.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Open it only when needed so the page stays focused on the participant&apos;s event history.
                  </p>
                </div>
              </div>
            )}

            {scannerMessage && !scannerError && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {scannerMessage}
              </div>
            )}

            {scannerError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {scannerError}
              </div>
            )}
          </div>
        )}

        <div className={isInternal ? 'flex-1 min-h-0 flex flex-col gap-6' : 'space-y-6'}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mb-3" size={32} />
              <p className="text-sm font-medium">Retrieving attendance logs...</p>
            </div>
          ) : selectedParticipant ? (
            <div className={isInternal ? 'animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 min-h-0 flex flex-col gap-6' : 'animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6'}>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col sm:flex-row items-center gap-5">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0">
                  {selectedParticipant.full_name.charAt(0)}
                </div>
                <div className="text-center sm:text-left flex-1">
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-[0.2em] mb-2">Participant Record</p>
                  <h3 className="text-xl font-bold text-slate-900">{selectedParticipant.full_name}</h3>
                  <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2 text-slate-600 text-sm">
                    <span className="flex items-center gap-1 font-medium">{selectedParticipant.position}</span>
                    <span className="hidden sm:inline text-slate-300">&bull;</span>
                    <span className="flex items-center gap-1"><Landmark size={14} className="text-slate-400" /> {selectedParticipant.office}</span>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 px-5 py-3 rounded-xl text-center min-w-[140px]">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Events Attended</p>
                  <p className="text-2xl font-bold text-indigo-600">{attendedEvents.length}</p>
                </div>
              </div>

              {isInternal ? (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <History className="text-indigo-600" size={18} />
                    <h4 className="text-sm font-bold text-slate-800">Event History</h4>
                  </div>
                  {renderInternalTable()}
                </div>
              ) : (
                renderPublicTimeline()
              )}
            </div>
          ) : isInternal && searchTerm.length >= 2 && suggestions.length === 0 && !searching ? (
            <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in duration-300">
              <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-sm font-bold text-amber-800">No matching name found</h4>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  Make sure you&apos;ve spelled your name correctly. Only participants who have already registered and been scanned in at least one event will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 opacity-40 select-none pointer-events-none">
              {isInternal ? (
                <>
                  <Search size={48} className="text-slate-300 mb-4" />
                  <p className="text-sm font-medium text-slate-500">Search to view attendance history</p>
                </>
              ) : (
                <>
                  <History size={48} className="text-slate-300 mb-4" />
                  <p className="text-sm font-medium text-slate-500">Open the camera and scan a QR code to view the participant&apos;s event history</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!isInternal && (
        <footer className="w-full max-w-5xl mt-auto pt-8 pb-4 text-center border-t border-slate-200/60">
          <p className="text-xs text-slate-500 font-medium">&copy; {new Date().getFullYear()} Department of the Interior and Local Government Region 10</p>
          <p className="text-[10px] text-slate-400 mt-1">Regional Information and Communication Technology Unit</p>
        </footer>
      )}
    </div>
  );
};

export default NameLookup;
