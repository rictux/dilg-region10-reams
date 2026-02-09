import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  ScanLine, 
  LogOut, 
  Menu, 
  X,
  FileBarChart,
  ClipboardList
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // If scanner role, strictly show simplified layout or redirect
  const isScanner = user?.role === 'Scanner';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = location.pathname === to;
    return (
      <button
        onClick={() => {
          navigate(to);
          setIsMobileMenuOpen(false);
        }}
        className={`flex items-center space-x-3 w-full px-4 py-3 rounded-lg transition-colors ${
          isActive 
            ? 'bg-indigo-600 text-white shadow-md' 
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Icon size={20} />
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  // Scanner Layout (Minimal)
  if (isScanner) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Top Bar for Scanner */}
        <header className="bg-white shadow-sm p-4 flex justify-between items-center z-10 sticky top-0">
          <h1 className="text-xl font-bold text-indigo-600">EventPulse Scan</h1>
          <button onClick={handleSignOut} className="text-slate-500 hover:text-red-500">
            <LogOut size={24} />
          </button>
        </header>
        <main className="flex-1 relative overflow-hidden">
            {children}
        </main>
      </div>
    );
  }

  // Admin/Manager Layout
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white shadow-sm p-4 flex justify-between items-center z-20 sticky top-0">
        <h1 className="text-xl font-bold text-indigo-600">EventPulse</h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        md:translate-x-0 md:static md:shadow-none border-r border-slate-200
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6 hidden md:block">
            <h1 className="text-2xl font-bold text-indigo-600">EventPulse</h1>
            <p className="text-sm text-slate-500">Admin Portal</p>
          </div>

          <nav className="flex-1 px-4 space-y-2 mt-4 md:mt-0">
            <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
            <NavItem to="/events" icon={CalendarDays} label="Events" />
            <NavItem to="/attendance" icon={ClipboardList} label="Attendance" />
            <NavItem to="/reports" icon={FileBarChart} label="Reports" />
            {/* Admins can also scan if they want */}
            <NavItem to="/scan" icon={ScanLine} label="Scan Mode" />
          </nav>

          <div className="p-4 border-t border-slate-200">
            <div className="mb-4 px-4">
              <p className="text-sm font-semibold text-slate-700 truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-3 w-full px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut size={20} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 h-[calc(100vh-64px)] md:h-screen">
        {children}
      </main>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;