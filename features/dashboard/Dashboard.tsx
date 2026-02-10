import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, CheckCircle, Clock, MapPin, Layers } from 'lucide-react';
import { format } from 'date-fns';

interface DashboardEvent {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string;
  end_date: string;
  registered_count: number;
  present_count?: number; // Only for today's events
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    completedEvents: 0
  });
  const [todaysEvents, setTodaysEvents] = useState<DashboardEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<DashboardEvent[]>([]);
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
    // Note: We don't set loading(true) here to avoid UI flickering on realtime updates
    // We only set it initially or manage a separate 'refreshing' state if needed
    
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
            // Count registered
            const { count: regCount } = await supabase
                .from('event_participants')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', e.event_id)
                .eq('registration_status', 'Registered');
            
            // Count present (AM logs today)
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

    } catch (e) {
        console.error("Error fetching dashboard data", e);
    } finally {
        setLoading(false);
    }
  };

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
        <StatCard icon={Calendar} label="Completed Events" value={stats.completedEvents} color="bg-slate-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Today's Events - Takes up 2 columns */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800">
                <Clock className="text-indigo-600" size={20} /> Today's Events
            </h3>
            
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3">Event Name</th>
                            <th className="px-4 py-3">Venue</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3 text-center">Registered</th>
                            <th className="px-4 py-3 text-center">Present (AM)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {todaysEvents.map((event) => (
                            <tr key={event.event_id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-800">{event.event_name}</td>
                                <td className="px-4 py-3 text-slate-600">{event.venue}</td>
                                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                    {format(new Date(event.start_date), 'MMM d, yyyy')}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-100">
                                        {event.registered_count}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold border border-green-100">
                                        {event.present_count}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {todaysEvents.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-slate-400 bg-slate-50/30 rounded-lg border-2 border-dashed border-slate-100 m-2">
                                    <div className="flex flex-col items-center">
                                        <Calendar className="w-8 h-8 mb-2 opacity-20" />
                                        <span>No events scheduled for today.</span>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Upcoming Events - Takes up 1 column */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800">
            <Calendar className="text-orange-500" size={20} /> Upcoming Events
          </h3>
          <div className="space-y-4">
            {upcomingEvents.map((event) => (
                <div key={event.event_id} className="p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/5 transition-all group bg-slate-50/50 hover:bg-white">
                    <h4 className="font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors line-clamp-1">{event.event_name}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                        <MapPin size={12} /> {event.venue}
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100">
                        <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                            <Clock size={14} className="text-slate-400" />
                            {format(new Date(event.start_date), 'MMM d, yyyy')}
                        </span>
                         <span className="bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-medium">
                            {event.registered_count} Reg.
                        </span>
                    </div>
                </div>
            ))}
             {upcomingEvents.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm bg-slate-50/30 rounded-lg border-2 border-dashed border-slate-100">
                    No upcoming events found.
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;