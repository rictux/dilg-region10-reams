
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Search,
  BarChart3,
  Users,
  UserCog,
  Contact,
  ScanLine,
  LogOut,
  Menu,
  X,
  KeyRound,
  Loader2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  User,
  Eye,
  EyeOff,
  Camera,
  Info,
  Settings,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  BookOpen,
  ScrollText,
  Award,
  Gift,
  FileSignature,
  Megaphone,
  Palette
} from 'lucide-react';
import { Permission } from '../config/permissions';

const REPORT_SUBMENU = [
  { name: 'Attendance Sheet',             icon: BookOpen,   report: 'attendance-sheet' },
  { name: 'Scan Logs',                    icon: FileText,   report: 'scan-logs' },
  { name: 'Certificate of Appearance',    icon: ScrollText, report: 'appearance' },
  { name: 'Certificate of Participation', icon: Award,      report: 'participation' },
  { name: 'Giveaway Logs',                icon: Gift,       report: 'giveaways' },
];

const USERS_SUBMENU = [
  { name: 'System',      icon: UserCog, view: 'system',       adminOnly: false },
  { name: 'Participant', icon: Contact, view: 'participants', adminOnly: true },
];

const SETTINGS_SUBMENU: {
  name: string;
  icon: React.ElementType;
  view: string;
  adminOnly?: boolean;
  permission?: Permission;
}[] = [
  { name: 'Signatories',   icon: FileSignature, view: 'signatories',   permission: 'MANAGE_CERTIFICATE_SETTINGS' },
  { name: 'Announcements', icon: Megaphone,     view: 'announcements', adminOnly: true },
  { name: 'Appearance',    icon: Palette,       view: 'appearance' }, // available to every user
];

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut, changePassword, hasPermission, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Header page search (command-palette modal, permission-aware, Ctrl+K)
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const [isPageSearchOpen, setIsPageSearchOpen] = useState(false);
  const [pageSearchIndex, setPageSearchIndex] = useState(0);
  const pageSearchInputRef = useRef<HTMLInputElement>(null);

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

  const isReportsActive = location.pathname === '/reports';
  const activeReport = new URLSearchParams(location.search).get('report');
  const [reportsOpen, setReportsOpen] = useState(isReportsActive);

  const isUsersActive = location.pathname === '/users';
  const activeUsersView = new URLSearchParams(location.search).get('view') || 'system';
  const [usersOpen, setUsersOpen] = useState(isUsersActive);
  const usersSubmenu = USERS_SUBMENU.filter((child) => !child.adminOnly || user?.role === 'Admin');

  const isSettingsActive = location.pathname === '/settings';
  const activeSettingsView = new URLSearchParams(location.search).get('view') || 'signatories';
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);
  const settingsSubmenu = SETTINGS_SUBMENU.filter(
    (child) =>
      (!child.adminOnly || user?.role === 'Admin') &&
      (!child.permission || hasPermission(child.permission))
  );

  useEffect(() => {
    if (isReportsActive) setReportsOpen(true);
  }, [isReportsActive]);

  useEffect(() => {
    if (isUsersActive) setUsersOpen(true);
  }, [isUsersActive]);

  useEffect(() => {
    if (isSettingsActive) setSettingsOpen(true);
  }, [isSettingsActive]);

  // Flyout submenu shown next to the rail when the sidebar is collapsed
  const [collapsedFlyout, setCollapsedFlyout] = useState<{ menu: 'reports' | 'users' | 'settings'; top: number } | null>(null);

  useEffect(() => {
    setCollapsedFlyout(null);
  }, [location.pathname, location.search, shouldCollapseSidebarContent]);

  useEffect(() => {
    if (!collapsedFlyout) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-flyout-root]')) setCollapsedFlyout(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [collapsedFlyout]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ctrl+K / Cmd+K opens the search palette from anywhere
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPageSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  // Reset and focus the palette input each time it opens
  useEffect(() => {
    if (isPageSearchOpen) {
      setPageSearchQuery('');
      setPageSearchIndex(0);
      requestAnimationFrame(() => pageSearchInputRef.current?.focus());
    }
  }, [isPageSearchOpen]);

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

  const userInitials = (user?.full_name || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = location.pathname === to;
    return (
      <button
        onClick={() => {
          navigate(to);
          setIsMobileMenuOpen(false);
        }}
        title={shouldCollapseSidebarContent ? label : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={`group flex items-center rounded-md text-sm transition-all duration-150 ${
          shouldCollapseSidebarContent ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2 w-full'
        } ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'
        }`}
      >
        <Icon
          size={16}
          className={`shrink-0 transition-colors ${
            isActive ? 'text-indigo-400' : 'text-white/30 group-hover:text-white/50'
          }`}
          aria-hidden="true"
        />
        {!shouldCollapseSidebarContent && (
          <>
            <span className="app-nav-label flex-1 text-left truncate">{label}</span>
            {isActive && <div className="w-1 h-1 rounded-full bg-indigo-400" />}
          </>
        )}
      </button>
    );
  };

  const SidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      {!shouldCollapseSidebarContent ? (
        <p className="px-3 mb-2 text-[10px] font-medium tracking-[0.12em] uppercase text-white/25 font-mono">
          {title}
        </p>
      ) : (
        <div className="w-4 h-px bg-white/[0.08] mx-auto mb-3" />
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );

  const PasswordModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsPasswordModalOpen(false)}
        ></div>
        <div className="bg-card border border-[rgb(var(--ink)/0.10)] rounded-lg shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-[rgb(var(--ink)/0.06)] flex justify-between items-center">
                <h3 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                    <KeyRound size={16} className="text-indigo-600" /> Change Password
                </h3>
                <button
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="text-slate-600 hover:text-slate-900 p-1 hover:bg-slate-100 rounded-md transition"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="p-5">
                {pwStatus === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-emerald-600">
                        <CheckCircle size={44} className="mb-3" />
                        <p className="font-medium text-base">Password Updated!</p>
                    </div>
                ) : (
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        {pwStatus === 'error' && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-100">
                                {pwMessage}
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">New Password</label>
                            <div className="relative">
                                <input
                                    type={showNewPw ? "text" : "password"}
                                    required
                                    className="w-full px-3 py-2 pr-10 text-sm bg-card border border-[rgb(var(--ink)/0.10)] rounded-md focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                    value={pwForm.new}
                                    onChange={e => setPwForm({...pwForm, new: e.target.value})}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPw(!showNewPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                                >
                                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">Confirm New Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirmPw ? "text" : "password"}
                                    required
                                    className="w-full px-3 py-2 pr-10 text-sm bg-card border border-[rgb(var(--ink)/0.10)] rounded-md focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                    value={pwForm.confirm}
                                    onChange={e => setPwForm({...pwForm, confirm: e.target.value})}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                                >
                                    {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={pwStatus === 'loading'}
                            className="w-full h-10 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2 mt-2"
                        >
                            {pwStatus === 'loading' && <Loader2 className="animate-spin" size={16} />}
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
                setIsProfileModalOpen(false);
                setIsEditingProfile(false);
            }}
        ></div>
        <div className="bg-card border border-[rgb(var(--ink)/0.10)] rounded-lg shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-[rgb(var(--ink)/0.06)] flex justify-between items-center">
                <h3 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                    <User size={16} className="text-indigo-600" /> {isEditingProfile ? 'Edit Profile' : 'User Profile'}
                </h3>
                <button
                    onClick={() => {
                        setIsProfileModalOpen(false);
                        setIsEditingProfile(false);
                    }}
                    className="text-slate-600 hover:text-slate-900 p-1 hover:bg-slate-100 rounded-md transition"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="p-5">
                {profileStatus === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-emerald-600">
                        <CheckCircle size={44} className="mb-3" />
                        <p className="font-medium text-base">Profile Updated!</p>
                    </div>
                ) : !isEditingProfile ? (
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 rounded-full bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-600 font-medium text-2xl overflow-hidden mb-4">
                            {user?.img_link ? (
                                <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                user?.full_name?.charAt(0) || <User size={32} />
                            )}
                        </div>
                        <h2 className="text-lg font-medium text-slate-900">{user?.full_name}</h2>
                        <p className="text-sm text-slate-600 mb-6">{user?.position || 'No Position Set'}</p>

                        <div className="w-full space-y-0 mb-6">
                            <div className="flex justify-between items-center py-2.5 border-b border-[rgb(var(--ink)/0.06)]">
                                <span className="text-xs text-slate-600">Email</span>
                                <span className="text-sm text-slate-900 font-mono">{user?.email}</span>
                            </div>
                            <div className="flex justify-between items-center py-2.5 border-b border-[rgb(var(--ink)/0.06)]">
                                <span className="text-xs text-slate-600">Username</span>
                                <span className="text-sm text-slate-900 font-mono">{user?.username}</span>
                            </div>
                            <div className="flex justify-between items-center py-2.5 border-b border-[rgb(var(--ink)/0.06)]">
                                <span className="text-xs text-slate-600">Role</span>
                                <span className="text-sm text-slate-900 capitalize font-mono">{user?.role}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsEditingProfile(true)}
                            className="w-full h-10 bg-slate-100 text-slate-900 text-sm font-medium rounded-md hover:bg-slate-200 transition-colors flex justify-center items-center gap-2"
                        >
                            Edit Profile Information
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleProfileSubmit} className="space-y-4">
                        {profileStatus === 'error' && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-100">
                                {profileMessage}
                            </div>
                        )}
                        <div className="flex flex-col items-center mb-4">
                            <div className="relative w-20 h-20 rounded-full bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-600 font-medium text-2xl overflow-hidden group">
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
                            <p className="text-xs text-slate-600 mt-2">Click image to change</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">Full Name</label>
                            <input
                                type="text"
                                required
                                className="w-full px-3 py-2 text-sm bg-card border border-[rgb(var(--ink)/0.10)] rounded-md focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                value={profileForm.full_name}
                                onChange={e => setProfileForm({...profileForm, full_name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">Email</label>
                            <input
                                type="email"
                                required
                                className="w-full px-3 py-2 text-sm bg-card border border-[rgb(var(--ink)/0.10)] rounded-md focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                value={profileForm.email}
                                onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">Username</label>
                            <input
                                type="text"
                                required
                                className="w-full px-3 py-2 text-sm bg-card border border-[rgb(var(--ink)/0.10)] rounded-md focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                value={profileForm.username}
                                onChange={e => setProfileForm({...profileForm, username: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">Position</label>
                            <input
                                type="text"
                                required
                                className="w-full px-3 py-2 text-sm bg-card border border-[rgb(var(--ink)/0.10)] rounded-md focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                value={profileForm.position}
                                onChange={e => setProfileForm({...profileForm, position: e.target.value})}
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setIsEditingProfile(false)}
                                className="flex-1 h-10 bg-card border border-[rgb(var(--ink)/0.10)] text-slate-900 text-sm font-medium rounded-md hover:bg-slate-50 transition-colors flex justify-center items-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={profileStatus === 'loading'}
                                className="flex-1 h-10 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2"
                            >
                                {profileStatus === 'loading' && <Loader2 className="animate-spin" size={16} />}
                                Save Changes
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    </div>
  );

  const ProfileDropdown = () => (
    <div className="absolute right-0 top-full mt-2 w-52 bg-card rounded-lg shadow-lg border border-[rgb(var(--ink)/0.10)] overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
        <div className="px-4 py-3 border-b border-[rgb(var(--ink)/0.06)]">
            <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-600 capitalize font-mono">{user?.role}</p>
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
            className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
            <User size={15} className="text-slate-400" /> User Profile
        </button>
        <button
            onClick={() => {
                setIsPasswordModalOpen(true);
                setIsProfileDropdownOpen(false);
                setShowNewPw(false);
                setShowConfirmPw(false);
            }}
            className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
            <KeyRound size={15} className="text-slate-400" /> Change Password
        </button>
        <button
            onClick={() => {
                navigate('/settings?view=appearance');
                setIsProfileDropdownOpen(false);
            }}
            className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
            <Settings size={15} className="text-slate-400" /> Settings
        </button>
        <div className="my-1 border-t border-[rgb(var(--ink)/0.06)]" />
        <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
            <LogOut size={15} /> Sign Out
        </button>
    </div>
  );

  if (!showSidebar) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="h-14 bg-card border-b border-[rgb(var(--ink)/0.08)] px-4 lg:px-6 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain rounded-full p-0.5" />
            </div>
            <h1 className="text-sm font-medium text-slate-900 tracking-wide font-mono">REAMS</h1>
          </div>
          <div className="flex items-center gap-2">
             <button
                onClick={() => navigate('/admin/lookup')}
                className="w-8 h-8 flex items-center justify-center rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Name Lookup"
            >
                <Search size={16} />
            </button>
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="flex items-center gap-1.5 hover:bg-slate-100 py-1 px-1.5 rounded-md transition-colors"
                >
                    <div className="w-7 h-7 rounded-full bg-indigo-600/10 border border-indigo-600/20 text-indigo-600 flex items-center justify-center overflow-hidden">
                        {user?.img_link ? (
                          <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-[10px] font-medium font-mono">{userInitials}</span>
                        )}
                    </div>
                    <ChevronDown size={14} className="text-slate-600" />
                </button>

                {isProfileDropdownOpen && <ProfileDropdown />}
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
      case '/reports':
        return REPORT_SUBMENU.find((r) => r.report === activeReport)?.name || 'Reports';
      case '/users':
        return activeUsersView === 'participants' ? 'Participants' : 'Users';
      case '/scan': return 'Scan Mode';
      case '/settings':
        return SETTINGS_SUBMENU.find((s) => s.view === activeSettingsView && s.view !== 'signatories')?.name || 'Settings';
      case '/about': return 'About';
      default: return 'Overview';
    }
  };

  const isScanRoute = location.pathname === '/scan';

  // Pages searchable from the header — gated by the same permissions as the sidebar,
  // so users only see (and can only search) what they can access.
  type SearchablePage = {
    label: string;
    path: string;
    icon: React.ElementType;
    section: string;
    permission?: Permission;
  };

  const accessiblePages: SearchablePage[] = ([
    { label: 'Dashboard',   path: '/dashboard',    icon: LayoutDashboard, section: 'Navigation', permission: 'VIEW_DASHBOARD' },
    { label: 'Events',      path: '/events',       icon: Calendar,        section: 'Navigation', permission: 'MANAGE_EVENTS' },
    { label: 'Attendance',  path: '/attendance',   icon: ClipboardList,   section: 'Navigation', permission: 'VIEW_PARTICIPANTS' },
    { label: 'Name Lookup', path: '/admin/lookup', icon: Search,          section: 'Navigation' },
    { label: 'Reports',     path: '/reports',      icon: BarChart3,       section: 'Navigation', permission: 'VIEW_REPORTS' },
    ...REPORT_SUBMENU.map((child) => ({
      label: child.name,
      path: `/reports?report=${child.report}`,
      icon: child.icon,
      section: 'Reports',
      permission: 'VIEW_REPORTS' as Permission,
    })),
    { label: 'Scan Mode', path: '/scan',     icon: ScanLine, section: 'Navigation', permission: 'SCAN_QR' },
    ...usersSubmenu.map((child) => ({
      label: child.view === 'system' ? 'System Users' : 'Participants',
      path: child.view === 'system' ? '/users' : `/users?view=${child.view}`,
      icon: child.icon,
      section: 'Users',
      permission: 'MANAGE_USERS' as Permission,
    })),
    // settingsSubmenu is already permission-filtered above, so no extra gate here
    ...settingsSubmenu.map((child) => ({
      label: child.name,
      path: child.view === 'signatories' ? '/settings' : `/settings?view=${child.view}`,
      icon: child.icon,
      section: 'Settings',
    })),
    { label: 'About',     path: '/about',    icon: Info,     section: 'System' },
  ] as SearchablePage[]).filter((page) => !page.permission || hasPermission(page.permission));

  const pageSearchResults = accessiblePages.filter((page) =>
    page.label.toLowerCase().includes(pageSearchQuery.trim().toLowerCase())
  );

  const handleSelectPage = (path: string) => {
    navigate(path);
    setPageSearchQuery('');
    setIsPageSearchOpen(false);
    setPageSearchIndex(0);
  };

  const handlePageSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPageSearchIndex((i) => Math.min(i + 1, pageSearchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPageSearchIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const page = pageSearchResults[pageSearchIndex];
      if (page) handleSelectPage(page.path);
    } else if (e.key === 'Escape') {
      setIsPageSearchOpen(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar transition-all duration-200 ease-out
        md:translate-x-0 md:static md:inset-auto
        ${shouldCollapseSidebarContent ? 'md:w-14 w-56' : 'w-56'}
      `}>
        {/* Logo */}
        <div className={`flex items-center h-14 border-b border-white/[0.06] shrink-0 ${
          shouldCollapseSidebarContent ? 'justify-center px-0' : 'justify-between px-4'
        }`}>
          {!shouldCollapseSidebarContent ? (
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain rounded-full" />
              </div>
              <span className="text-white text-sm font-medium tracking-wide font-mono">REAMS</span>
            </div>
          ) : (
            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center overflow-hidden">
              <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain rounded-full" />
            </div>
          )}
          <button
            className="md:hidden text-white/40 hover:text-white transition-colors"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav sections */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-5 no-scrollbar ${
          shouldCollapseSidebarContent ? 'px-1.5' : 'px-2.5'
        }`}>
          <SidebarSection title="Navigation">
            {hasPermission('VIEW_DASHBOARD') && (
                <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
            )}
            {hasPermission('MANAGE_EVENTS') && (
                <NavItem to="/events" icon={Calendar} label="Events" />
            )}
            {hasPermission('VIEW_PARTICIPANTS') && (
                <NavItem to="/attendance" icon={ClipboardList} label="Attendance" />
            )}
            <NavItem to="/admin/lookup" icon={Search} label="Name Lookup" />
            {hasPermission('VIEW_REPORTS') && (
                <div>
                  <button
                    onClick={(e) => {
                      if (shouldCollapseSidebarContent) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setCollapsedFlyout((cur) =>
                          cur?.menu === 'reports' ? null : { menu: 'reports', top: rect.top }
                        );
                      } else {
                        setReportsOpen((o) => !o);
                      }
                    }}
                    data-flyout-root
                    title={shouldCollapseSidebarContent ? 'Reports' : undefined}
                    className={`group flex items-center rounded-md text-sm transition-all duration-150 ${
                      shouldCollapseSidebarContent ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2 w-full'
                    } ${
                      isReportsActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                  >
                    <BarChart3
                      size={16}
                      className={`shrink-0 transition-colors ${
                        isReportsActive ? 'text-indigo-400' : 'text-white/30 group-hover:text-white/50'
                      }`}
                      aria-hidden="true"
                    />
                    {!shouldCollapseSidebarContent && (
                      <>
                        <span className="flex-1 text-left">Reports</span>
                        <ChevronRight
                          size={14}
                          className={`shrink-0 transition-transform duration-200 text-white/25 ${
                            reportsOpen ? 'rotate-90' : ''
                          }`}
                        />
                      </>
                    )}
                  </button>

                  {!shouldCollapseSidebarContent && reportsOpen && (
                    <div className="mt-0.5 ml-3 pl-4 border-l border-white/[0.08] space-y-0.5">
                      {REPORT_SUBMENU.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isReportsActive && activeReport === child.report;
                        return (
                          <button
                            key={child.report}
                            onClick={() => {
                              navigate(`/reports?report=${child.report}`);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs w-full text-left transition-all duration-150 ${
                              childActive
                                ? 'text-white bg-white/10'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                            }`}
                          >
                            <ChildIcon
                              size={14}
                              className={`shrink-0 ${childActive ? 'text-indigo-400' : 'text-white/25'}`}
                            />
                            <span className="leading-snug">{child.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {shouldCollapseSidebarContent && collapsedFlyout?.menu === 'reports' && (
                    <div
                      data-flyout-root
                      className="fixed left-14 z-[60] min-w-[13rem] rounded-lg border border-white/10 bg-sidebar p-1.5 shadow-2xl"
                      style={{ top: collapsedFlyout.top }}
                    >
                      <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/25 font-mono">Reports</p>
                      {REPORT_SUBMENU.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isReportsActive && activeReport === child.report;
                        return (
                          <button
                            key={child.report}
                            onClick={() => {
                              navigate(`/reports?report=${child.report}`);
                              setCollapsedFlyout(null);
                            }}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs w-full text-left transition-all duration-150 ${
                              childActive
                                ? 'text-white bg-white/10'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                            }`}
                          >
                            <ChildIcon
                              size={14}
                              className={`shrink-0 ${childActive ? 'text-indigo-400' : 'text-white/25'}`}
                            />
                            <span className="leading-snug">{child.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
            )}
            {hasPermission('SCAN_QR') && (
                <NavItem to="/scan" icon={ScanLine} label="Scan Mode" />
            )}
          </SidebarSection>

          <SidebarSection title="System">
            {hasPermission('MANAGE_USERS') && (
                <div>
                  <button
                    onClick={(e) => {
                      if (shouldCollapseSidebarContent) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setCollapsedFlyout((cur) =>
                          cur?.menu === 'users' ? null : { menu: 'users', top: rect.top }
                        );
                      } else {
                        setUsersOpen((o) => !o);
                      }
                    }}
                    data-flyout-root
                    title={shouldCollapseSidebarContent ? 'Users' : undefined}
                    className={`group flex items-center rounded-md text-sm transition-all duration-150 ${
                      shouldCollapseSidebarContent ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2 w-full'
                    } ${
                      isUsersActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                  >
                    <Users
                      size={16}
                      className={`shrink-0 transition-colors ${
                        isUsersActive ? 'text-indigo-400' : 'text-white/30 group-hover:text-white/50'
                      }`}
                      aria-hidden="true"
                    />
                    {!shouldCollapseSidebarContent && (
                      <>
                        <span className="flex-1 text-left">Users</span>
                        <ChevronRight
                          size={14}
                          className={`shrink-0 transition-transform duration-200 text-white/25 ${
                            usersOpen ? 'rotate-90' : ''
                          }`}
                        />
                      </>
                    )}
                  </button>

                  {!shouldCollapseSidebarContent && usersOpen && (
                    <div className="mt-0.5 ml-3 pl-4 border-l border-white/[0.08] space-y-0.5">
                      {usersSubmenu.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isUsersActive && activeUsersView === child.view;
                        return (
                          <button
                            key={child.view}
                            onClick={() => {
                              navigate(child.view === 'system' ? '/users' : `/users?view=${child.view}`);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs w-full text-left transition-all duration-150 ${
                              childActive
                                ? 'text-white bg-white/10'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                            }`}
                          >
                            <ChildIcon
                              size={14}
                              className={`shrink-0 ${childActive ? 'text-indigo-400' : 'text-white/25'}`}
                            />
                            <span className="leading-snug">{child.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {shouldCollapseSidebarContent && collapsedFlyout?.menu === 'users' && (
                    <div
                      data-flyout-root
                      className="fixed left-14 z-[60] min-w-[11rem] rounded-lg border border-white/10 bg-sidebar p-1.5 shadow-2xl"
                      style={{ top: collapsedFlyout.top }}
                    >
                      <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/25 font-mono">Users</p>
                      {usersSubmenu.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isUsersActive && activeUsersView === child.view;
                        return (
                          <button
                            key={child.view}
                            onClick={() => {
                              navigate(child.view === 'system' ? '/users' : `/users?view=${child.view}`);
                              setCollapsedFlyout(null);
                            }}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs w-full text-left transition-all duration-150 ${
                              childActive
                                ? 'text-white bg-white/10'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                            }`}
                          >
                            <ChildIcon
                              size={14}
                              className={`shrink-0 ${childActive ? 'text-indigo-400' : 'text-white/25'}`}
                            />
                            <span className="leading-snug">{child.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
            )}
            <NavItem to="/about" icon={Info} label="About" />
                <div>
                  <button
                    onClick={(e) => {
                      if (shouldCollapseSidebarContent) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setCollapsedFlyout((cur) =>
                          cur?.menu === 'settings' ? null : { menu: 'settings', top: rect.top }
                        );
                      } else {
                        setSettingsOpen((o) => !o);
                      }
                    }}
                    data-flyout-root
                    title={shouldCollapseSidebarContent ? 'Settings' : undefined}
                    className={`group flex items-center rounded-md text-sm transition-all duration-150 ${
                      shouldCollapseSidebarContent ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2 w-full'
                    } ${
                      isSettingsActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                  >
                    <Settings
                      size={16}
                      className={`shrink-0 transition-colors ${
                        isSettingsActive ? 'text-indigo-400' : 'text-white/30 group-hover:text-white/50'
                      }`}
                      aria-hidden="true"
                    />
                    {!shouldCollapseSidebarContent && (
                      <>
                        <span className="flex-1 text-left">Settings</span>
                        <ChevronRight
                          size={14}
                          className={`shrink-0 transition-transform duration-200 text-white/25 ${
                            settingsOpen ? 'rotate-90' : ''
                          }`}
                        />
                      </>
                    )}
                  </button>

                  {!shouldCollapseSidebarContent && settingsOpen && (
                    <div className="mt-0.5 ml-3 pl-4 border-l border-white/[0.08] space-y-0.5">
                      {settingsSubmenu.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isSettingsActive && activeSettingsView === child.view;
                        return (
                          <button
                            key={child.view}
                            onClick={() => {
                              navigate(child.view === 'signatories' ? '/settings' : `/settings?view=${child.view}`);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs w-full text-left transition-all duration-150 ${
                              childActive
                                ? 'text-white bg-white/10'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                            }`}
                          >
                            <ChildIcon
                              size={14}
                              className={`shrink-0 ${childActive ? 'text-indigo-400' : 'text-white/25'}`}
                            />
                            <span className="leading-snug">{child.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {shouldCollapseSidebarContent && collapsedFlyout?.menu === 'settings' && (
                    <div
                      data-flyout-root
                      className="fixed left-14 z-[60] min-w-[11rem] rounded-lg border border-white/10 bg-sidebar p-1.5 shadow-2xl"
                      style={{ top: collapsedFlyout.top }}
                    >
                      <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/25 font-mono">Settings</p>
                      {settingsSubmenu.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isSettingsActive && activeSettingsView === child.view;
                        return (
                          <button
                            key={child.view}
                            onClick={() => {
                              navigate(child.view === 'signatories' ? '/settings' : `/settings?view=${child.view}`);
                              setCollapsedFlyout(null);
                            }}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs w-full text-left transition-all duration-150 ${
                              childActive
                                ? 'text-white bg-white/10'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                            }`}
                          >
                            <ChildIcon
                              size={14}
                              className={`shrink-0 ${childActive ? 'text-indigo-400' : 'text-white/25'}`}
                            />
                            <span className="leading-snug">{child.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
          </SidebarSection>
        </nav>

        {/* Footer: collapse + user */}
        <div className={`border-t border-white/[0.06] ${shouldCollapseSidebarContent ? 'p-2' : 'p-3'}`}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`hidden md:flex items-center text-white/30 hover:text-white/70 transition-colors mb-2 rounded-md hover:bg-white/[0.06] ${
              shouldCollapseSidebarContent ? 'justify-center w-10 h-8 mx-auto' : 'gap-2 px-2 py-1.5 w-full'
            }`}
          >
            {shouldCollapseSidebarContent ? (
              <PanelLeftOpen size={16} />
            ) : (
              <>
                <PanelLeftClose size={16} />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </button>

          {!shouldCollapseSidebarContent ? (
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center shrink-0 overflow-hidden">
                {user?.img_link ? (
                  <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-indigo-400 text-[10px] font-medium font-mono">{userInitials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs font-medium truncate">{user?.full_name}</p>
                <p className="text-white/30 text-[11px] truncate font-mono">{user?.email}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center overflow-hidden">
                {user?.img_link ? (
                  <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-indigo-400 text-[10px] font-medium font-mono">{userInitials}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 h-screen">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-[rgb(var(--ink)/0.08)] flex items-center gap-4 px-4 lg:px-6 shrink-0">
          <button
            className="md:hidden text-slate-600 hover:text-slate-900 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Menu size={20} />
          </button>

          <h2 className="md:hidden text-sm font-medium text-slate-900">{getPageTitle()}</h2>

          <button
            type="button"
            onClick={() => setIsPageSearchOpen(true)}
            className="flex-1 max-w-sm hidden sm:flex items-center gap-2 h-8 px-3 rounded-md bg-slate-100/50 border border-transparent hover:border-[rgb(var(--ink)/0.08)] hover:bg-card transition-colors text-sm text-slate-400"
          >
            <Search size={14} className="shrink-0" />
            <span className="flex-1 text-left truncate">Search pages...</span>
            <kbd className="hidden lg:inline-flex items-center gap-1 rounded border border-[rgb(var(--ink)/0.10)] bg-card px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              Ctrl K
            </kbd>
          </button>

          <div className="flex items-center gap-2 relative ml-auto" ref={dropdownRef}>
            <button
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="flex items-center gap-2 hover:bg-slate-100 py-1 px-1.5 rounded-md transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-600 overflow-hidden shrink-0">
                {user?.img_link ? (
                  <img src={user.img_link} alt="User Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-[10px] font-medium font-mono">{userInitials}</span>
                )}
              </div>
              <span className="hidden sm:block text-sm text-slate-900 font-medium max-w-[120px] truncate">
                {user?.full_name?.split(' ')[0]}
              </span>
              <ChevronDown size={14} className="text-slate-600" />
            </button>

            {isProfileDropdownOpen && <ProfileDropdown />}
          </div>
        </header>

        {/* Content */}
        <main className={`flex-1 overflow-hidden flex flex-col min-w-0 ${isScanRoute ? 'p-0 md:py-8 md:px-12 lg:px-16' : 'p-4 md:p-6'}`}>
          <div className="flex-1 min-h-0">
            {children}
          </div>
        </main>
      </div>

      {/* Search palette (Ctrl+K) */}
      {isPageSearchOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsPageSearchOpen(false)}
          />

          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl bg-card border border-[rgb(var(--ink)/0.10)] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 px-4 border-b border-[rgb(var(--ink)/0.06)]">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                ref={pageSearchInputRef}
                type="text"
                value={pageSearchQuery}
                onChange={(e) => {
                  setPageSearchQuery(e.target.value);
                  setPageSearchIndex(0);
                }}
                onKeyDown={handlePageSearchKeyDown}
                placeholder="Type a page name to search..."
                className="flex-1 h-12 text-sm text-slate-900 placeholder-slate-400 bg-transparent outline-none"
              />
              <button
                type="button"
                onClick={() => setIsPageSearchOpen(false)}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto py-1.5">
              {pageSearchResults.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">No pages match “{pageSearchQuery}”</p>
              ) : (
                <>
                  <p className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 font-mono">
                    Pages
                  </p>
                  {pageSearchResults.map((page, index) => {
                    const PageIcon = page.icon;
                    const isHighlighted = index === pageSearchIndex;
                    return (
                      <button
                        key={page.path}
                        ref={isHighlighted ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                        onClick={() => handleSelectPage(page.path)}
                        onMouseEnter={() => setPageSearchIndex(index)}
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors ${
                          isHighlighted ? 'bg-slate-50 text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        <PageIcon size={15} className={`shrink-0 ${isHighlighted ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <span className="flex-1 truncate">{page.label}</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide shrink-0">{page.section}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isPasswordModalOpen && <PasswordModal />}
      {isProfileModalOpen && <UserProfileModal />}
    </div>
  );
};

export default Layout;
