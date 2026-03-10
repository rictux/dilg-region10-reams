
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
    Calendar as CalendarIcon, 
    CheckCircle, 
    Clock, 
    ChevronLeft, 
    ChevronRight,
    Users,
    Briefcase,
    MapPin
} from 'lucide-react';
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek, 
    eachDayOfInterval, 
    isSameMonth, 
    isSameDay, 
    addMonths, 
    subMonths,
    parseISO,
    isToday,
    isWithinInterval,
    startOfDay,
    endOfDay,
    isBefore,
    isAfter,
    differenceInDays
} from 'date-fns';

interface DashboardEvent {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string;
  end_date: string;
  registered_count: number;
  present_count?: number; 
  status?: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    completedEvents: 0
  });
  const [ongoingEvents, setOngoingEvents] = useState<DashboardEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<DashboardEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<DashboardEvent[]>([]); // Events for the calendar
  const [currentDate, setCurrentDate] = useState(new Date()); // For Calendar Navigation
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
    const today = new Date().toISOString().split('T')[0];

    try {
        // 1. Stats
        let totalQ = supabase.from('events').select('*', { count: 'exact', head: true });
        if (user?.role !== 'Admin' && user?.office_id) totalQ = totalQ.eq('organize_by', user.office_id);
        const { count: total } = await totalQ;

        let activeQ = supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'Ongoing');
        if (user?.role !== 'Admin' && user?.office_id) activeQ = activeQ.eq('organize_by', user.office_id);
        const { count: active } = await activeQ;

        let completedQ = supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'Completed');
        if (user?.role !== 'Admin' && user?.office_id) completedQ = completedQ.eq('organize_by', user.office_id);
        const { count: completed } = await completedQ;

        setStats({
            totalEvents: total || 0,
            activeEvents: active || 0,
            completedEvents: completed || 0
        });

        // 2. On-going Events
        let ongoingQuery = supabase
            .from('events')
            .select('*')
            .lte('start_date', today)
            .gte('end_date', today);
        
        if (user?.role !== 'Admin' && user?.office_id) ongoingQuery = ongoingQuery.eq('organize_by', user.office_id);
        const { data: ongoingData } = await ongoingQuery;
        
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
                .eq('scan_status', 'Valid');

            return {
                ...e,
                registered_count: regCount || 0,
                present_count: amCount || 0
            };
        }));
        setOngoingEvents(ongoingEventsWithCounts);

        // 3. Upcoming Events
        let upcomingQuery = supabase
            .from('events')
            .select('*')
            .gt('start_date', today)
            .order('start_date', { ascending: true })
            .limit(5);
        
        if (user?.role !== 'Admin' && user?.office_id) upcomingQuery = upcomingQuery.eq('organize_by', user.office_id);
        const { data: upcomingData } = await upcomingQuery;

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

        // 4. All Events (For Calendar) - Fetch basic info
        let calendarQuery = supabase
            .from('events')
            .select('*')
            .neq('status', 'Cancelled');
        
        if (user?.role !== 'Admin' && user?.office_id) calendarQuery = calendarQuery.eq('organize_by', user.office_id);
        const { data: allEventsData } = await calendarQuery;
            
        // Map to match interface (counts aren't strictly needed for calendar dots but useful if we want to show them)
        const mappedCalendarEvents = (allEventsData || []).map(e => ({
            ...e,
            registered_count: 0 // Placeholder
        }));
        setCalendarEvents(mappedCalendarEvents);


    } catch (e) {
        console.error("Error fetching dashboard data", e);
    } finally {
        setLoading(false);
    }
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  // Calendar Generation Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // --- Slot Assignment Logic for Consistent Bar Positions ---
  const eventPositions = useMemo(() => {
    if (calendarEvents.length === 0) return {};

    // 1. Filter events overlapping with current view
    const visibleEvents = calendarEvents.filter(e => {
        const start = parseISO(e.start_date);
        const end = parseISO(e.end_date);
        return start <= endDate && end >= startDate;
    }).sort((a, b) => {
        // Sort by start date ASC
        const startA = parseISO(a.start_date).getTime();
        const startB = parseISO(b.start_date).getTime();
        if (startA !== startB) return startA - startB;
        
        // Then by duration DESC (Longer events on top usually looks better)
        const durA = parseISO(a.end_date).getTime() - startA;
        const durB = parseISO(b.end_date).getTime() - startB;
        return durB - durA;
    });

    const positions: Record<number, number> = {};
    const dayOccupancy: Record<string, boolean[]> = {};

    visibleEvents.forEach(event => {
        const start = parseISO(event.start_date);
        const end = parseISO(event.end_date);
        
        // Clamp to visible range for calculation
        const rangeStart = start < startDate ? startDate : start;
        const rangeEnd = end > endDate ? endDate : end;
        
        const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
        
        // Find first slot index free for ALL days this event spans
        let slot = 0;
        while(true) {
            let isFree = true;
            for (const day of days) {
                const dateKey = format(day, 'yyyy-MM-dd');
                if (!dayOccupancy[dateKey]) dayOccupancy[dateKey] = [];
                if (dayOccupancy[dateKey][slot]) {
                    isFree = false;
                    break;
                }
            }
            if (isFree) break;
            slot++;
        }
        
        // Assign slot to event
        positions[event.event_id] = slot;
        
        // Mark slot as occupied for these days
        for (const day of days) {
            const dateKey = format(day, 'yyyy-MM-dd');
            if (!dayOccupancy[dateKey]) dayOccupancy[dateKey] = [];
            dayOccupancy[dateKey][slot] = true;
        }
    });

    return positions;
  }, [calendarEvents, startDate, endDate]);

  // Helper to determine event styling
  const getEventStyle = (event: DashboardEvent, day: Date) => {
      const start = parseISO(event.start_date);
      const end = parseISO(event.end_date);
      
      const isStart = isSameDay(day, start);
      const isEnd = isSameDay(day, end);
      
      // Determine color based on status
      let baseColor = "bg-indigo-100 text-indigo-700 border-indigo-200";
      if (event.status === 'Ongoing') baseColor = "bg-green-100 text-green-700 border-green-200";
      if (event.status === 'Completed') baseColor = "bg-slate-100 text-slate-600 border-slate-200";
      if (event.status === 'Cancelled') baseColor = "bg-red-50 text-red-600 border-red-100";

      return {
          className: `
            ${baseColor}
            text-xs h-5 mb-1 px-1 flex items-center
            ${isStart ? 'rounded-l-md ml-1 border-l' : 'border-l-0 -ml-[1px]'}
            ${isEnd ? 'rounded-r-md mr-1 border-r' : 'border-r-0 -mr-[1px]'}
            ${!isStart && !isEnd ? 'rounded-none' : ''}
            border-y cursor-pointer hover:brightness-95 transition-all
            relative
          `,
          isStart,
          isEnd
      };
  };

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <div className={`${color} p-6 rounded-2xl shadow-sm flex items-center justify-between text-white`}>
      <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
        <Icon size={28} className="text-white" />
      </div>
      <div className="text-right">
        <p className="text-white/80 text-sm font-medium mb-1">{label}</p>
        <p className="text-4xl font-bold">{loading ? '...' : value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={CalendarIcon} label="Total Events" value={stats.totalEvents} color="bg-[#5C3CCE]" />
        <StatCard icon={Briefcase} label="On-Going Events" value={stats.activeEvents} color="bg-[#4099FF]" />
        <StatCard icon={Users} label="Completed Events" value={stats.completedEvents} color="bg-[#2ED47A]" />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Column - Calendar */}
        <div className="w-full lg:w-2/3 flex flex-col gap-8">
          {/* Calendar */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200/60 flex flex-col min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Event Calendar</h3>
                <div className="flex items-center gap-4">
                    <span className="text-slate-600 font-semibold w-32 text-center">
                        {format(currentDate, 'MMMM yyyy')}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col relative z-0">
                <div className="grid grid-cols-7 mb-2">
                    {weekDays.map(day => (
                        <div key={day} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider py-2">
                            {day}
                        </div>
                    ))}
                </div>
                
                <div className="grid grid-cols-7 auto-rows-fr gap-px bg-slate-100 border border-slate-100 rounded-2xl overflow-hidden flex-1">
                    {calendarDays.map((day, idx) => {
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isTodayDate = isToday(day);
                        
                        const activeEvents = calendarEvents.filter(e => {
                            const start = startOfDay(parseISO(e.start_date));
                            const end = endOfDay(parseISO(e.end_date));
                            return isWithinInterval(day, { start, end });
                        });

                        const hasEvents = activeEvents.length > 0;
                        const slots: Record<number, DashboardEvent> = {};
                        let maxSlotIndex = -1;

                        activeEvents.forEach(e => {
                            const pos = eventPositions[e.event_id];
                            if (pos !== undefined) {
                                slots[pos] = e;
                                if (pos > maxSlotIndex) maxSlotIndex = pos;
                            }
                        });

                        const renderSlots = [];
                        for (let i = 0; i <= maxSlotIndex; i++) {
                            const event = slots[i];
                            if (event) {
                                const { className, isStart } = getEventStyle(event, day);
                                const isDisplayStart = isStart || day.getDay() === 0 || day.getDate() === 1;
                                
                                let spanWidth = 'calc(100% - 8px)';
                                if (isDisplayStart) {
                                    const endOfWeekDay = endOfWeek(day);
                                    const eventEnd = startOfDay(parseISO(event.end_date));
                                    const endToUse = isBefore(eventEnd, endOfWeekDay) ? eventEnd : endOfWeekDay;
                                    const daysSpan = differenceInDays(endToUse, startOfDay(day)) + 1;
                                    spanWidth = `calc(${daysSpan * 100}% + ${(daysSpan - 1) * 1 - 8}px)`;
                                }

                                renderSlots.push(
                                    <div 
                                        key={`${event.event_id}-${day.toISOString()}`} 
                                        className={`${className} relative`}
                                        title={`${event.event_name} (${event.status})`}
                                    >
                                        {isDisplayStart && (
                                            <span 
                                                className="absolute left-1 truncate font-medium z-50 pointer-events-none"
                                                style={{ width: spanWidth }}
                                            >
                                                {event.event_name}
                                            </span>
                                        )}
                                        <span className="opacity-0 select-none truncate">{event.event_name}</span>
                                    </div>
                                );
                            } else {
                                renderSlots.push(<div key={`spacer-${i}`} className="h-5 mb-1"></div>);
                            }
                        }

                        return (
                            <div 
                                key={idx} 
                                className={`
                                    min-h-[100px] flex flex-col relative group
                                    ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-300'}
                                    ${isTodayDate ? '!bg-indigo-50/30' : ''}
                                    transition-colors hover:bg-slate-50
                                `}
                                style={{ zIndex: calendarDays.length - idx }}
                            >
                                <div className="text-xs font-medium p-2 flex justify-between items-center">
                                    <span className={`
                                        w-7 h-7 flex items-center justify-center rounded-full transition-all
                                        ${isTodayDate 
                                            ? 'bg-[#4322A7] text-white font-bold shadow-md' 
                                            : hasEvents && isCurrentMonth 
                                                ? 'bg-indigo-100 text-[#4322A7] font-bold' 
                                                : 'text-slate-500 group-hover:bg-slate-200'
                                        }
                                    `}>
                                        {format(day, 'd')}
                                    </span>
                                </div>
                                
                                <div className="flex-1 flex flex-col pb-1">
                                    {renderSlots}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
          </div>
        </div>

        {/* Right Column - Event Lists */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex flex-col gap-8">
            {/* Ongoing Events */}
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Clock className="text-[#4322A7]" size={20} />
                On-going Events
              </h3>
              {ongoingEvents.length > 0 ? (
                <div className="space-y-4">
                  {ongoingEvents.map((event, index) => (
                    <div key={event.event_id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="mb-3">
                        <h4 className="font-bold text-sm text-slate-800 line-clamp-2 leading-tight mb-2">{event.event_name}</h4>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[#4322A7] mb-1.5">
                          <MapPin size={14} className="shrink-0" />
                          <span className="truncate">{event.venue}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <CalendarIcon size={14} className="shrink-0" />
                          <span>{format(new Date(event.start_date), 'MMM d, yyyy')} - {format(new Date(event.end_date), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div className="text-center flex-1 border-r border-slate-200">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Registered</p>
                          <p className="font-bold text-sm text-slate-800">{event.registered_count}</p>
                        </div>
                        <div className="text-center flex-1">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Present</p>
                          <p className="font-bold text-sm text-[#4322A7]">{event.present_count}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-100">
                  <Clock className="w-8 h-8 mb-2 mx-auto opacity-20" />
                  No on-going events.
                </div>
              )}
            </div>

            {/* Upcoming Events */}
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <CalendarIcon className="text-[#4099FF]" size={20} />
                Upcoming Events
              </h3>
              {upcomingEvents.length > 0 ? (
                <div className="space-y-4">
                  {upcomingEvents.map((event, index) => (
                    <div key={event.event_id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="mb-3">
                        <h4 className="font-bold text-sm text-slate-800 line-clamp-2 leading-tight mb-2">{event.event_name}</h4>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[#4099FF] mb-1.5">
                          <MapPin size={14} className="shrink-0" />
                          <span className="truncate">{event.venue}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <CalendarIcon size={14} className="shrink-0" />
                          <span>{format(new Date(event.start_date), 'MMM d, yyyy')} - {format(new Date(event.end_date), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div className="text-center flex-1 border-r border-slate-200">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Registered</p>
                          <p className="font-bold text-sm text-slate-800">{event.registered_count}</p>
                        </div>
                        <div className="text-center flex-1">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Present</p>
                          <p className="font-bold text-sm text-[#4099FF]">-</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-100">
                  <CalendarIcon className="w-8 h-8 mb-2 mx-auto opacity-20" />
                  No upcoming events.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
