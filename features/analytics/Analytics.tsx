import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';
import { MANAGE_EVENT_ACCESS_ROLES, fetchAccessibleEvents } from '../../lib/eventAccess';
import { ChartTooltip, useChartTheme } from '../../lib/chartTheme';
import {
    Building2,
    Calendar as CalendarIcon,
    Check,
    CheckCircle,
    ChevronDown,
    Clock,
    Contact,
    Loader2,
    Percent,
    RefreshCw,
    ScanLine,
    Search,
    TrendingUp,
    UserRound,
    Users
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

interface AnalyticsEvent {
  event_id: number;
  event_name: string;
  start_date: string;
  end_date: string;
}

interface ParticipantInfo {
  office: string | null;
  age_group: string | null;
  gender: string | null;
}

interface LogRow {
  attendance_date: string;
  scan_time: string;
  action_session: 'AM' | 'PM';
  scan_status: 'Valid' | 'Duplicate' | 'Invalid' | 'Late';
  participant_id: number;
  participants?: ParticipantInfo | ParticipantInfo[] | null;
}

const AGE_GROUP_ORDER = ['18-24', '25-34', '35-44', '45-54', '55-65', '65+'];

const PRESENT_SET = new Set<string>(PRESENT_ATTENDANCE_STATUSES);

const joined = (value: any) => (Array.isArray(value) ? value[0] : value);

const hourLabel = (hour: number) => {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
};

const Analytics: React.FC = () => {
  const { user } = useAuth();
  const colors = useChartTheme();

  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [registrationRoles, setRegistrationRoles] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const registeredCount = registrationRoles.length;

  // Searchable event picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerIndex, setPickerIndex] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  const filteredEvents = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return events;
    return events.filter(
      (event) =>
        event.event_name.toLowerCase().includes(query) ||
        format(parseISO(event.start_date), 'MMM d, yyyy').toLowerCase().includes(query)
    );
  }, [events, pickerQuery]);

  useEffect(() => {
    if (!pickerOpen) return;
    setPickerQuery('');
    setPickerIndex(0);
    requestAnimationFrame(() => pickerInputRef.current?.focus());

    const handleClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  const handlePickEvent = (eventId: number) => {
    setSelectedEventId(eventId);
    setPickerOpen(false);
  };

  const handlePickerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPickerIndex((i) => Math.min(i + 1, filteredEvents.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPickerIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const event = filteredEvents[pickerIndex];
      if (event) handlePickEvent(event.event_id);
    } else if (e.key === 'Escape') {
      setPickerOpen(false);
    }
  };

  // Only events that already have attendance logs are offered in the dropdown.
  useEffect(() => {
    if (!user) return;

    const loadEvents = async () => {
      setEventsLoading(true);
      try {
        const accessibleEvents = await fetchAccessibleEvents(user, {
          accessRoles: MANAGE_EVENT_ACCESS_ROLES,
          deletedView: 'active',
          orderBy: 'start_date',
          ascending: false
        });

        const ids = accessibleEvents.map((e) => e.event_id);
        if (ids.length === 0) {
          setEvents([]);
          return;
        }

        // Inner join keeps only events with at least one attendance log; the
        // embedded resource is limited to one row so the payload stays small.
        const { data, error } = await supabase
          .from('events')
          .select('event_id, attendance_logs!inner(attendance_id)')
          .in('event_id', ids)
          .limit(1, { referencedTable: 'attendance_logs' });

        if (error) throw error;

        const idsWithLogs = new Set((data || []).map((row: any) => row.event_id));
        const withLogs = accessibleEvents.filter((e) => idsWithLogs.has(e.event_id));
        setEvents(withLogs);
        setSelectedEventId((current) =>
          current && withLogs.some((e) => e.event_id === current) ? current : withLogs[0]?.event_id ?? null
        );
      } catch (err) {
        console.error('Failed to load events for analytics', err);
      } finally {
        setEventsLoading(false);
      }
    };

    loadEvents();
  }, [user]);

  const fetchEventData = async (eventId: number) => {
    setDataLoading(true);
    try {
      const PAGE = 1000;

      // Registration roles for the event — the row count doubles as the
      // registered total, so no separate head-count query is needed.
      let roles: string[] = [];
      let roleFrom = 0;
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase
          .from('event_participants')
          .select('role')
          .eq('event_id', eventId)
          .eq('registration_status', 'Registered')
          .range(roleFrom, roleFrom + PAGE - 1);

        if (error) throw error;
        roles = roles.concat((data || []).map((row: any) => row.role || 'Delegate'));
        if (!data || data.length < PAGE) break;
        roleFrom += PAGE;
      }
      setRegistrationRoles(roles);

      let from = 0;
      let all: LogRow[] = [];
      // Paged fetch — PostgREST caps a single response at 1000 rows.
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase
          .from('attendance_logs')
          .select('attendance_date, scan_time, action_session, scan_status, participant_id, participants(office, age_group, gender)')
          .eq('event_id', eventId)
          .order('scan_time', { ascending: true })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        all = all.concat((data || []) as LogRow[]);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      setLogs(all);
    } catch (err) {
      console.error('Failed to load analytics data', err);
      setLogs([]);
      setRegistrationRoles([]);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) fetchEventData(selectedEventId);
  }, [selectedEventId]);

  const selectedEvent = events.find((e) => e.event_id === selectedEventId) || null;

  const presentLogs = useMemo(() => logs.filter((log) => PRESENT_SET.has(log.scan_status)), [logs]);

  const attendedCount = useMemo(
    () => new Set(presentLogs.map((log) => log.participant_id)).size,
    [presentLogs]
  );

  const attendanceRate = registeredCount > 0 ? Math.round((attendedCount / registeredCount) * 100) : null;

  // Unique present participants per day, split by AM/PM session.
  const dailyData = useMemo(() => {
    const byDate = new Map<string, { am: Set<number>; pm: Set<number> }>();
    for (const log of presentLogs) {
      if (!byDate.has(log.attendance_date)) byDate.set(log.attendance_date, { am: new Set(), pm: new Set() });
      const bucket = byDate.get(log.attendance_date)!;
      (log.action_session === 'AM' ? bucket.am : bucket.pm).add(log.participant_id);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        label: format(parseISO(date), 'MMM d'),
        AM: bucket.am.size,
        PM: bucket.pm.size
      }));
  }, [presentLogs]);

  // Valid check-ins per hour of day, over the whole event.
  const hourlyData = useMemo(() => {
    if (presentLogs.length === 0) return [];
    const byHour = new Map<number, number>();
    for (const log of presentLogs) {
      const hour = parseISO(log.scan_time).getHours();
      byHour.set(hour, (byHour.get(hour) || 0) + 1);
    }
    const hours = Array.from(byHour.keys());
    const min = Math.min(...hours);
    const max = Math.max(...hours);
    const result = [];
    for (let h = min; h <= max; h++) {
      result.push({ label: hourLabel(h), Scans: byHour.get(h) || 0 });
    }
    return result;
  }, [presentLogs]);

  // Registered participants per role (Delegate, Speaker, Secretariat, …).
  const roleData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const role of registrationRoles) counts.set(role, (counts.get(role) || 0) + 1);
    return Array.from(counts.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count);
  }, [registrationRoles]);

  // One profile per unique present participant — demographics count people, not scans.
  const attendeeProfiles = useMemo(() => {
    const byId = new Map<number, { office: string; ageGroup: string; gender: string }>();
    for (const log of presentLogs) {
      if (byId.has(log.participant_id)) continue;
      const info = joined(log.participants);
      byId.set(log.participant_id, {
        office: info?.office?.trim() || 'Unspecified',
        ageGroup: info?.age_group?.trim() || 'Unspecified',
        gender: info?.gender?.trim() || 'Not specified'
      });
    }
    return Array.from(byId.values());
  }, [presentLogs]);

  // Top offices by unique present participants.
  const officeData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of attendeeProfiles) counts.set(profile.office, (counts.get(profile.office) || 0) + 1);
    return Array.from(counts.entries())
      .map(([office, count]) => ({ office, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [attendeeProfiles]);

  // Attendees per age bracket, in the registration form's fixed order; values
  // outside the standard brackets (or missing) fold into "Other".
  const ageData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of attendeeProfiles) counts.set(profile.ageGroup, (counts.get(profile.ageGroup) || 0) + 1);
    const rows = AGE_GROUP_ORDER.map((group) => ({ label: group, Attendees: counts.get(group) || 0 }));
    let other = 0;
    counts.forEach((count, group) => {
      if (!AGE_GROUP_ORDER.includes(group)) other += count;
    });
    if (other > 0) rows.push({ label: 'Other', Attendees: other });
    return rows;
  }, [attendeeProfiles]);

  const genderData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of attendeeProfiles) counts.set(profile.gender, (counts.get(profile.gender) || 0) + 1);
    return Array.from(counts.entries())
      .map(([gender, count]) => ({ gender, count }))
      .sort((a, b) => b.count - a.count);
  }, [attendeeProfiles]);

  const maxRoleCount = Math.max(1, ...roleData.map((r) => r.count));
  const maxOfficeCount = Math.max(1, ...officeData.map((o) => o.count));

  // Color follows the entity: each gender keeps its color regardless of rank.
  const genderColor = (gender: string) =>
    gender === 'Male' ? colors.seriesAm : gender === 'Female' ? colors.seriesPm : colors.tick;

  const StatCard = ({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: React.ReactNode; color: string }) => (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card p-3 sm:gap-4 sm:p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-xl font-medium leading-none text-slate-900 sm:text-2xl">{dataLoading ? '…' : value}</p>
        <p className="mt-1 truncate text-[11px] text-slate-600 sm:text-xs">{label}</p>
      </div>
    </div>
  );

  const ChartCard = ({ icon: Icon, title, children, legend }: { icon: React.ElementType; title: string; children: React.ReactNode; legend?: React.ReactNode }) => (
    <div className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--ink)/0.06)] px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-600/10 text-indigo-600">
          <Icon size={13} />
        </span>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {legend && <div className="ml-auto flex items-center gap-3">{legend}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  const LegendSwatch = ({ color, label }: { color: string; label: string }) => (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );

  const emptyChart = (message: string) => (
    <p className="py-12 text-center text-xs text-slate-400">{dataLoading ? 'Loading…' : message}</p>
  );

  return (
    <div className="-m-4 h-[calc(100%+2rem)] min-h-0 space-y-4 overflow-y-auto p-4 md:-m-6 md:h-[calc(100%+3rem)] md:px-12 md:py-8 lg:px-16">
      {/* Event picker */}
      <div className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 sm:max-w-xl">
            <label htmlFor="analytics-event" className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
              Event
            </label>
            <div className="relative" ref={pickerRef}>
              <button
                id="analytics-event"
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                disabled={eventsLoading || events.length === 0}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                className="flex h-10 w-full items-center gap-2.5 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card px-3 text-sm text-slate-900 outline-none transition-colors hover:border-[rgb(var(--ink)/0.18)] focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15 disabled:opacity-60"
              >
                <CalendarIcon size={15} className="shrink-0 text-slate-400" />
                {selectedEvent ? (
                  <span className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
                    <span className="truncate">{selectedEvent.event_name}</span>
                    <span className="shrink-0 font-mono text-xs text-slate-400">
                      {format(parseISO(selectedEvent.start_date), 'MMM d, yyyy')}
                    </span>
                  </span>
                ) : (
                  <span className="flex-1 text-left text-slate-400">
                    {eventsLoading ? 'Loading events…' : 'No events with attendance logs'}
                  </span>
                )}
                <ChevronDown
                  size={15}
                  className={`shrink-0 text-slate-400 transition-transform duration-150 ${pickerOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {pickerOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-[rgb(var(--ink)/0.10)] bg-card shadow-lg">
                  <div className="flex items-center gap-2 border-b border-[rgb(var(--ink)/0.06)] px-3">
                    <Search size={14} className="shrink-0 text-slate-400" />
                    <input
                      ref={pickerInputRef}
                      type="text"
                      value={pickerQuery}
                      onChange={(e) => {
                        setPickerQuery(e.target.value);
                        setPickerIndex(0);
                      }}
                      onKeyDown={handlePickerKeyDown}
                      placeholder="Search events…"
                      className="h-9 flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
                    />
                  </div>
                  <div role="listbox" className="max-h-64 overflow-y-auto py-1">
                    {filteredEvents.length === 0 ? (
                      <p className="px-3 py-5 text-center text-xs text-slate-400">No events match “{pickerQuery}”</p>
                    ) : (
                      filteredEvents.map((event, index) => {
                        const isSelected = event.event_id === selectedEventId;
                        const isHighlighted = index === pickerIndex;
                        return (
                          <button
                            key={event.event_id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => handlePickEvent(event.event_id)}
                            onMouseEnter={() => setPickerIndex(index)}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                              isHighlighted ? 'bg-slate-50 text-slate-900' : 'text-slate-700'
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">{event.event_name}</span>
                            <span className="shrink-0 font-mono text-[11px] text-slate-400">
                              {format(parseISO(event.start_date), 'MMM d, yyyy')}
                            </span>
                            {isSelected && <Check size={14} className="shrink-0 text-indigo-600" strokeWidth={3} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">Only events with recorded attendance logs are listed.</p>
          </div>
          <button
            type="button"
            onClick={() => selectedEventId && fetchEventData(selectedEventId)}
            disabled={!selectedEventId || dataLoading}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 self-start rounded-md border border-[rgb(var(--ink)/0.10)] bg-card px-3 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 sm:mb-6 sm:self-auto"
          >
            {dataLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {eventsLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Loading events…
        </div>
      ) : !selectedEvent ? (
        <div className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card py-20 text-center">
          <TrendingUp size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-900">No analytics to show yet</p>
          <p className="mt-1 text-xs text-slate-400">Analytics become available once an event has attendance scans.</p>
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard icon={Users} label="Registered" value={registeredCount} color="bg-indigo-600/10 text-indigo-600" />
            <StatCard icon={CheckCircle} label="Attended (unique)" value={attendedCount} color="bg-emerald-50 text-emerald-600" />
            <StatCard icon={Percent} label="Attendance Rate" value={attendanceRate === null ? '—' : `${attendanceRate}%`} color="bg-blue-50 text-blue-600" />
            <StatCard icon={ScanLine} label="Total Scans" value={logs.length} color="bg-stone-100 text-stone-500" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Daily attendance by session */}
            <ChartCard
              icon={CalendarIcon}
              title="Daily Attendance"
              legend={
                <>
                  <LegendSwatch color={colors.seriesAm} label="AM session" />
                  <LegendSwatch color={colors.seriesPm} label="PM session" />
                </>
              }
            >
              {dailyData.length === 0 ? emptyChart('No valid check-ins recorded.') : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dailyData} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%" barGap={2}>
                    <CartesianGrid vertical={false} stroke={colors.grid} />
                    <XAxis dataKey="label" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.cursor }} />
                    <Bar dataKey="AM" name="AM session" fill={colors.seriesAm} radius={[3, 3, 0, 0]} maxBarSize={28}>
                      {dailyData.length <= 10 && <LabelList dataKey="AM" position="top" fill={colors.label} fontSize={10} />}
                    </Bar>
                    <Bar dataKey="PM" name="PM session" fill={colors.seriesPm} radius={[3, 3, 0, 0]} maxBarSize={28}>
                      {dailyData.length <= 10 && <LabelList dataKey="PM" position="top" fill={colors.label} fontSize={10} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Check-in flow by hour */}
            <ChartCard icon={Clock} title="Check-in Time Distribution">
              {hourlyData.length === 0 ? emptyChart('No valid check-ins recorded.') : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={hourlyData} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke={colors.grid} />
                    <XAxis dataKey="label" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.cursor }} />
                    <Bar dataKey="Scans" name="Check-ins" fill={colors.accent} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Age group distribution */}
            <ChartCard icon={Users} title="Attendees by Age Group">
              {attendeeProfiles.length === 0 ? emptyChart('No valid check-ins recorded.') : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ageData} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke={colors.grid} />
                    <XAxis dataKey="label" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.cursor }} />
                    <Bar dataKey="Attendees" name="Attendees" fill={colors.accent} radius={[3, 3, 0, 0]} maxBarSize={28}>
                      <LabelList dataKey="Attendees" position="top" fill={colors.label} fontSize={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Gender distribution */}
            <ChartCard icon={UserRound} title="Attendees by Gender">
              {genderData.length === 0 ? emptyChart('No valid check-ins recorded.') : (
                <div className="flex flex-col items-center gap-5 py-2 sm:flex-row sm:justify-center sm:gap-10">
                  <div className="relative h-[200px] w-[200px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={genderData}
                          dataKey="count"
                          nameKey="gender"
                          innerRadius="62%"
                          outerRadius="96%"
                          startAngle={90}
                          endAngle={-270}
                          stroke={colors.surface}
                          strokeWidth={2}
                        >
                          {genderData.map((item) => (
                            <Cell key={item.gender} fill={genderColor(item.gender)} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-2xl font-medium leading-none text-slate-900">{attendeeProfiles.length}</span>
                      <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Attendees</span>
                    </div>
                  </div>

                  <div className="w-full max-w-[240px] space-y-2.5">
                    {genderData.map((item) => {
                      const pct = attendeeProfiles.length > 0 ? Math.round((item.count / attendeeProfiles.length) * 100) : 0;
                      return (
                        <div key={item.gender} className="flex items-center gap-2 text-xs">
                          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: genderColor(item.gender) }} />
                          <span className="min-w-0 flex-1 truncate text-slate-900">{item.gender}</span>
                          <span className="shrink-0 font-mono text-slate-900">{item.count}</span>
                          <span className="w-9 shrink-0 text-right font-mono text-slate-400">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ChartCard>

            {/* Registered participants per role */}
            <ChartCard icon={Contact} title="Participants by Role">
              {roleData.length === 0 ? emptyChart('No registered participants.') : (
                <div className="space-y-3 py-1">
                  {roleData.map((item) => {
                    const pct = registeredCount > 0 ? Math.round((item.count / registeredCount) * 100) : 0;
                    return (
                      <div key={item.role}>
                        <div className="mb-1 flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate text-slate-900">{item.role}</span>
                          <span className="shrink-0 font-mono text-slate-900">{item.count}</span>
                          <span className="w-9 shrink-0 text-right font-mono text-slate-400">{pct}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--ink)/0.06)]">
                          <div
                            className="h-full rounded-r-full transition-all duration-300"
                            style={{ width: `${(item.count / maxRoleCount) * 100}%`, backgroundColor: colors.accent }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>

            {/* Top offices */}
            <ChartCard icon={Building2} title="Top Offices by Attendees">
              {officeData.length === 0 ? emptyChart('No valid check-ins recorded.') : (
                <div className="space-y-3 py-1">
                  {officeData.map((item) => (
                    <div key={item.office}>
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-slate-900" title={item.office}>{item.office}</span>
                        <span className="shrink-0 font-mono text-slate-900">{item.count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--ink)/0.06)]">
                        <div
                          className="h-full rounded-r-full transition-all duration-300"
                          style={{ width: `${(item.count / maxOfficeCount) * 100}%`, backgroundColor: colors.accent }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>

          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
