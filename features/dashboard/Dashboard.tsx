import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
    Calendar as CalendarIcon, 
    CheckCircle, 
    Clock, 
    MapPin, 
    Layers, 
    ChevronLeft, 
    ChevronRight,
    Users
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
    isToday
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
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    completedEvents: 0
  });
  const [todaysEvents, setTodaysEvents] = useState<DashboardEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<DashboardEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<DashboardEvent[]>([]); // Events for the calendar
  const [currentDate, setCurrentDate] = useState(new Date()); // For Calendar Navigation
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();

    // Realtime subscriptions
    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDashboardData = async () => {
    const today = new Date().toISOString().split('T')[0];

    try {
        // 1. Stats
        const { count: total } = await supabase.from('events').select('*', { count: 'exact', head: true });
        const { count: active } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'Ongoing');
        const { count: completed } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'Completed');

        setStats({
            totalEvents: total || 0,
            activeEvents: active || 0,
            completedEvents: completed || 0
        });

        // 2. Today's Events
        const { data: todayData } = await supabase
            .from('events')
            .select('*')
            .lte('start_date', today)
            .gte('end_date', today);
        
        const todaysEventsWithCounts = await Promise.all((todayData || []).map(async (e) => {
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
        setTodaysEvents(todaysEventsWithCounts);

        // 3. Upcoming Events
        const { data: upcomingData } = await supabase
            .from('events')
            .select('*')
            .gt('start_date', today)
            .order('start_date', { ascending: true })
            .limit(5);

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
        // We fetch events for a broad range or all to populate calendar
        const { data: allEventsData } = await supabase
            .from('events')
            .select('*')
            .neq('status', 'Cancelled');
            
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

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
      <div className={`p-3 rounded-full ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
        <Icon size={24} className={color.replace('bg-', 'text-')} />
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{loading ? '...' : value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Dashboard Overview</h2>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Layers} label="Total Events" value={stats.totalEvents} color="bg-indigo-500" />
        <StatCard icon={CheckCircle} label="Active Events" value={stats.activeEvents} color="bg-emerald-500" />
        <StatCard icon={CalendarIcon} label="Completed Events" value={stats.completedEvents} color="bg-slate-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        
        {/* LEFT COLUMN: Calendar (2/3 width) */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-full min-h-[500px]">
            {/* Calendar Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <CalendarIcon className="text-indigo-600" size={20} /> Event Calendar
                </h3>
                <div className="flex items-center gap-4">
                    <span className="text-slate-600 font-semibold w-32 text-center">
                        {format(currentDate, 'MMMM yyyy')}
                    </span>
                    <div className="flex gap-1">
                        <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 p-6">
                <div className="grid grid-cols-7 mb-2">
                    {weekDays.map(day => (
                        <div key={day} className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider py-2">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-2 h-full auto-rows-fr">
                    {calendarDays.map((day, idx) => {
                        const dayEvents = calendarEvents.filter(e => isSameDay(parseISO(e.start_date), day));
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isTodayDate = isToday(day);

                        return (
                            <div 
                                key={idx} 
                                className={`
                                    min-h-[80px] p-2 rounded-lg border flex flex-col relative group transition-colors
                                    ${isCurrentMonth ? 'bg-white border-slate-100' : 'bg-slate-50/50 border-transparent text-slate-300'}
                                    ${isTodayDate ? 'ring-2 ring-indigo-500 ring-offset-2 z-10' : ''}
                                    ${dayEvents.length > 0 && isCurrentMonth ? 'hover:bg-indigo-50 hover:border-indigo-200 cursor-pointer' : ''}
                                `}
                            >
                                <span className={`text-sm font-medium ${isTodayDate ? 'text-indigo-600' : 'text-slate-600'}`}>
                                    {format(day, 'd')}
                                </span>
                                
                                {/* Event Dots */}
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {dayEvents.map((e, i) => (
                                        <div 
                                            key={i} 
                                            className={`w-2 h-2 rounded-full 
                                                ${e.status === 'Completed' ? 'bg-slate-400' : 'bg-indigo-500'}
                                            `} 
                                        />
                                    ))}
                                </div>

                                {/* Hover Tooltip/Popover */}
                                {dayEvents.length > 0 && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl z-50 hidden group-hover:block pointer-events-none animate-in fade-in zoom-in-95 duration-200">
                                        <div className="font-bold border-b border-slate-600 pb-1 mb-2 text-slate-300">
                                            {format(day, 'MMMM d, yyyy')}
                                        </div>
                                        <div className="space-y-2">
                                            {dayEvents.map(e => (
                                                <div key={e.event_id} className="flex flex-col">
                                                    <span className="font-semibold text-white">{e.event_name}</span>
                                                    <span className="text-slate-400 text-[10px]">{e.venue}</span>
                                                    <span className={`text-[9px] px-1.5 rounded w-fit mt-0.5
                                                        ${e.status === 'Ongoing' ? 'bg-green-500/20 text-green-300' : 
                                                          e.status === 'Completed' ? 'bg-slate-500/20 text-slate-300' : 
                                                          'bg-blue-500/20 text-blue-300'}
                                                    `}>
                                                        {e.status}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Tooltip arrow */}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN: Stacked Today's Events & Upcoming Events (1/3 width) */}
        <div className="flex flex-col gap-6">
            
            {/* Today's Events (Card View) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col max-h-[500px] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 sticky top-0 bg-white z-10 pb-2">
                    <Clock className="text-green-600" size={20} /> Today's Events
                </h3>
                
                <div className="space-y-4">
                    {todaysEvents.map((event) => (
                        <div key={event.event_id} className="p-4 rounded-xl border border-green-100 bg-green-50/30 hover:shadow-md transition-all group">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-slate-800 mb-1 group-hover:text-green-700 transition-colors line-clamp-2">{event.event_name}</h4>
                                <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                    Today
                                </span>
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                                <MapPin size={12} /> {event.venue}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-green-100">
                                <div className="text-center bg-white rounded p-1.5 border border-slate-100">
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">Registered</p>
                                    <p className="text-sm font-bold text-blue-600">{event.registered_count}</p>
                                </div>
                                <div className="text-center bg-white rounded p-1.5 border border-slate-100">
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">Present</p>
                                    <p className="text-sm font-bold text-green-600">{event.present_count}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                    {todaysEvents.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-100">
                            <Clock className="w-8 h-8 mb-2 mx-auto opacity-20" />
                            No events happening today.
                        </div>
                    )}
                </div>
            </div>

            {/* Upcoming Events (Card View) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 sticky top-0 bg-white z-10 pb-2">
                    <CalendarIcon className="text-orange-500" size={20} /> Upcoming Events
                </h3>
                <div className="space-y-4">
                    {upcomingEvents.map((event) => (
                        <div key={event.event_id} className="p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/5 transition-all group bg-slate-50/50 hover:bg-white">
                            <h4 className="font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors line-clamp-2">{event.event_name}</h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                                <MapPin size={12} /> {event.venue}
                            </div>
                            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100">
                                <span className="text-slate-600 flex items-center gap-1.5 font-medium text-xs">
                                    <Clock size={14} className="text-slate-400" />
                                    {format(new Date(event.start_date), 'MMM d, yyyy')}
                                </span>
                                 <span className="bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1">
                                    <Users size={10} /> {event.registered_count} Reg.
                                </span>
                            </div>
                        </div>
                    ))}
                     {upcomingEvents.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-100">
                            No upcoming events found.
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
