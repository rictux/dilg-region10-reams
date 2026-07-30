import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AuditAction, AuditEntityType, AuditLog } from '../../types/database';
import { formatAuditFieldLabel, formatAuditValue } from '../../lib/auditLog';
import { format, parseISO } from 'date-fns';
import {
    ScrollText,
    Search,
    SlidersHorizontal,
    ChevronDown,
    ChevronRight,
    Calendar,
    Shield,
    Layers,
    ArrowRight,
    RefreshCw,
    User as UserIcon
} from 'lucide-react';

const PAGE_SIZE = 25;

const ACTION_BADGE_STYLES: Record<AuditAction, string> = {
    Create: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Update: 'border-blue-200 bg-blue-50 text-blue-700',
    Delete: 'border-red-200 bg-red-50 text-red-700',
    PermanentDelete: 'border-red-300 bg-red-100 text-red-800',
    Restore: 'border-amber-200 bg-amber-50 text-amber-700'
};

const ACTION_LABELS: Record<AuditAction, string> = {
    Create: 'Created',
    Update: 'Updated',
    Delete: 'Deleted',
    PermanentDelete: 'Permanently Deleted',
    Restore: 'Restored'
};

const ENTITY_LABELS: Record<AuditEntityType, string> = {
    Event: 'Event',
    EventParticipant: 'Event Participant',
    Participant: 'Participant Record',
    User: 'System User'
};

const AuditLogs: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [entityFilter, setEntityFilter] = useState<'all' | AuditEntityType>('all');
    const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const activeFilterCount =
        (entityFilter !== 'all' ? 1 : 0) +
        (actionFilter !== 'all' ? 1 : 0) +
        (dateFrom ? 1 : 0) +
        (dateTo ? 1 : 0);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Any filter change invalidates the current page offset.
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, entityFilter, actionFilter, dateFrom, dateTo]);

    // The trail grows without bound, so paging and filtering both happen in the
    // database rather than over a fully-loaded client-side list.
    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            let query = supabase
                .from('audit_logs')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .order('audit_id', { ascending: false });

            if (entityFilter !== 'all') query = query.eq('entity_type', entityFilter);
            if (actionFilter !== 'all') query = query.eq('action', actionFilter);
            if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
            if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999`);

            if (debouncedSearch) {
                // `%`, `,` and parentheses are structural in a PostgREST or() filter.
                const term = debouncedSearch.replace(/[%,()]/g, '');
                if (term) {
                    query = query.or(
                        `entity_label.ilike.%${term}%,actor_name.ilike.%${term}%,event_name.ilike.%${term}%`
                    );
                }
            }

            const from = (currentPage - 1) * PAGE_SIZE;
            const { data, error: queryError, count } = await query.range(from, from + PAGE_SIZE - 1);

            if (queryError) throw queryError;

            setLogs((data || []) as AuditLog[]);
            setTotalCount(count ?? 0);
        } catch (err: any) {
            console.error('Error loading audit logs:', err);
            setError(err.message || 'Unable to load audit logs.');
            setLogs([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [currentPage, debouncedSearch, entityFilter, actionFilter, dateFrom, dateTo]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount);

    const clearFilters = () => {
        setSearchTerm('');
        setEntityFilter('all');
        setActionFilter('all');
        setDateFrom('');
        setDateTo('');
    };

    const formatTimestamp = (value: string) => {
        try {
            return format(parseISO(value), 'MMM d, yyyy h:mm a');
        } catch {
            return value;
        }
    };

    const changeEntries = (log: AuditLog) => Object.entries(log.changes || {});

    const summarizeChanges = (log: AuditLog): string => {
        const entries = changeEntries(log);
        if (entries.length === 0) {
            return log.snapshot ? 'Full record captured' : '—';
        }

        const labels = entries.map(([field]) => formatAuditFieldLabel(field));
        if (labels.length <= 3) return labels.join(', ');
        return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
    };

    const ActorCell = ({ log }: { log: AuditLog }) => (
        <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 leading-tight truncate">
                {log.actor_name || 'Unknown user'}
            </div>
            <div className="text-xs text-slate-500 font-mono">{log.actor_role || '—'}</div>
        </div>
    );

    const ActionBadge = ({ action }: { action: AuditAction }) => (
        <span
            className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${
                ACTION_BADGE_STYLES[action] || 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
        >
            {ACTION_LABELS[action] || action}
        </span>
    );

    const ChangeDetails = ({ log }: { log: AuditLog }) => {
        const entries = changeEntries(log);

        return (
            <div className="space-y-4">
                {entries.length > 0 && (
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono mb-2">
                            Changed Fields
                        </p>
                        <div className="space-y-1.5">
                            {entries.map(([field, change]) => (
                                <div key={field} className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-medium text-slate-700 min-w-[9rem]">
                                        {formatAuditFieldLabel(field)}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100 font-mono break-all">
                                        {formatAuditValue(change?.from)}
                                    </span>
                                    <ArrowRight size={12} className="text-slate-400 shrink-0" />
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono break-all">
                                        {formatAuditValue(change?.to)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {log.reason && (
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono mb-1">
                            Reason
                        </p>
                        <p className="text-xs text-slate-700">{log.reason}</p>
                    </div>
                )}

                {log.snapshot && (
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono mb-2">
                            Record Snapshot
                        </p>
                        <pre className="text-[11px] font-mono text-slate-600 bg-slate-50 border border-[rgb(var(--ink)/0.06)] rounded-md p-3 overflow-x-auto">
                            {JSON.stringify(log.snapshot, null, 2)}
                        </pre>
                    </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-400 font-mono">
                    <span>Log #{log.audit_id}</span>
                    {log.entity_id !== null && log.entity_id !== undefined && (
                        <span>Record ID {log.entity_id}</span>
                    )}
                    {log.user_agent && <span className="break-all">{log.user_agent}</span>}
                </div>
            </div>
        );
    };

    const hasDetails = (log: AuditLog) =>
        changeEntries(log).length > 0 || Boolean(log.snapshot) || Boolean(log.reason) || Boolean(log.user_agent);

    const emptyMessage = useMemo(() => {
        if (debouncedSearch || activeFilterCount > 0) return 'No activity matches these filters.';
        return 'No activity has been recorded yet.';
    }, [debouncedSearch, activeFilterCount]);

    return (
        <div className="min-h-0 flex flex-col gap-6 -m-4 h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)] p-4 md:py-8 md:px-12 lg:px-16">
            <div className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card p-3">
                <div className="flex flex-col gap-3 md:grid md:grid-cols-2 xl:grid-cols-[30%_minmax(180px,220px)_minmax(180px,220px)_minmax(150px,1fr)_minmax(150px,1fr)_auto]">
                    <div className="flex min-w-0 gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                type="text"
                                placeholder="Search record, user, or event..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-14 h-9 bg-card border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 transition-colors"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowFilters((prev) => !prev)}
                            aria-expanded={showFilters}
                            className="flex shrink-0 items-center gap-2 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card px-3 h-9 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 md:hidden"
                        >
                            <SlidersHorizontal size={16} />
                            Filters
                            {activeFilterCount > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">
                                    {activeFilterCount}
                                </span>
                            )}
                            <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    <div className={`${showFilters ? 'grid' : 'hidden'} grid-cols-1 gap-3 md:contents`}>
                        <div className="relative min-w-0">
                            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <select
                                value={entityFilter}
                                onChange={(e) => setEntityFilter(e.target.value as 'all' | AuditEntityType)}
                                className="w-full appearance-none rounded-md border border-[rgb(var(--ink)/0.10)] bg-card h-9 pl-9 pr-8 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                                aria-label="Filter by record type"
                            >
                                <option value="all">All record types</option>
                                <option value="Event">Event</option>
                                <option value="EventParticipant">Event Participant</option>
                                <option value="Participant">Participant Record</option>
                                <option value="User">System User</option>
                            </select>
                        </div>

                        <div className="relative min-w-0">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <select
                                value={actionFilter}
                                onChange={(e) => setActionFilter(e.target.value as 'all' | AuditAction)}
                                className="w-full appearance-none rounded-md border border-[rgb(var(--ink)/0.10)] bg-card h-9 pl-9 pr-8 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                                aria-label="Filter by action"
                            >
                                <option value="all">All actions</option>
                                <option value="Create">Created</option>
                                <option value="Update">Updated</option>
                                <option value="Delete">Deleted</option>
                                <option value="PermanentDelete">Permanently Deleted</option>
                                <option value="Restore">Restored</option>
                            </select>
                        </div>

                        <div className="relative min-w-0">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                type="date"
                                value={dateFrom}
                                max={dateTo || undefined}
                                onChange={(e) => setDateFrom(e.target.value)}
                                aria-label="From date"
                                className="w-full rounded-md border border-[rgb(var(--ink)/0.10)] bg-card h-9 pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                            />
                        </div>

                        <div className="relative min-w-0">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                type="date"
                                value={dateTo}
                                min={dateFrom || undefined}
                                onChange={(e) => setDateTo(e.target.value)}
                                aria-label="To date"
                                className="w-full rounded-md border border-[rgb(var(--ink)/0.10)] bg-card h-9 pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={fetchLogs}
                        className="hidden w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[rgb(var(--ink)/0.10)] bg-card px-4 h-9 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 md:flex md:w-auto"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)] overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)] shrink-0">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-indigo-600/10 text-indigo-600">
                        <ScrollText size={13} />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">Audit Logs</h3>
                    <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full font-medium font-mono bg-indigo-600/10 text-indigo-700">
                        {totalCount}
                    </span>
                    {(activeFilterCount > 0 || debouncedSearch) && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="ml-auto text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {error && (
                    <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shrink-0">
                        {error}
                    </div>
                )}

                {/* Desktop table */}
                <div className="hidden md:block flex-1 min-h-0 overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-[rgb(var(--ink)/0.06)]">
                            <tr>
                                <th className="w-8 px-2 py-2.5 bg-slate-50" />
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">When</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Performed By</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Action</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Record</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Event</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgb(var(--ink)/0.04)]">
                            {loading ? (
                                <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-400">Loading audit logs…</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-400">{emptyMessage}</td></tr>
                            ) : (
                                logs.map((log) => {
                                    const expandable = hasDetails(log);
                                    const isExpanded = expandedId === log.audit_id;

                                    return (
                                        <React.Fragment key={log.audit_id}>
                                            <tr
                                                className={`transition-colors ${expandable ? 'cursor-pointer hover:bg-slate-50/60' : ''}`}
                                                onClick={() => expandable && setExpandedId(isExpanded ? null : log.audit_id)}
                                            >
                                                <td className="px-2 py-3 align-top">
                                                    {expandable && (
                                                        <ChevronRight
                                                            size={14}
                                                            className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top text-xs font-mono text-slate-500 whitespace-nowrap">
                                                    {formatTimestamp(log.created_at)}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <ActorCell log={log} />
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <ActionBadge action={log.action} />
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="min-w-0">
                                                        <div className="text-sm text-slate-900 leading-tight">
                                                            {log.entity_label || <span className="text-slate-400 italic">Unnamed</span>}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 font-mono">
                                                            {ENTITY_LABELS[log.entity_type] || log.entity_type}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top text-xs text-slate-600">
                                                    {log.event_name || <span className="text-slate-400">—</span>}
                                                </td>
                                                <td className="px-4 py-3 align-top text-xs text-slate-600">
                                                    {summarizeChanges(log)}
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-slate-50/60">
                                                    <td />
                                                    <td colSpan={6} className="px-4 pb-4 pt-1">
                                                        <ChangeDetails log={log} />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
                    {loading ? (
                        [...Array(3)].map((_, i) => (
                            <div key={i} className="animate-pulse rounded-lg border border-[rgb(var(--ink)/0.08)] p-4 space-y-3">
                                <div className="h-5 bg-slate-200 rounded w-2/3" />
                                <div className="h-4 bg-slate-100 rounded w-1/2" />
                                <div className="h-4 bg-slate-100 rounded w-1/3" />
                            </div>
                        ))
                    ) : logs.length === 0 ? (
                        <div className="py-10 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-[rgb(var(--ink)/0.06)]">
                            {emptyMessage}
                        </div>
                    ) : (
                        logs.map((log) => {
                            const expandable = hasDetails(log);
                            const isExpanded = expandedId === log.audit_id;

                            return (
                                <div key={log.audit_id} className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-slate-900 truncate">
                                                {log.entity_label || 'Unnamed'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono">
                                                {ENTITY_LABELS[log.entity_type] || log.entity_type}
                                            </div>
                                        </div>
                                        <ActionBadge action={log.action} />
                                    </div>

                                    <div className="mt-3 space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                            <UserIcon size={13} className="text-slate-400 shrink-0" />
                                            {log.actor_name || 'Unknown user'}
                                            {log.actor_role && <span className="text-slate-400 font-mono">· {log.actor_role}</span>}
                                        </div>
                                        {log.event_name && (
                                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                <Calendar size={13} className="text-slate-400 shrink-0" />
                                                <span className="truncate">{log.event_name}</span>
                                            </div>
                                        )}
                                        <div className="text-[11px] font-mono text-slate-400">
                                            {formatTimestamp(log.created_at)}
                                        </div>
                                    </div>

                                    {expandable && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedId(isExpanded ? null : log.audit_id)}
                                                className="mt-3 flex w-full items-center justify-center gap-1.5 h-8 rounded-md bg-indigo-600/10 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-600/20"
                                            >
                                                {isExpanded ? 'Hide details' : 'View details'}
                                                <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                            {isExpanded && (
                                                <div className="mt-3 border-t border-[rgb(var(--ink)/0.06)] pt-3">
                                                    <ChangeDetails log={log} />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {!loading && totalCount > PAGE_SIZE && (
                    <div className="px-4 py-3 border-t border-[rgb(var(--ink)/0.06)] flex items-center justify-between gap-3 shrink-0">
                        <p className="text-xs text-slate-500">
                            Showing <span className="font-medium text-slate-700">{rangeStart}</span>–<span className="font-medium text-slate-700">{rangeEnd}</span> of <span className="font-medium text-slate-700">{totalCount}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="h-8 px-3 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <span className="text-xs font-mono text-slate-600 px-1">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                disabled={currentPage >= totalPages}
                                className="h-8 px-3 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditLogs;
