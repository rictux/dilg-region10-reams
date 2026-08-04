
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';
import {
    Activity,
    Calendar as CalendarIcon,
    CheckCircle,
    ClipboardList,
    Clock,
    Users,
    UserPlus,
    MapPin,
    Radio,
    ScanLine,
    Star
} from 'lucide-react';
import { format, formatDistanceToNowStrict, isSameDay, parseISO, subMonths } from 'date-fns';
import { MANAGE_EVENT_ACCESS_ROLES, fetchAccessibleEvents } from '../../lib/eventAccess';
import { ChartTooltip, useChartTheme } from '../../lib/chartTheme';
import { onPrincipalArrival } from '../../lib/principalArrival';
import {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

interface DashboardEvent {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string;
  end_date: string;
  registered_count: number;
  present_count?: number;
  status?: string;
  session?: 'AM' | 'PM' | 'All_Day';
}

interface ActivityLogItem {
  key: string;
  type: 'scan' | 'registration';
  name: string;
  eventName: string;
  detail: string;
  timestamp: string;
}

interface PrincipalArrivalItem {
  key: string;
  name: string;
  office: string;
  eventName: string;
  timestamp: string;
}

const PRINCIPAL_ARRIVAL_LIMIT = 5;

const Dashboard: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    upcomingEvents: 0,
    completedEvents: 0
  });
  const [ongoingEvents, setOngoingEvents] = useState<DashboardEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<DashboardEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [principalArrivals, setPrincipalArrivals] = useState<PrincipalArrivalItem[]>([]);
  const [arrivalsError, setArrivalsError] = useState<string | null>(null);
  const [monthlyEvents, setMonthlyEvents] = useState<{ label: string; Events: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const chartColors = useChartTheme();

  useEffect(() => {
    if (user) {
        fetchDashboardData();
    }

    // Realtime subscriptions
    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        if (user) fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, () => {
        if (user) fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        if (user) fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'principal_arrival_logs' }, () => {
        if (user) fetchDashboardData();
      })
      .subscribe();

    // Arrivals also refresh straight off the announcement stream. postgres_changes
    // on principal_arrival_logs is the backup: it only fires if the table is in
    // the Realtime publication, whereas the broadcast is always sent.
    const unsubscribeArrivals = onPrincipalArrival(() => {
      if (user) fetchDashboardData();
    });

    return () => {
      supabase.removeChannel(channel);
      unsubscribeArrivals();
    };
  }, [user]);

  const fetchDashboardData = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    try {
        const accessibleEvents = await fetchAccessibleEvents(user, {
            accessRoles: MANAGE_EVENT_ACCESS_ROLES,
            deletedView: 'active'
        });

        setStats({
            totalEvents: accessibleEvents.length,
            activeEvents: accessibleEvents.filter((event) => event.status === 'Ongoing').length,
            upcomingEvents: accessibleEvents.filter((event) => event.status === 'Scheduled').length,
            completedEvents: accessibleEvents.filter((event) => event.status === 'Completed').length
        });

        // Events per month over the last 12 months, bucketed by start date.
        const countsByMonth = new Map<string, number>();
        accessibleEvents.forEach((event) => {
            const key = format(parseISO(event.start_date), 'yyyy-MM');
            countsByMonth.set(key, (countsByMonth.get(key) || 0) + 1);
        });
        setMonthlyEvents(
            Array.from({ length: 12 }, (_, i) => {
                const month = subMonths(new Date(), 11 - i);
                return {
                    label: format(month, 'MMM yy'),
                    Events: countsByMonth.get(format(month, 'yyyy-MM')) || 0
                };
            })
        );

        // 2. On-going Events (happening today)
        const ongoingData = accessibleEvents.filter((event) => event.start_date <= today && event.end_date >= today);

        const ongoingEventsWithCounts = await Promise.all((ongoingData || []).map(async (e) => {
            const { count: regCount } = await supabase
                .from('event_participants')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', e.event_id)
                .eq('registration_status', 'Registered');

            const { count: amCount } = await supabase
                .from('attendance_logs')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', e.event_id)
                .eq('attendance_date', today)
                .eq('action_session', 'AM')
                .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES]);

            return {
                ...e,
                registered_count: regCount || 0,
                present_count: amCount || 0
            };
        }));
        setOngoingEvents(ongoingEventsWithCounts);

        // 3. Upcoming Events
        const upcomingData = accessibleEvents
            .filter((event) => event.start_date > today)
            .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

        const upcomingEventsWithCounts = await Promise.all((upcomingData || []).map(async (e) => {
             const { count: regCount } = await supabase
                .from('event_participants')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', e.event_id)
                .eq('registration_status', 'Registered');

            return {
                ...e,
                registered_count: regCount || 0
            };
        }));
        setUpcomingEvents(upcomingEventsWithCounts);

        // 4. Activity logs: latest scans + registrations across accessible events
        const accessibleIds = accessibleEvents.map((e) => e.event_id);
        if (accessibleIds.length > 0) {
            const [scanRes, regRes] = await Promise.all([
                supabase
                    .from('attendance_logs')
                    .select('attendance_id, scan_time, action_session, participants(full_name), events(event_name)')
                    .in('event_id', accessibleIds)
                    .order('scan_time', { ascending: false })
                    .limit(8),
                supabase
                    .from('event_participants')
                    .select('id, registered_at, participants(full_name), events(event_name)')
                    .in('event_id', accessibleIds)
                    .eq('registration_status', 'Registered')
                    .order('registered_at', { ascending: false })
                    .limit(8)
            ]);

            const joined = (value: any) => (Array.isArray(value) ? value[0] : value);
            const scans: ActivityLogItem[] = (scanRes.data || []).map((row: any) => ({
                key: `scan-${row.attendance_id}`,
                type: 'scan',
                name: joined(row.participants)?.full_name || 'Unknown participant',
                eventName: joined(row.events)?.event_name || '',
                detail: `${row.action_session} check-in`,
                timestamp: row.scan_time
            }));
            const registrations: ActivityLogItem[] = (regRes.data || []).map((row: any) => ({
                key: `reg-${row.id}`,
                type: 'registration',
                name: joined(row.participants)?.full_name || 'Unknown participant',
                eventName: joined(row.events)?.event_name || '',
                detail: 'Registered',
                timestamp: row.registered_at
            }));

            setActivityLogs(
                [...scans, ...registrations]
                    .filter((item) => item.timestamp)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, 10)
            );

            // 5. Most recent Principal delegate arrivals across accessible events
            const { data: arrivalRows, error: arrivalError } = await supabase
                .from('principal_arrival_logs')
                .select('arrival_id, arrived_at, participants(full_name, office), events(event_name)')
                .in('event_id', accessibleIds)
                .order('arrived_at', { ascending: false })
                .limit(PRINCIPAL_ARRIVAL_LIMIT);

            // Surfaced rather than swallowed: a missing table or blocked policy
            // would otherwise look identical to "nobody has arrived yet".
            if (arrivalError) {
                console.error('Error fetching principal arrivals', arrivalError);
                setArrivalsError(arrivalError.message || 'Could not load arrivals.');
            } else {
                setArrivalsError(null);
            }

            setPrincipalArrivals((arrivalRows || []).map((row: any) => ({
                key: `arrival-${row.arrival_id}`,
                name: joined(row.participants)?.full_name || 'Unknown participant',
                office: joined(row.participants)?.office || '',
                eventName: joined(row.events)?.event_name || '',
                timestamp: row.arrived_at
            })));
        } else {
            setActivityLogs([]);
            setPrincipalArrivals([]);
        }

    } catch (e) {
        console.error("Error fetching dashboard data", e);
    } finally {
        setLoading(false);
    }
  };

  const formatEventDates = (event: DashboardEvent) => {
    const start = parseISO(event.start_date);
    const end = parseISO(event.end_date);
    if (isSameDay(start, end)) return format(start, 'yyyy-MM-dd');
    return `${format(start, 'yyyy-MM-dd')} – ${format(end, 'MMM d')}`;
  };

  const sessionLabel = (session?: DashboardEvent['session']) => {
    if (session === 'AM') return 'AM';
    if (session === 'PM') return 'PM';
    return 'All Day';
  };

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-card border border-[rgb(var(--ink)/0.08)] rounded-lg p-3 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-medium text-slate-900 leading-none font-mono">{loading ? '…' : value}</p>
        <p className="text-[11px] sm:text-xs text-slate-600 mt-1 truncate">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-0 overflow-y-auto -m-4 h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)] p-4 md:py-8 md:px-12 lg:px-16 space-y-4">
      {/* Top Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={CalendarIcon} label="Total Events" value={stats.totalEvents} color="bg-indigo-600/10 text-indigo-600" />
        <StatCard icon={Radio} label="On-going Events" value={stats.activeEvents} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Clock} label="Upcoming Events" value={stats.upcomingEvents} color="bg-blue-50 text-blue-600" />
        <StatCard icon={CheckCircle} label="Completed Events" value={stats.completedEvents} color="bg-stone-100 text-stone-500" />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="w-full lg:flex-1 min-w-0 space-y-4">
      {/* Monthly event count */}
      <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)]">
          <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-indigo-600/10 text-indigo-600">
            <CalendarIcon size={13} />
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Monthly Events</h3>
          <span className="ml-auto text-xs text-slate-400">Last 12 months</span>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="py-12 text-center text-xs text-slate-400">Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyEvents} margin={{ top: 16, right: 8, left: -22, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="label" tick={{ fill: chartColors.tick, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: chartColors.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: chartColors.cursor }} />
                <Bar dataKey="Events" name="Events" fill={chartColors.accent} radius={[3, 3, 0, 0]} maxBarSize={26}>
                  <LabelList dataKey="Events" position="top" fill={chartColors.label} fontSize={10} formatter={(value: number) => (value > 0 ? value : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Happening Today hero */}
      <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)] bg-emerald-50/40">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-[0.08em]">Happening Today</h3>
          <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full font-medium font-mono bg-emerald-100 text-emerald-700">
            {ongoingEvents.length}
          </span>
          <span className="ml-auto text-xs text-slate-600 font-mono">{format(new Date(), 'MMMM d, yyyy')}</span>
        </div>

        {ongoingEvents.length > 0 ? (
          <div className="divide-y divide-[rgb(var(--ink)/0.04)]">
            {ongoingEvents.map((event) => {
              const attendanceRatio = event.registered_count > 0
                ? Math.min((event.present_count ?? 0) / event.registered_count, 1)
                : 0;

              return (
                <div key={event.event_id} className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                  {/* Event identity */}
                  <div
                    onClick={() => navigate(`/events?event=${event.event_id}`)}
                    title="View participants"
                    className="min-w-0 flex-1 cursor-pointer group"
                  >
                    <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-1 group-hover:text-indigo-600 transition-colors">
                      {event.event_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} className="shrink-0 text-slate-400" />
                        <span className="font-mono">{formatEventDates(event)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono">{sessionLabel(event.session)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <MapPin size={12} className="shrink-0 text-slate-400" />
                        <span className="truncate max-w-[20rem]">{event.venue}</span>
                      </span>
                    </div>
                  </div>

                  {/* Live attendance */}
                  <div className="w-full md:w-56 shrink-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Present</span>
                      <span className="text-xs font-mono text-slate-900">
                        <span className="font-semibold text-emerald-600">{event.present_count ?? 0}</span>
                        <span className="text-slate-400"> / {event.registered_count} registered</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100/60 overflow-hidden">
                      <div
                        className="h-full rounded-r-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.max(attendanceRatio * 100, 2)}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 shrink-0">
                    {hasPermission('SCAN_QR') && (
                      <button
                        type="button"
                        onClick={() => navigate(`/scan?event=${event.event_id}`)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                      >
                        <ScanLine size={13} />
                        Scan
                      </button>
                    )}
                    {hasPermission('VIEW_PARTICIPANTS') && (
                      <button
                        type="button"
                        onClick={() => navigate('/attendance')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card px-3 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
                      >
                        <ClipboardList size={13} />
                        Attendance
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-slate-400">{loading ? 'Loading…' : 'No events happening today.'}</p>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)]">
          <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
            <Clock size={13} />
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Upcoming Events</h3>
          <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full font-medium font-mono bg-blue-50 text-blue-700">
            {upcomingEvents.length}
          </span>
          <button
            type="button"
            onClick={() => navigate('/events')}
            className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
          >
            View all
          </button>
        </div>
        {upcomingEvents.length > 0 ? (
          <div className="divide-y divide-[rgb(var(--ink)/0.04)] px-4">
            {upcomingEvents.map((event) => (
              <div
                key={event.event_id}
                onClick={() => navigate(`/events?event=${event.event_id}`)}
                title="View participants"
                className="flex items-start gap-2.5 py-3 -mx-4 px-4 cursor-pointer hover:bg-slate-50/60 transition-colors"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-1">{event.event_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} className="shrink-0 text-slate-400" />
                      <span className="font-mono">{formatEventDates(event)}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono">{sessionLabel(event.session)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MapPin size={12} className="shrink-0 text-slate-400" />
                      <span className="truncate max-w-[16rem]">{event.venue}</span>
                    </span>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600" title="Registered">
                  <Users size={13} className="text-slate-400" />
                  <span className="font-mono">{event.registered_count}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-slate-400">{loading ? 'Loading…' : 'No upcoming events.'}</p>
        )}
      </div>
        </div>

        {/* Principal arrivals + Activity Logs rail */}
        <div className="w-full lg:w-[30%] xl:w-[28%] shrink-0 flex flex-col gap-4">
        <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)]">
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-amber-100 text-amber-600">
              <Star size={13} className="fill-amber-500 text-amber-500" />
            </span>
            <h3 className="text-sm font-semibold text-slate-900">Principal Arrivals</h3>
          </div>
          {arrivalsError ? (
            <p className="px-4 py-8 text-center text-xs text-red-600">{arrivalsError}</p>
          ) : principalArrivals.length > 0 ? (
          <div className="divide-y divide-[rgb(var(--ink)/0.04)]">
            {principalArrivals.map((item) => (
              <div key={item.key} className="flex items-start gap-2.5 px-4 py-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                  <Star size={12} className="fill-amber-500 text-amber-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug text-slate-900">
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-slate-600"> · Arrived</span>
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {[item.office, item.eventName].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span
                  className="shrink-0 text-[10px] font-mono text-slate-400"
                  title={format(parseISO(item.timestamp), 'MMM d, yyyy h:mm a')}
                >
                  {formatDistanceToNowStrict(parseISO(item.timestamp), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
          ) : (
            <p className="py-10 text-center text-xs text-slate-400">
              {loading ? 'Loading…' : 'No principal arrivals yet.'}
            </p>
          )}
        </div>

        <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)]">
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-indigo-600/10 text-indigo-600">
              <Activity size={13} />
            </span>
            <h3 className="text-sm font-semibold text-slate-900">Activity Logs</h3>
          </div>
          {activityLogs.length > 0 ? (
            <div className="divide-y divide-[rgb(var(--ink)/0.04)]">
              {activityLogs.map((item) => (
                <div key={item.key} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    item.type === 'scan' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-600/10 text-indigo-600'
                  }`}>
                    {item.type === 'scan' ? <ScanLine size={12} /> : <UserPlus size={12} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug text-slate-900">
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-slate-600"> · {item.detail}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{item.eventName}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono text-slate-400" title={format(parseISO(item.timestamp), 'MMM d, yyyy h:mm a')}>
                    {formatDistanceToNowStrict(parseISO(item.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-slate-400">{loading ? 'Loading…' : 'No recent activity.'}</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
