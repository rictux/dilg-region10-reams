
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Printer, Calendar, ScrollText, Search, ChevronDown, Check, X } from 'lucide-react';
import { Event } from '../../types/database';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

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
    let query = supabase.from('events').select('*').order('start_date', { ascending: false });

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
    const url = selectedEventId ? `/print-scan-logs/${selectedEventId}` : '/print-scan-logs';
    navigate(url);
  };

  const handlePrintAttendance = () => {
    if (selectedEventId) {
        navigate(`/print-attendance/${selectedEventId}`);
    }
  };

  const filteredEvents = events.filter(e => 
    e.event_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedEvent = events.find(e => e.event_id.toString() === selectedEventId);

  return (
    <div className="space-y-8">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Reports Center</h2>
            <p className="text-slate-500 mt-1">Generate and export attendance documentation.</p>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Report Settings</h3>
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:w-1/2 lg:w-1/3">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Event</label>
                    
                    {/* Custom Searchable Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <div 
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 flex justify-between items-center cursor-pointer hover:border-indigo-400 transition-colors"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <Calendar className="text-slate-400 shrink-0" size={18} />
                                <span className={`truncate ${!selectedEventId ? 'text-slate-500' : 'text-slate-800'}`}>
                                    {selectedEvent ? selectedEvent.event_name : "-- Select Event --"}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
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
                                <ChevronDown className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} size={16} />
                            </div>
                        </div>

                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                {/* Search Input */}
                                <div className="p-2 border-b border-slate-100 bg-slate-50">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Search event..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </div>

                                {/* List */}
                                <div className="max-h-60 overflow-y-auto">
                                    <div 
                                        className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 transition-colors ${!selectedEventId ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-slate-500'}`}
                                        onClick={() => {
                                            setSelectedEventId('');
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        -- Select Event --
                                    </div>
                                    {filteredEvents.length > 0 ? (
                                        filteredEvents.map(e => (
                                            <div 
                                                key={e.event_id}
                                                className={`px-4 py-2.5 text-sm cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50 transition-colors flex items-center justify-between group
                                                    ${selectedEventId === e.event_id.toString() ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}
                                                `}
                                                onClick={() => {
                                                    setSelectedEventId(e.event_id.toString());
                                                    setIsDropdownOpen(false);
                                                }}
                                            >
                                                <span className="truncate pr-2">{e.event_name}</span>
                                                {selectedEventId === e.event_id.toString() && <Check size={16} className="text-indigo-600 shrink-0" />}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                                            No events found matching "{searchTerm}"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
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

        </div>
    </div>
  );
};

export default Reports;
