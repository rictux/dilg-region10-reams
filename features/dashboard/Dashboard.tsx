
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
    ScanLine
} from 'lucide-react';
import { format, formatDistanceToNowStrict, isSameDay, parseISO } from 'date-fns';
import { MANAGE_EVENT_ACCESS_ROLES, fetchAccessibleEvents } from '../../lib/eventAccess';

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
  const [loading, setLoading] = useState(true);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
        } else {
            setActivityLogs([]);
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
    <div className="bg-white border border-black/[0.08] rounded-lg p-3 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-medium text-[#111110] leading-none font-mono">{loading ? '…' : value}</p>
        <p className="text-[11px] sm:text-xs text-[#6B6860] mt-1 truncate">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-0 overflow-y-auto -m-4 h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)] p-4 md:py-8 md:px-12 lg:px-16 space-y-4">
      {/* Top Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={CalendarIcon} label="Total Events" value={stats.totalEvents} color="bg-[#4B3FE4]/10 text-[#4B3FE4]" />
        <StatCard icon={Radio} label="On-going Events" value={stats.activeEvents} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Clock} label="Upcoming Events" value={stats.upcomingEvents} color="bg-blue-50 text-blue-600" />
        <StatCard icon={CheckCircle} label="Completed Events" value={stats.completedEvents} color="bg-stone-100 text-stone-500" />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="w-full lg:flex-1 min-w-0 space-y-4">
      {/* Happening Today hero */}
      <div className="bg-white rounded-lg border border-black/[0.08] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.06] bg-emerald-50/40">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h3 className="text-sm font-semibold text-[#111110] uppercase tracking-[0.08em]">Happening Today</h3>
          <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full font-medium font-mono bg-emerald-100 text-emerald-700">
            {ongoingEvents.length}
          </span>
          <span className="ml-auto text-xs text-[#6B6860] font-mono">{format(new Date(), 'MMMM d, yyyy')}</span>
        </div>

        {ongoingEvents.length > 0 ? (
          <div className="divide-y divide-black/[0.04]">
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
                    <p className="text-sm font-semibold text-[#111110] leading-snug line-clamp-1 group-hover:text-[#4B3FE4] transition-colors">
                      {event.event_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#6B6860]">
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} className="shrink-0 text-[#9A9890]" />
                        <span className="font-mono">{formatEventDates(event)}</span>
                        <span className="text-[#C5C2BA]">·</span>
                        <span className="font-mono">{sessionLabel(event.session)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <MapPin size={12} className="shrink-0 text-[#9A9890]" />
                        <span className="truncate max-w-[20rem]">{event.venue}</span>
                      </span>
                    </div>
                  </div>

                  {/* Live attendance */}
                  <div className="w-full md:w-56 shrink-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#9A9890]">Present</span>
                      <span className="text-xs font-mono text-[#111110]">
                        <span className="font-semibold text-emerald-600">{event.present_count ?? 0}</span>
                        <span className="text-[#9A9890]"> / {event.registered_count} registered</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#E8E5DC]/60 overflow-hidden">
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
                        onClick={() => navigate('/scan')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#4B3FE4] px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#3B30C4]"
                      >
                        <ScanLine size={13} />
                        Scan
                      </button>
                    )}
                    {hasPermission('VIEW_PARTICIPANTS') && (
                      <button
                        type="button"
                        onClick={() => navigate('/attendance')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[#111110] shadow-sm transition-colors hover:bg-[#F5F3EE]"
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
          <p className="py-10 text-center text-xs text-[#9A9890]">{loading ? 'Loading…' : 'No events happening today.'}</p>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="bg-white rounded-lg border border-black/[0.08]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-black/[0.06]">
          <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
            <Clock size={13} />
          </span>
          <h3 className="text-sm font-semibold text-[#111110]">Upcoming Events</h3>
          <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full font-medium font-mono bg-blue-50 text-blue-700">
            {upcomingEvents.length}
          </span>
          <button
            type="button"
            onClick={() => navigate('/events')}
            className="ml-auto text-xs font-medium text-[#4B3FE4] hover:text-[#3B30C4] hover:underline transition-colors"
          >
            View all
          </button>
        </div>
        {upcomingEvents.length > 0 ? (
          <div className="divide-y divide-black/[0.04] px-4">
            {upcomingEvents.map((event) => (
              <div
                key={event.event_id}
                onClick={() => navigate(`/events?event=${event.event_id}`)}
                title="View participants"
                className="flex items-start gap-2.5 py-3 -mx-4 px-4 cursor-pointer hover:bg-[#F5F3EE]/60 transition-colors"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4B3FE4]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#111110] leading-snug line-clamp-1">{event.event_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#6B6860]">
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} className="shrink-0 text-[#9A9890]" />
                      <span className="font-mono">{formatEventDates(event)}</span>
                      <span className="text-[#C5C2BA]">·</span>
                      <span className="font-mono">{sessionLabel(event.session)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MapPin size={12} className="shrink-0 text-[#9A9890]" />
                      <span className="truncate max-w-[16rem]">{event.venue}</span>
                    </span>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-[#6B6860]" title="Registered">
                  <Users size={13} className="text-[#9A9890]" />
                  <span className="font-mono">{event.registered_count}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-[#9A9890]">{loading ? 'Loading…' : 'No upcoming events.'}</p>
        )}
      </div>
        </div>

        {/* Activity Logs rail */}
        <div className="w-full lg:w-[30%] xl:w-[28%] shrink-0 bg-white rounded-lg border border-black/[0.08]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-black/[0.06]">
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[#4B3FE4]/10 text-[#4B3FE4]">
              <Activity size={13} />
            </span>
            <h3 className="text-sm font-semibold text-[#111110]">Activity Logs</h3>
          </div>
          {activityLogs.length > 0 ? (
            <div className="divide-y divide-black/[0.04]">
              {activityLogs.map((item) => (
                <div key={item.key} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    item.type === 'scan' ? 'bg-emerald-50 text-emerald-600' : 'bg-[#4B3FE4]/10 text-[#4B3FE4]'
                  }`}>
                    {item.type === 'scan' ? <ScanLine size={12} /> : <UserPlus size={12} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug text-[#111110]">
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-[#6B6860]"> · {item.detail}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#9A9890]">{item.eventName}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono text-[#9A9890]" title={format(parseISO(item.timestamp), 'MMM d, yyyy h:mm a')}>
                    {formatDistanceToNowStrict(parseISO(item.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-[#9A9890]">{loading ? 'Loading…' : 'No recent activity.'}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
