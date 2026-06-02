
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Printer, Calendar, ScrollText, Search, ChevronDown, Check, X } from 'lucide-react';
import { Event } from '../../types/database';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  
  // Initialize from session storage if available
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    return sessionStorage.getItem('reports_selected_event_id') || '';
  });
  
  const [loading, setLoading] = useState(true);

  // Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
        fetchEvents();
    }

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [user]);

  // Persist selection change
  useEffect(() => {
    sessionStorage.setItem('reports_selected_event_id', selectedEventId);
  }, [selectedEventId]);

  const fetchEvents = async () => {
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
    if (data) {
        setEvents(data);
    }
    setLoading(false);
  };

  const handlePrintScanLogs = () => {
    sessionStorage.setItem('reports_selected_event_id', selectedEventId);
    const url = selectedEventId ? `/print-scan-logs/${selectedEventId}` : '/print-scan-logs';
    navigate(url);
  };

  const handlePrintAttendance = () => {
    if (selectedEventId) {
        sessionStorage.setItem('reports_selected_event_id', selectedEventId);
        navigate(`/print-attendance/${selectedEventId}`);
    }
  };

  const handlePrintCertificate = () => {
    if (selectedEventId) {
        sessionStorage.setItem('reports_selected_event_id', selectedEventId);
        navigate(`/print-certificate/${selectedEventId}`);
    }
  };

  const formatEventDate = (start: string, end: string) => {
    if (!start) return '';

    try {
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
    } catch {
      return start;
    }
  };

  const getEventDateLabel = (event: Event) => formatEventDate(event.start_date, event.end_date);
  const getEventDropdownLabel = (event: Event) => `${event.event_name} ${getEventDateLabel(event)}`;

  const filteredEvents = events.filter(e => 
    getEventDropdownLabel(e).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedEvent = events.find(e => e.event_id.toString() === selectedEventId);

  useEffect(() => {
    if (!loading && selectedEventId && !selectedEvent) {
      setSelectedEventId('');
    }
  }, [loading, selectedEvent, selectedEventId]);

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 space-y-8">
        {/* Filters */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full max-w-4xl">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Event</label>
                    
                    {/* Custom Searchable Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <div 
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 flex justify-between items-center cursor-pointer hover:border-indigo-400 transition-colors shadow-sm"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        >
                            <div className="flex items-start gap-2 flex-1 overflow-hidden">
                                <Calendar className="text-slate-400 shrink-0 mt-0.5" size={16} />
                                <span className={`whitespace-normal break-words text-sm leading-snug ${!selectedEventId ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                                    {selectedEvent ? (
                                      <>
                                        <span>{selectedEvent.event_name}</span>
                                        <span className="block text-xs text-slate-400 italic mt-0.5 font-normal">
                                          {getEventDateLabel(selectedEvent)}
                                        </span>
                                      </>
                                    ) : "-- Select Event --"}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                {selectedEventId && (
                                    <span 
                                        className="p-1 hover:bg-slate-200 rounded-full text-slate-400"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedEventId('');
                                        }}
                                    >
                                        <X size={14} />
                                    </span>
                                )}
                                <ChevronDown className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} size={14} />
                            </div>
                        </div>

                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                {/* Search Input */}
                                <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Search event..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-8 pr-14 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        {searchTerm && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSearchTerm('');
                                                }}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* List */}
                                <div className="max-h-[32rem] overflow-y-auto">
                                    <div 
                                        className={`px-4 py-2 text-xs cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors ${!selectedEventId ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-slate-500'}`}
                                        onClick={() => {
                                            setSelectedEventId('');
                                            setSearchTerm('');
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        -- Select Event --
                                    </div>
                                    {filteredEvents.length > 0 ? (
                                        filteredEvents.map(e => (
                                            <div 
                                                key={e.event_id}
                                                className={`px-4 py-2 text-xs cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50 transition-colors flex items-center justify-between group
                                                    ${selectedEventId === e.event_id.toString() ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}
                                                `}
                                                onClick={() => {
                                                    setSelectedEventId(e.event_id.toString());
                                                    setSearchTerm('');
                                                    setIsDropdownOpen(false);
                                                }}
                                            >
                                                <div className="overflow-hidden w-full mr-2">
                                                    <p className="whitespace-normal break-words leading-snug">{e.event_name}</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5 italic">{getEventDateLabel(e)}</p>
                                                </div>
                                                {selectedEventId === e.event_id.toString() && <Check size={14} className="text-indigo-600 shrink-0" />}
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
                </div>
            </div>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Print Scan Logs Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-start hover:border-indigo-200 transition-colors">
                <div className="bg-emerald-100 p-3 rounded-lg text-emerald-600 mb-4">
                    <ScrollText size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Print Scan Logs</h3>
                <p className="text-slate-500 text-sm mb-6 flex-1">
                    Generate a detailed log of every scan transaction, including timestamps, scanner operator details, and participant info.
                </p>
                <button 
                    onClick={handlePrintScanLogs}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-2 font-medium transition-colors"
                >
                    <Printer size={18} /> Print Scan Logs
                </button>
            </div>

            {/* Print Attendance Sheet Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-start hover:border-indigo-200 transition-colors">
                <div className="bg-indigo-100 p-3 rounded-lg text-indigo-600 mb-4">
                    <Printer size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Attendance Sheets</h3>
                <p className="text-slate-500 text-sm mb-6 flex-1">
                    Generate official printable attendance sheets formatted for DILG Region 10 requirements. 
                    {selectedEventId ? ' Creates a specific report for the selected event.' : ' Please select an event first.'}
                </p>
                <button 
                    onClick={handlePrintAttendance}
                    disabled={!selectedEventId}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-2 font-medium transition-colors"
                >
                    <Printer size={18} /> Print Attendance Sheet
                </button>
            </div>

            {/* Print Certificate of Appearance Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-start hover:border-indigo-200 transition-colors">
                <div className="bg-amber-100 p-3 rounded-lg text-amber-600 mb-4">
                    <ScrollText size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Certificate of Appearance</h3>
                <p className="text-slate-500 text-sm mb-6 flex-1">
                    Generate Certificates of Appearance for participants who have attendance logs. Two certificates per A4 page.
                    {selectedEventId ? ' Creates certificates for the selected event.' : ' Please select an event first.'}
                </p>
                <button 
                    onClick={handlePrintCertificate}
                    disabled={!selectedEventId}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-2 font-medium transition-colors"
                >
                    <Printer size={18} /> Print Certificates
                </button>
            </div>

        </div>
    </div>
  );
};

export default Reports;
