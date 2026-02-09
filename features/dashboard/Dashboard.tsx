import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Calendar, CheckCircle, BarChart } from 'lucide-react';
import { BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    activeEvents: 0,
    totalParticipants: 0,
    recentScans: 0
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    // 1. Active Events (Status: Ongoing)
    const { count: eventsCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Ongoing');

    // 2. Total Participants
    const { count: participantsCount } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true });

    // 3. Scans today
    const today = new Date().toISOString().split('T')[0];
    const { count: scansCount, data: scans } = await supabase
      .from('attendance_logs')
      .select('scan_time, scan_status', { count: 'exact' })
      .eq('attendance_date', today);

    setStats({
      activeEvents: eventsCount || 0,
      totalParticipants: participantsCount || 0,
      recentScans: scansCount || 0
    });

    // Mock chart data generation from scans
    if (scans) {
        const hourly = scans.reduce((acc: any, curr: any) => {
            const hour = new Date(curr.scan_time).getHours();
            acc[hour] = (acc[hour] || 0) + 1;
            return acc;
        }, {});
        
        const data = Object.keys(hourly).map(h => ({ name: `${h}:00`, scans: hourly[h] }));
        setChartData(data);
    }
    
    // Recent activity
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select(`
            scan_time, 
            scan_status,
            action_session,
            participants (full_name),
            events (event_name)
        `)
        .order('scan_time', { ascending: false })
        .limit(5);
        
    setRecentLogs(logs || []);
  };

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
      <div className={`p-3 rounded-full ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
        <Icon size={24} className={color.replace('bg-', 'text-')} />
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Dashboard Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Calendar} label="Active Events" value={stats.activeEvents} color="bg-indigo-500" />
        <StatCard icon={Users} label="Total Participants" value={stats.totalParticipants} color="bg-emerald-500" />
        <StatCard icon={CheckCircle} label="Scans Today" value={stats.recentScans} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart size={20} /> Today's Traffic
            </h3>
            <div className="h-64 w-full">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <ReBarChart data={chartData}>
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Bar dataKey="scans" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </ReBarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">No scan data today</div>
                )}
            </div>
        </div>

        {/* Recent Logs Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLogs.map((log, idx) => (
                    <tr key={idx}>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                            {new Date(log.scan_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                            {log.participants?.full_name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold
                                ${log.scan_status === 'Valid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
                            `}>
                                {log.scan_status.toUpperCase()}
                            </span>
                        </td>
                    </tr>
                ))}
                {recentLogs.length === 0 && (
                    <tr>
                        <td colSpan={3} className="text-center py-4 text-slate-400">No recent activity</td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;