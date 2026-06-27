
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, 
  Calendar, 
  UserCheck, 
  Search, 
  BarChart2, 
  Users, 
  ScanLine, 
  LogOut, 
  Menu, 
  X,
  KeyRound,
  Loader2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  User,
  Eye,
  EyeOff,
  Camera,
  Info,
  Settings
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut, changePassword, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [pwForm, setPwForm] = useState({ new: '', confirm: '' });
  const [profileForm, setProfileForm] = useState({
      full_name: '',
      email: '',
      username: '',
      position: '',
      img_link: ''
  });
  const [pwStatus, setPwStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pwMessage, setPwMessage] = useState('');
  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [profileMessage, setProfileMessage] = useState('');
  
  // Password Visibility State
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const showSidebar = hasPermission('VIEW_DASHBOARD');
  const shouldCollapseSidebarContent = isSidebarCollapsed && !isMobileMenuOpen;

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
            setShowNewPw(false);
            setShowConfirmPw(false);
        }, 1500);
    } catch (err: any) {
        setPwStatus('error');
        setPwMessage(err.message || "Failed to change password.");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      try {
          setUploadingImg(true);
          setProfileStatus('idle');
          setProfileMessage('');

          if (!e.target.files || e.target.files.length === 0) {
              return;
          }

          const file = e.target.files[0];
          const fileExt = file.name.split('.').pop();
          const fileName = `${user?.user_id}-${Math.random()}.${fileExt}`;
          const filePath = `profiles/${fileName}`;

          const { error: uploadError } = await supabase.storage
              .from('img')
              .upload(filePath, file);

          if (uploadError) {
              throw uploadError;
          }

          const { data } = supabase.storage.from('img').getPublicUrl(filePath);
          
          setProfileForm({ ...profileForm, img_link: data.publicUrl });
      } catch (error: any) {
          setProfileStatus('error');
          setProfileMessage(error.message || 'Error uploading image');
      } finally {
          setUploadingImg(false);
      }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus('loading');
    setProfileMessage('');

    try {
        const { error } = await supabase
            .from('users')
            .update({
                full_name: profileForm.full_name,
                email: profileForm.email,
                username: profileForm.username,
                position: profileForm.position,
                img_link: profileForm.img_link
            })
            .eq('user_id', user?.user_id);

        if (error) throw error;

        await refreshProfile();
        setProfileStatus('success');
        setProfileMessage("Profile updated successfully.");
        
        setTimeout(() => {
            setIsProfileModalOpen(false);
            setProfileStatus('idle');
            setProfileMessage('');
        }, 1500);
    } catch (err: any) {
        setProfileStatus('error');
        setProfileMessage(err.message || "Failed to update profile.");
    }
  };

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = location.pathname === to;
    return (
      <div className="relative pl-6 pr-4 md:pr-0 my-1">
        {isActive && (
          <>
            {/* Top curve */}
            <div className="hidden md:block absolute right-0 -top-6 w-6 h-6 bg-[#f4f5f9] z-0 pointer-events-none">
              <div className="w-full h-full bg-[#4322A7] rounded-br-3xl"></div>
            </div>
            {/* Bottom curve */}
            <div className="hidden md:block absolute right-0 -bottom-6 w-6 h-6 bg-[#f4f5f9] z-0 pointer-events-none">
              <div className="w-full h-full bg-[#4322A7] rounded-tr-3xl"></div>
            </div>
            {/* Active background */}
            <div className="absolute inset-0 bg-[#f4f5f9] rounded-3xl md:rounded-l-3xl md:rounded-r-none z-0"></div>
          </>
        )}
        <button
          onClick={() => {
            navigate(to);
            setIsMobileMenuOpen(false);
          }}
          className={`relative z-10 flex items-center justify-between w-full px-4 py-3.5 transition-colors ${
            isActive 
              ? 'text-slate-800 font-semibold' 
              : 'text-indigo-100 hover:text-white'
          }`}
          title={shouldCollapseSidebarContent ? label : undefined}
          aria-current={isActive ? 'page' : undefined}
        >
          <div className="flex items-center gap-4">
            <Icon 
              size={22} 
              strokeWidth={isActive ? 2.5 : 2} 
              className={`shrink-0 transition-colors ${isActive ? 'text-[#4322A7]' : 'text-indigo-200 group-hover:text-white'}`} 
              aria-hidden="true" 
            />
            {!shouldCollapseSidebarContent && (
              <span className="app-nav-label text-[15px] tracking-wide truncate">{label}</span>
            )}
          </div>
        </button>
      </div>
    );
  };

  const SidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      {!shouldCollapseSidebarContent && (
        <div className="px-8 pt-3 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200/70">
            {title}
          </p>
        </div>
      )}
      <div>{children}</div>
    </div>
  );

  const PasswordModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => setIsPasswordModalOpen(false)}
        ></div>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-[#4322A7] to-indigo-700 px-6 py-4 flex justify-between items-center text-white">
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
                            <div className="relative">
                                <input 
                                    type={showNewPw ? "text" : "password"}
                                    required
                                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#4322A7]/20 focus:border-[#4322A7] outline-none"
                                    value={pwForm.new}
                                    onChange={e => setPwForm({...pwForm, new: e.target.value})}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPw(!showNewPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                                >
                                    {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                            <div className="relative">
                                <input 
                                    type={showConfirmPw ? "text" : "password"}
                                    required
                                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#4322A7]/20 focus:border-[#4322A7] outline-none"
                                    value={pwForm.confirm}
                                    onChange={e => setPwForm({...pwForm, confirm: e.target.value})}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                                >
                                    {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <button 
                            type="submit" 
                            disabled={pwStatus === 'loading'}
                            className="w-full bg-[#4322A7] text-white font-bold py-2.5 rounded-lg hover:bg-indigo-800 transition-all flex justify-center items-center gap-2 mt-2"
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

  const UserProfileModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => {
                setIsProfileModalOpen(false);
                setIsEditingProfile(false);
            }}
        ></div>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-[#4322A7] to-indigo-700 px-6 py-4 flex justify-between items-center text-white">
                <h3 className="font-semibold flex items-center gap-2">
                    <User size={20} /> {isEditingProfile ? 'Edit Profile' : 'User Profile'}
                </h3>
                <button 
                    onClick={() => {
                        setIsProfileModalOpen(false);
                        setIsEditingProfile(false);
                    }} 
                    className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition"
                >
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6">
                {profileStatus === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-green-600">
                        <CheckCircle size={48} className="mb-3" />
                        <p className="font-bold text-lg">Profile Updated!</p>
                    </div>
                ) : !isEditingProfile ? (
                    <div className="flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-[#4322A7] font-bold text-3xl overflow-hidden shadow-md mb-4">
                            {user?.img_link ? (
                                <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                user?.full_name?.charAt(0) || <User size={40} />
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">{user?.full_name}</h2>
                        <p className="text-sm text-slate-500 mb-6">{user?.position || 'No Position Set'}</p>
                        
                        <div className="w-full space-y-3 mb-6">
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-500">Email</span>
                                <span className="text-sm font-medium text-slate-800">{user?.email}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-500">Username</span>
                                <span className="text-sm font-medium text-slate-800">{user?.username}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-500">Role</span>
                                <span className="text-sm font-medium text-slate-800 capitalize">{user?.role}</span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setIsEditingProfile(true)}
                            className="w-full bg-slate-100 text-slate-700 font-medium py-2.5 rounded-lg hover:bg-slate-200 transition-all flex justify-center items-center gap-2"
                        >
                            Edit Profile Information
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleProfileSubmit} className="space-y-4">
                        {profileStatus === 'error' && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
                                {profileMessage}
                            </div>
                        )}
                        <div className="flex flex-col items-center mb-4">
                            <div className="relative w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-[#4322A7] font-bold text-2xl overflow-hidden shadow-sm group">
                                {profileForm.img_link || user?.img_link ? (
                                    <img src={profileForm.img_link || user?.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                    user?.full_name?.charAt(0) || <User size={32} />
                                )}
                                <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                    {uploadingImg ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={handleImageUpload}
                                        disabled={uploadingImg}
                                    />
                                </label>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">Click image to change</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                            <input 
                                type="text"
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#4322A7]/20 focus:border-[#4322A7] outline-none"
                                value={profileForm.full_name}
                                onChange={e => setProfileForm({...profileForm, full_name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <input 
                                type="email"
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#4322A7]/20 focus:border-[#4322A7] outline-none"
                                value={profileForm.email}
                                onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                            <input 
                                type="text"
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#4322A7]/20 focus:border-[#4322A7] outline-none"
                                value={profileForm.username}
                                onChange={e => setProfileForm({...profileForm, username: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Position</label>
                            <input 
                                type="text"
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#4322A7]/20 focus:border-[#4322A7] outline-none"
                                value={profileForm.position}
                                onChange={e => setProfileForm({...profileForm, position: e.target.value})}
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button 
                                type="button"
                                onClick={() => setIsEditingProfile(false)}
                                className="flex-1 bg-white border border-slate-300 text-slate-700 font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-all flex justify-center items-center"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                disabled={profileStatus === 'loading'}
                                className="flex-1 bg-[#4322A7] text-white font-bold py-2.5 rounded-lg hover:bg-indigo-800 transition-all flex justify-center items-center gap-2"
                            >
                                {profileStatus === 'loading' && <Loader2 className="animate-spin" size={18} />}
                                Save Changes
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    </div>
  );

  if (!showSidebar) {
    return (
      <div className="min-h-screen bg-[#f4f5f9] flex flex-col">
        <header className="bg-white shadow-sm p-4 flex justify-between items-center z-10 sticky top-0">
          <h1 className="text-xl font-bold text-[#4322A7]">Regional Event & Attendance Management System</h1>
          <div className="flex items-center gap-3">
             <button 
                onClick={() => navigate('/admin/lookup')}
                className="p-2 text-slate-600 hover:text-[#4322A7] transition-colors"
                title="Name Lookup"
            >
                <Search size={20} />
            </button>
            <div className="relative" ref={dropdownRef}>
                <button 
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 py-1.5 px-3 rounded-full transition-colors text-slate-700"
                >
                    <div className="w-6 h-6 bg-indigo-100 text-[#4322A7] rounded-full flex items-center justify-center overflow-hidden">
                        {user?.img_link ? (
                          <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User size={14} />
                        )}
                    </div>
                    <ChevronDown size={14} />
                </button>

                {isProfileDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                        <button
                            onClick={() => {
                                setProfileForm({
                                    full_name: user?.full_name || '',
                                    email: user?.email || '',
                                    username: user?.username || '',
                                    position: user?.position || '',
                                    img_link: user?.img_link || ''
                                });
                                setIsProfileModalOpen(true);
                                setIsProfileDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-[#4322A7] transition-colors"
                        >
                            <User size={16} /> User Profile
                        </button>
                        <button
                            onClick={() => {
                                setIsPasswordModalOpen(true);
                                setIsProfileDropdownOpen(false);
                                setShowNewPw(false);
                                setShowConfirmPw(false);
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-[#4322A7] transition-colors"
                        >
                            <KeyRound size={16} /> Change Password
                        </button>
                        {hasPermission('MANAGE_CERTIFICATE_SETTINGS') && (
                            <button
                                onClick={() => {
                                    navigate('/settings');
                                    setIsProfileDropdownOpen(false);
                                }}
                                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-[#4322A7] transition-colors"
                            >
                                <Settings size={16} /> Settings
                            </button>
                        )}
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
        {isProfileModalOpen && <UserProfileModal />}
      </div>
    );
  }

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Overview';
      case '/events': return 'Events';
      case '/attendance': return 'Attendance';
      case '/admin/lookup': return 'Name Lookup';
      case '/reports': return 'Reports';
      case '/users': return 'Users';
      case '/scan': return 'Scan Mode';
      case '/settings': return 'Settings';
      case '/about': return 'About';
      default: return 'Overview';
    }
  };

  const isScanRoute = location.pathname === '/scan';

  return (
    <div className="desktop-compact-shell h-screen bg-[#f4f5f9] flex flex-col md:flex-row font-sans overflow-hidden">
      <aside className={`
        app-sidebar
        ${isSidebarCollapsed ? 'app-sidebar-collapsed' : 'app-sidebar-expanded'}
        fixed inset-y-0 left-0 z-30 bg-[#4322A7] transform transition-all duration-300 ease-in-out
        md:translate-x-0 md:static md:shadow-none
        ${isMobileMenuOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full w-[280px]'}
        ${isSidebarCollapsed ? 'md:w-[72px]' : 'md:w-[280px]'}
        rounded-tr-3xl rounded-br-3xl md:rounded-r-3xl
        flex flex-col overflow-hidden
      `}>
        <div className={`app-sidebar-header p-8 flex items-center gap-3 ${shouldCollapseSidebarContent ? 'justify-center px-4' : ''}`}>
          <div className="w-[32px] h-[32px] bg-white rounded-full flex items-center justify-center shrink-0 overflow-hidden">
            <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain" />
          </div>
          {!shouldCollapseSidebarContent && (
            <h1 className="app-sidebar-title text-2xl font-bold text-white tracking-wide whitespace-nowrap">REAMS</h1>
          )}
        </div>

        <nav className="flex-1 space-y-4 pt-6 pb-6 overflow-y-auto overflow-x-hidden no-scrollbar">
          <SidebarSection title="Menu">
            {hasPermission('VIEW_DASHBOARD') && (
                <NavItem to="/dashboard" icon={Home} label="Overview" />
            )}
            {hasPermission('MANAGE_EVENTS') && (
                <NavItem to="/events" icon={Calendar} label="Events" />
            )}
            {hasPermission('VIEW_PARTICIPANTS') && (
                <NavItem to="/attendance" icon={UserCheck} label="Attendance" />
            )}
            <NavItem to="/admin/lookup" icon={Search} label="Name Lookup" />
            {hasPermission('VIEW_REPORTS') && (
                <NavItem to="/reports" icon={BarChart2} label="Reports" />
            )}
            {hasPermission('SCAN_QR') && (
                <NavItem to="/scan" icon={ScanLine} label="Scan Mode" />
            )}
            {hasPermission('MANAGE_USERS') && (
                <NavItem to="/users" icon={Users} label="Users" />
            )}
          </SidebarSection>

          <SidebarSection title="System">
            <NavItem to="/about" icon={Info} label="About" />
            {hasPermission('MANAGE_CERTIFICATE_SETTINGS') && (
                <NavItem to="/settings" icon={Settings} label="Settings" />
            )}
          </SidebarSection>
        </nav>

        <div className={`app-sidebar-footer p-8 mt-auto text-xs text-indigo-300 space-y-2 ${shouldCollapseSidebarContent ? 'hidden' : 'block'}`}>
          <p className="font-medium text-indigo-200">Regional Event & Attendance Management System</p>
          <p>© 2026 All Rights Reserved</p>
          <p>Created by: RICTU X</p>
        </div>
      </aside>

      <main className={`app-main flex-1 overflow-hidden h-screen flex flex-col min-w-0 ${isScanRoute ? 'p-0 md:p-8' : 'p-4 md:p-8'}`}>
        <header className={`app-main-header flex items-center justify-between shrink-0 ${isScanRoute ? 'px-2 py-1.5 mb-0 md:px-0 md:py-0 md:mb-8' : 'mb-8'}`}>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600 hover:text-[#4322A7] md:hidden">
              <Menu size={28} />
            </button>
            <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2 text-slate-600 hover:text-[#4322A7] hidden md:block">
              <Menu size={28} />
            </button>
            <h2 className="app-page-title text-2xl font-bold text-slate-800 hidden sm:block">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-6 relative ml-auto" ref={dropdownRef}>
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}>
              <div className="hidden sm:block text-right mr-1">
                <p className="app-profile-greeting text-sm font-medium text-slate-800">Hello, {user?.full_name?.split(' ')[0]}</p>
              </div>
              <div className="app-profile-avatar w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-[#4322A7] font-bold text-xl overflow-hidden shadow-sm">
                {user?.img_link ? (
                  <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  user?.full_name.charAt(0)
                )}
              </div>
            </div>

            {isProfileDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-3 border-b border-slate-100 md:hidden">
                        <p className="text-sm font-bold text-slate-800">{user?.full_name}</p>
                        <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                    </div>
                    <button
                        onClick={() => {
                            setProfileForm({
                                full_name: user?.full_name || '',
                                email: user?.email || '',
                                username: user?.username || '',
                                position: user?.position || '',
                                img_link: user?.img_link || ''
                            });
                            setIsProfileModalOpen(true);
                            setIsProfileDropdownOpen(false);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-[#4322A7] transition-colors"
                    >
                        <User size={16} /> User Profile
                    </button>
                    <button
                        onClick={() => {
                            setIsPasswordModalOpen(true);
                            setIsProfileDropdownOpen(false);
                            setShowNewPw(false);
                            setShowConfirmPw(false);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-[#4322A7] transition-colors"
                    >
                        <KeyRound size={16} /> Change Password
                    </button>
                    {hasPermission('MANAGE_CERTIFICATE_SETTINGS') && (
                        <button
                            onClick={() => {
                                navigate('/settings');
                                setIsProfileDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-[#4322A7] transition-colors"
                        >
                            <Settings size={16} /> Settings
                        </button>
                    )}
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            )}
          </div>
        </header>

        <div className="flex-1 min-h-0">
          {children}
        </div>
      </main>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {isPasswordModalOpen && <PasswordModal />}
      {isProfileModalOpen && <UserProfileModal />}
    </div>
  );
};

export default Layout;
