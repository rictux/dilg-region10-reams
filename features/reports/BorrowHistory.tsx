import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { borrowService, BorrowHistory } from '../../lib/borrowService';
import { useAuth } from '../../contexts/AuthContext';
import { Event } from '../../types/database';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import {
  Download,
  Filter,
  AlertCircle,
  CheckCircle,
  Package,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

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

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    if (!user?.office_id) {
      setLoadingEvents(false);
      return;
    }

    setLoadingEvents(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organize_by', user.office_id)
      .or('status.eq.Ongoing,status.eq.Completed')
      .order('start_date', { ascending: false });

    if (!error && data) {
      setEvents(data);
      if (data.length > 0 && !selectedEventId) {
        setSelectedEventId(data[0].event_id);
      }
    }
    setLoadingEvents(false);
  };

  useEffect(() => {
    if (selectedEventId) {
      loadHistory();
    }
  }, [selectedEventId]);

  useEffect(() => {
    filterHistory();
  }, [history, filterStatus, searchTerm]);

  const loadHistory = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    const records = await borrowService.getBorrowHistory(selectedEventId);
    setHistory(records);
    setLoading(false);
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Borrow History</h1>
          <p className="text-sm text-slate-600 mt-1">
            No ongoing or completed events available
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Borrow History</h1>
          <p className="text-sm text-slate-600 mt-1">
            Track all item borrowing and return transactions for this event
          </p>
        </div>
        <div className="w-64">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Select Event
          </label>
          <select
            value={selectedEventId || ''}
            onChange={(e) => setSelectedEventId(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {events.map((event) => (
              <option key={event.event_id} value={event.event_id}>
                {event.event_name}
              </option>
            ))}
          </select>
        </div>
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
