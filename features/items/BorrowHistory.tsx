import React, { useEffect, useRef, useState } from 'react';
import { borrowService, BorrowHistory } from '../../lib/borrowService';
import { useAuth } from '../../contexts/AuthContext';
import { ALL_EVENT_ACCESS_ROLES, fetchAccessibleEvents } from '../../lib/eventAccess';
import { Event } from '../../types/database';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import {
  Download,
  Filter,
  AlertCircle,
  CheckCircle,
  Package,
  Calendar,
  ChevronDown,
  Check,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

/** Matches the Attendance tab's event label: "Mar. 3-5, 2026". */
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
  if (isSameYear(startDate, endDate)) {
    return `${format(startDate, 'MMM. d')} - ${format(endDate, 'MMM. d, yyyy')}`;
  }
  return `${format(startDate, 'MMM. d, yyyy')} - ${format(endDate, 'MMM. d, yyyy')}`;
};

interface BorrowHistoryPageProps {
  eventId?: number;
}

const BorrowHistoryPage: React.FC<BorrowHistoryPageProps> = ({ eventId: initialEventId }) => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(initialEventId || null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [history, setHistory] = useState<BorrowHistory[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<BorrowHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'unreturned' | 'returned'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Event picker (mirrors the Attendance tab's searchable dropdown)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [eventSearchTerm, setEventSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [user]);

  // Must match how the Scanner picks events, or a borrow recorded against an
  // event the user scans by assignment lands in a report they cannot open.
  // fetchAccessibleEvents covers all three routes: Admin, own office, and an
  // explicit event_user_access row. That set is then narrowed to events that
  // actually have borrows, so the picker never offers an empty report.
  const loadEvents = async () => {
    if (!user) {
      setLoadingEvents(false);
      return;
    }

    setLoadingEvents(true);
    try {
      const [accessible, eventIdsWithBorrows] = await Promise.all([
        fetchAccessibleEvents(user, {
          accessRoles: ALL_EVENT_ACCESS_ROLES,
          deletedView: 'active',
          excludeCancelled: true,
          orderBy: 'start_date',
          ascending: false
        }),
        borrowService.getEventIdsWithBorrows()
      ]);

      const withBorrows = new Set(eventIdsWithBorrows);
      const selectable = accessible.filter((e) => withBorrows.has(e.event_id));

      setEvents(selectable);
      setSelectedEventId((current) => {
        if (current && selectable.some((e) => e.event_id === current)) return current;
        return selectable[0]?.event_id ?? null;
      });
    } catch (err) {
      console.error('Failed to load events:', err);
      toast.error('Could not load events.');
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadHistory();
    } else {
      setHistory([]);
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    filterHistory();
  }, [history, filterStatus, searchTerm]);

  const loadHistory = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const records = await borrowService.getBorrowHistory(selectedEventId);
      setHistory(records);
    } catch (err) {
      console.error('Failed to load borrow history:', err);
      setHistory([]);
      toast.error('Could not load borrow history for this event.');
    } finally {
      setLoading(false);
    }
  };

  const filterHistory = () => {
    let filtered = history;

    // Filter by status
    if (filterStatus === 'unreturned') {
      filtered = filtered.filter((h) => h.status === 'Unreturned');
    } else if (filterStatus === 'returned') {
      filtered = filtered.filter((h) => h.status === 'Returned');
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (h) =>
          h.participant_name.toLowerCase().includes(term) ||
          h.item_name.toLowerCase().includes(term)
      );
    }

    setFilteredHistory(filtered);
  };

  const exportToCSV = () => {
    const headers = [
      'Participant',
      'Item',
      'Borrowed At',
      'Returned At',
      'Duration (minutes)',
      'Status',
    ];

    const rows = filteredHistory.map((h) => [
      h.participant_name,
      h.item_name,
      format(new Date(h.borrowed_at), 'yyyy-MM-dd HH:mm:ss'),
      h.returned_at
        ? format(new Date(h.returned_at), 'yyyy-MM-dd HH:mm:ss')
        : 'Not returned',
      h.duration_minutes,
      h.status,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `borrow-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Exported to CSV');
  };

  const selectedEvent = events.find((e) => e.event_id === selectedEventId) || null;
  const filteredEvents = events.filter((e) =>
    e.event_name.toLowerCase().includes(eventSearchTerm.toLowerCase())
  );

  const unreturned = filteredHistory.filter((h) => h.status === 'Unreturned').length;
  const totalDuration = filteredHistory.reduce((acc, h) => acc + h.duration_minutes, 0);

  if (loadingEvents) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">Loading events...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
        <p className="font-medium text-slate-600">No borrowing recorded yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Events appear here once an item has been borrowed against them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Event picker, styled to match the Attendance tab. */}
      <div className="relative w-full max-w-[32rem]" ref={dropdownRef}>
        <div
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-300 bg-card px-3 py-1.5 shadow-sm transition-colors hover:border-indigo-400 sm:px-4 sm:py-2"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Calendar className="shrink-0 text-slate-400" size={16} />
            <span className={`min-w-0 flex-1 truncate text-[11px] leading-snug sm:text-xs lg:text-sm ${
              selectedEvent ? 'font-medium text-slate-800' : 'text-slate-500'
            }`}>
              {selectedEvent ? selectedEvent.event_name : '-- Select Event --'}
            </span>
          </div>
          <ChevronDown
            className={`ml-2 shrink-0 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            size={14}
          />
        </div>

        {isDropdownOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-card shadow-xl animate-in fade-in zoom-in-95 duration-100">
            <div className="sticky top-0 border-b border-slate-100 bg-slate-50 p-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search event..."
                  value={eventSearchTerm}
                  onChange={(e) => setEventSearchTerm(e.target.value)}
                  className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-14 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {eventSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setEventSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-500 transition-colors hover:text-indigo-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[30rem] overflow-y-auto">
              {filteredEvents.length > 0 ? (
                filteredEvents.map((e) => (
                  <div
                    key={e.event_id}
                    onClick={() => {
                      setSelectedEventId(e.event_id);
                      setIsDropdownOpen(false);
                      setEventSearchTerm('');
                    }}
                    className={`flex cursor-pointer items-center justify-between border-b border-slate-50 px-4 py-2 text-xs transition-colors last:border-0 hover:bg-indigo-50 ${
                      selectedEventId === e.event_id ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700'
                    }`}
                  >
                    <div className="mr-2 w-full overflow-hidden">
                      <p className="whitespace-normal break-words leading-snug">{e.event_name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {formatEventDate(e.start_date, e.end_date)}
                      </p>
                    </div>
                    {selectedEventId === e.event_id && (
                      <Check size={14} className="shrink-0 text-indigo-600" />
                    )}
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase">Total Borrows</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {filteredHistory.length}
              </p>
            </div>
            <Package className="w-8 h-8 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase">
                Unreturned Items
              </p>
              <p className="text-2xl font-bold text-red-600 mt-1">{unreturned}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase">
                Avg Duration
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {filteredHistory.length > 0
                  ? Math.round(totalDuration / filteredHistory.length)
                  : 0}{' '}
                min
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Filters & Controls */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Filters:</span>
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Status Filter */}
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as 'all' | 'unreturned' | 'returned')
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="all">All</option>
              <option value="returned">Returned</option>
              <option value="unreturned">Unreturned</option>
            </select>
          </div>

          {/* Search */}
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Search
            </label>
            <input
              type="text"
              placeholder="Participant or item name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="text-slate-600">Loading history...</div>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No records found</p>
          <p className="text-sm text-slate-500 mt-1">
            {history.length === 0
              ? 'No borrowing records yet for this event'
              : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                  Participant
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                  Item
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                  Borrowed
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                  Returned
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                  Duration
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredHistory.map((record) => (
                <tr key={record.borrow_id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                    {record.participant_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {record.item_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {format(new Date(record.borrowed_at), 'MMM dd, HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {record.returned_at
                      ? format(new Date(record.returned_at), 'MMM dd, HH:mm')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDurationMinutes(record.duration_minutes)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {record.status === 'Returned' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Returned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded text-xs font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Unreturned
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {filteredHistory.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Showing {filteredHistory.length}</strong> of{' '}
            <strong>{history.length}</strong> total records
            {unreturned > 0 && (
              <>
                • <strong>{unreturned} unreturned items</strong> require follow-up
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

// Helper to format duration nicely
function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

export default BorrowHistoryPage;
