import React, { useState, useRef, useEffect } from 'react';
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
  ClipboardList,
  KeyRound,
  Loader2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  User,
  ShieldCheck,
  Search
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut, changePassword, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ new: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pwMessage, setPwMessage] = useState('');

  // Determine Layout Mode based on permissions
  const showSidebar = hasPermission('VIEW_DASHBOARD');

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwStatus('loading');
    setPwMessage('');

    if (pwForm.new !== pwForm.confirm) {
        setPwStatus('error');
        setPwMessage("New passwords do not match.");
        return;
    }

    if (pwForm.new.length < 4) {
        setPwStatus('error');
        setPwMessage("Password must be at least 4 characters.");
        return;
    }

    try {
        await changePassword(pwForm.new);
        setPwStatus('success');
        setPwMessage("Password changed successfully.");
        setPwForm({ new: '', confirm: '' });
        setTimeout(() => {
            setIsPasswordModalOpen(false);
            setPwStatus('idle');
            setPwMessage('');
        }, 1500);
    } catch (err: any) {
        setPwStatus('error');
        setPwMessage(err.message || "Failed to change password.");
    }
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

  const PasswordModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => setIsPasswordModalOpen(false)}
        ></div>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center text-white">
                <h3 className="font-semibold flex items-center gap-2">
                    <KeyRound size={20} /> Change Password
                </h3>
                <button 
                    onClick={() => setIsPasswordModalOpen(false)} 
                    className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition"
                >
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6">
                {pwStatus === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-green-600">
                        <CheckCircle size={48} className="mb-3" />
                        <p className="font-bold text-lg">Password Updated!</p>
                    </div>
                ) : (
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        {pwStatus === 'error' && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
                                {pwMessage}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                            <input 
                                type="password" 
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                value={pwForm.new}
                                onChange={e => setPwForm({...pwForm, new: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                            <input 
                                type="password" 
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                value={pwForm.confirm}
                                onChange={e => setPwForm({...pwForm, confirm: e.target.value})}
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={pwStatus === 'loading'}
                            className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 mt-2"
                        >
                            {pwStatus === 'loading' && <Loader2 className="animate-spin" size={18} />}
                            Update Password
                        </button>
                    </form>
                )}
            </div>
        </div>
    </div>
  );

  // Scanner Mode Layout (Full screen, no sidebar)
  // Used if user doesn't have permission to view dashboard (e.g. Scanner Role)
  if (!showSidebar) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Top Bar for Scanner */}
        <header className="bg-white shadow-sm p-4 flex justify-between items-center z-10 sticky top-0">
          <h1 className="text-xl font-bold text-indigo-600">Event Management Portal</h1>
          <div className="flex items-center gap-3">
             <button 
                onClick={() => navigate('/lookup')}
                className="p-2 text-slate-600 hover:text-indigo-600 transition-colors"
                title="Name Lookup"
            >
                <Search size={20} />
            </button>
            <div className="relative" ref={dropdownRef}>
                <button 
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 py-1.5 px-3 rounded-full transition-colors text-slate-700"
                >
                    <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                        <User size={14} />
                    </div>
                    <span className="text-sm font-medium hidden sm:block">{user?.username}</span>
                    <ChevronDown size={14} />
                </button>

                {isProfileDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                        <button
                            onClick={() => {
                                setIsPasswordModalOpen(true);
                                setIsProfileDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                        >
                            <KeyRound size={16} /> Change Password
                        </button>
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <LogOut size={16} /> Sign Out
                        </button>
                    </div>
                )}
            </div>
          </div>
        </header>
        <main className="flex-1 relative overflow-hidden">
            {children}
        </main>
        {isPasswordModalOpen && <PasswordModal />}
      </div>
    );
  }

  // Dashboard Layout with Sidebar
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white shadow-sm p-4 flex justify-between items-center z-20 sticky top-0">
        <h1 className="text-xl font-bold text-indigo-600">Event Management Portal</h1>
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
            <h1 className="text-xl font-bold text-indigo-600">R10 Event Portal</h1>
            <p className="text-sm text-slate-500">Admin Portal</p>
          </div>

          <nav className="flex-1 px-4 space-y-2 mt-4 md:mt-0">
            {hasPermission('VIEW_DASHBOARD') && (
                <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
            )}
            {hasPermission('MANAGE_EVENTS') && (
                <NavItem to="/events" icon={CalendarDays} label="Events" />
            )}
            {hasPermission('VIEW_PARTICIPANTS') && (
                <NavItem to="/attendance" icon={ClipboardList} label="Attendance" />
            )}

            {/* Public but accessible internal tool */}
            <NavItem to="/lookup" icon={Search} label="Name Lookup" />

            {hasPermission('VIEW_REPORTS') && (
                <NavItem to="/reports" icon={FileBarChart} label="Reports" />
            )}
            
            {hasPermission('MANAGE_USERS') && (
              <div className="pt-2 mt-2 border-t border-slate-100">
                <NavItem to="/users" icon={ShieldCheck} label="Users" />
              </div>
            )}

            {hasPermission('SCAN_QR') && (
              <div className="pt-2 mt-2 border-t border-slate-100">
                <NavItem to="/scan" icon={ScanLine} label="Scan Mode" />
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-slate-200 relative" ref={dropdownRef}>
            
            {/* Pop-up Dropdown Menu */}
            {isProfileDropdownOpen && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 z-50 animate-in slide-in-from-bottom-2 duration-200">
                    <button
                        onClick={() => {
                            setIsPasswordModalOpen(true);
                            setIsProfileDropdownOpen(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                        <KeyRound size={18} /> Change Password
                    </button>
                    <div className="h-px bg-slate-100 mx-2 my-1"></div>
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <LogOut size={18} /> Sign Out
                    </button>
                </div>
            )}

            {/* User Profile Trigger */}
            <button 
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className={`flex items-center w-full p-2.5 rounded-lg transition-all ${isProfileDropdownOpen ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border border-transparent'}`}
            >
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg mr-3">
                    {user?.full_name.charAt(0)}
                </div>
                <div className="flex-1 text-left overflow-hidden">
                    <p className="text-sm font-semibold text-slate-800 truncate">{user?.full_name}</p>
                    <p className="text-xs text-slate-500 capitalize truncate">{user?.role}</p>
                </div>
                <div className="text-slate-400">
                    {isProfileDropdownOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </div>
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

      {/* Global Password Modal */}
      {isPasswordModalOpen && <PasswordModal />}
    </div>
  );
};

export default Layout;
