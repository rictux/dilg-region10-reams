import React, { useEffect, useMemo, useRef, useState } from 'react';
import { borrowService, BorrowHistory, formatBorrowDuration } from '../../lib/borrowService';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
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
  Undo2,
  X,
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
  const { user, hasPermission } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(initialEventId || null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [history, setHistory] = useState<BorrowHistory[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<BorrowHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'unreturned' | 'returned'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Manual returns. Viewing the log is a report permission; closing a loan from
  // it is a write, so it sits behind the same gate as other manual log edits.
  const canReturn = hasPermission('MANAGE_PARTICIPANTS');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pendingReturn, setPendingReturn] = useState<BorrowHistory[] | null>(null);
  const [isReturning, setIsReturning] = useState(false);

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

  // A row that falls out of the current filter, or that a reload now shows as
  // returned, must not stay selected — the bulk action would otherwise reach
  // records the operator can no longer see.
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.length === 0) return current;
      const returnable = new Set(
        filteredHistory.filter((h) => h.status === 'Unreturned').map((h) => h.borrow_id)
      );
      const next = current.filter((id) => returnable.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filteredHistory]);

  const returnableRows = useMemo(
    () => filteredHistory.filter((h) => h.status === 'Unreturned'),
    [filteredHistory]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allReturnableSelected =
    returnableRows.length > 0 && returnableRows.every((h) => selectedSet.has(h.borrow_id));

  const toggleRow = (borrowId: number) => {
    setSelectedIds((current) =>
      current.includes(borrowId)
        ? current.filter((id) => id !== borrowId)
        : [...current, borrowId]
    );
  };

  const toggleAllReturnable = () => {
    setSelectedIds(allReturnableSelected ? [] : returnableRows.map((h) => h.borrow_id));
  };

  const confirmReturn = async () => {
    if (!pendingReturn || pendingReturn.length === 0) return;

    setIsReturning(true);
    try {
      // The borrower is recorded as the returning participant, and the note
      // keeps the paper trail that this was a desk return, not a scan.
      const result = await borrowService.returnItems(
        pendingReturn.map((record) => ({
          borrowId: record.borrow_id,
          participantId: record.participant_id,
        })),
        `Manually returned via History Log by ${user?.full_name || 'staff'}`
      );

      if (result.returned.length > 0) {
        toast.success(
          result.returned.length === 1
            ? `${pendingReturn[0].item_name} marked as returned.`
            : `${result.returned.length} items marked as returned.`
        );
      }
      if (result.alreadyReturned.length > 0) {
        toast.info(
          `${result.alreadyReturned.length} ${
            result.alreadyReturned.length === 1 ? 'item was' : 'items were'
          } already returned.`
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `Could not return ${result.failed.length} ${
            result.failed.length === 1 ? 'item' : 'items'
          }. Please try again.`
        );
      }

      setPendingReturn(null);
      setSelectedIds([]);
      await loadHistory();
    } catch (err) {
      console.error('Manual return failed:', err);
      toast.error('Could not record the return.');
    } finally {
      setIsReturning(false);
    }
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
        <div className="bg-white rounded-lg border border-slate-200">
          {/* Bulk action bar — only present once something is selected, so the
              table keeps its full width in the common read-only case. */}
          {canReturn && selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-sm font-medium text-indigo-900">
                {selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'} selected
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-800"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPendingReturn(returnableRows.filter((h) => selectedSet.has(h.borrow_id)))
                  }
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  <Undo2 className="h-4 w-4" />
                  Return selected
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {canReturn && (
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all unreturned records"
                      checked={allReturnableSelected}
                      disabled={returnableRows.length === 0}
                      onChange={toggleAllReturnable}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </th>
                )}
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
                {canReturn && (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredHistory.map((record) => (
                <tr key={record.borrow_id} className="hover:bg-slate-50 transition">
                  {canReturn && (
                    <td className="px-4 py-3">
                      {record.status === 'Unreturned' && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${record.item_name} borrowed by ${record.participant_name}`}
                          checked={selectedSet.has(record.borrow_id)}
                          onChange={() => toggleRow(record.borrow_id)}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      )}
                    </td>
                  )}
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
                    {formatBorrowDuration(record.duration_minutes)}
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
                  {canReturn && (
                    <td className="px-4 py-3 text-right">
                      {record.status === 'Unreturned' && (
                        <button
                          type="button"
                          onClick={() => setPendingReturn([record])}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Return
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

      <ConfirmDialog
        isOpen={pendingReturn !== null}
        title={
          pendingReturn && pendingReturn.length === 1 ? 'Return this item?' : 'Return these items?'
        }
        description={
          pendingReturn && pendingReturn.length === 1 ? (
            <>
              <strong>{pendingReturn[0].item_name}</strong> will be marked as returned by{' '}
              <strong>{pendingReturn[0].participant_name}</strong>, timestamped now. This cannot be
              undone from here.
            </>
          ) : (
            <>
              <strong>{pendingReturn?.length ?? 0} items</strong> will be marked as returned by
              their borrowers, timestamped now. This cannot be undone from here.
            </>
          )
        }
        confirmLabel="Mark returned"
        confirmingLabel="Returning…"
        isConfirming={isReturning}
        onConfirm={confirmReturn}
        onCancel={() => setPendingReturn(null)}
      />
    </div>
  );
};

export default BorrowHistoryPage;
