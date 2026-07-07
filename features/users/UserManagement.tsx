
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { User, Office, UserRole } from '../../types/database';
import { Trash2, UserPlus, Shield, CheckCircle, XCircle, Search, Mail, Briefcase, Lock, X, Loader2, AlertCircle, Edit, Building2, Eye, EyeOff, SlidersHorizontal, ChevronDown, Users } from 'lucide-react';
import { format } from 'date-fns';
import bcrypt from 'bcryptjs';
import ParticipantsList from './ParticipantsList';

// Extend User type locally to include joined office data
type UserLoginActivity = {
    login_activity_id: number;
    user_id: number | null;
    login_method: 'Password' | 'Google' | string;
    login_status: 'Success' | 'Failed' | string;
    created_at: string;
};

interface UserWithOffice extends User {
    offices?: {
        code: string;
        name: string;
    } | null;
    last_login_activity?: UserLoginActivity | null;
}

const ROLE_BADGE_STYLES: Record<string, string> = {
    Admin: 'border-purple-200 bg-purple-50 text-purple-700',
    EventManager: 'border-blue-200 bg-blue-50 text-blue-700',
    OfficeManager: 'border-teal-200 bg-teal-50 text-teal-700',
    Scanner: 'border-orange-200 bg-orange-50 text-orange-700'
};

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'Admin';
  const isOfficeManager = currentUser?.role === 'OfficeManager';
  const location = useLocation();
  // View is driven by the sidebar submenu (/users vs /users?view=participants);
  // the Participants view stays admin-only regardless of the URL.
  const activeView =
    isAdmin && new URLSearchParams(location.search).get('view') === 'participants'
      ? 'participants'
      : 'users';
  const [users, setUsers] = useState<UserWithOffice[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const itemsPerPage = 15;
  const activeFilterCount =
    (officeFilter !== 'all' ? 1 : 0) +
    (roleFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithOffice | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Password Visibility
  const [showPassword, setShowPassword] = useState(false);

  // Form Data
  const initialFormState = {
    full_name: '',
    email: '',
    username: '',
    password: '',
    role: 'Scanner' as UserRole,
    position: '',
    status: 'Active' as 'Active' | 'Inactive',
    office_id: null as number | null
  };
  const [formData, setFormData] = useState(initialFormState);
  const isOfficeManagerEditing = isOfficeManager && editingId !== null;

  useEffect(() => {
    fetchUsers();
    fetchOffices();
  }, [currentUser?.user_id, currentUser?.office_id, currentUser?.role]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('users')
        .select('*, offices(code, name)')
        .order('created_at', { ascending: false });

      if (isOfficeManager) {
        if (!currentUser?.office_id) {
          setUsers([]);
          return;
        }

        query = query.eq('office_id', currentUser.office_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;

      const userRows = (data as UserWithOffice[] || []);
      const userIds = userRows.map((user) => user.user_id);

      if (userIds.length === 0) {
        setUsers([]);
        return;
      }

      const { data: loginActivityData, error: loginActivityError } = await supabase
        .from('user_login_activity')
        .select('login_activity_id, user_id, login_method, login_status, created_at')
        .in('user_id', userIds)
        .eq('login_status', 'Success')
        .order('created_at', { ascending: false });

      if (loginActivityError) throw loginActivityError;

      const latestLoginByUserId = new Map<number, UserLoginActivity>();
      (loginActivityData || []).forEach((activity) => {
        if (!activity.user_id || latestLoginByUserId.has(activity.user_id)) return;
        latestLoginByUserId.set(activity.user_id, activity as UserLoginActivity);
      });

      setUsers(userRows.map((user) => ({
        ...user,
        last_login_activity: latestLoginByUserId.get(user.user_id) || null
      })));
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOffices = async () => {
      let query = supabase.from('offices').select('*').order('name');

      if (isOfficeManager) {
        if (!currentUser?.office_id) {
          setOffices([]);
          return;
        }

        query = query.eq('office_id', currentUser.office_id);
      }

      const { data } = await query;
      if (data) setOffices(data);
  };

  const canCreateUsers = isAdmin;

  const canManageUserRecord = (targetUser: UserWithOffice) => {
    if (isAdmin) return true;

    return Boolean(
      isOfficeManager &&
      currentUser?.office_id &&
      targetUser.office_id === currentUser.office_id &&
      targetUser.role !== 'Admin'
    );
  };

  const canDeleteUserRecord = (targetUser: UserWithOffice) => {
    if (!isAdmin || !currentUser) return false;

    return targetUser.user_id !== currentUser.user_id && targetUser.role !== 'Admin';
  };

  const formatLastLogin = (activity?: UserLoginActivity | null) => {
      if (!activity?.created_at) return 'Never';

      try {
          return format(new Date(activity.created_at), 'MMM d, yyyy h:mm a');
      } catch {
          return 'Invalid date';
      }
  };

  const getLoginMethodBadge = (activity?: UserLoginActivity | null) => {
      if (!activity) {
          return (
            <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                No activity
            </span>
          );
      }

      const isGoogle = activity.login_method === 'Google';

      return (
        <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            isGoogle
              ? 'border-sky-200 bg-sky-50 text-sky-700'
              : 'border-indigo-200 bg-indigo-50 text-indigo-700'
        }`}>
            {activity.login_method}
        </span>
      );
  };

  const handleDelete = async (targetUser: UserWithOffice) => {
    if (!currentUser) return;

    if (targetUser.user_id === currentUser.user_id) {
        alert("You cannot delete your own account.");
        return;
    }
    
    if (targetUser.role === 'Admin') {
        alert("You cannot delete another Administrator.");
        return;
    }

    setUserToDelete(targetUser);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    
    setDeleting(true);
    try {
        const { error } = await supabase.from('users').delete().eq('user_id', userToDelete.user_id);
        if (error) throw error;
        
        setUsers(users.filter(u => u.user_id !== userToDelete.user_id));
        setShowDeleteModal(false);
        setUserToDelete(null);
    } catch (err: any) {
        alert("Error deleting user: " + err.message);
    } finally {
        setDeleting(false);
    }
  };

  const openCreateModal = () => {
      if (!canCreateUsers) return;

      setEditingId(null);
      setFormData({
        ...initialFormState,
        office_id: isOfficeManager ? currentUser?.office_id || null : null
      });
      setFormError('');
      setShowPassword(false);
      setShowModal(true);
  };

  const openEditModal = (targetUser: UserWithOffice) => {
      if (!canManageUserRecord(targetUser)) return;

      setEditingId(targetUser.user_id);
      setFormData({
          full_name: targetUser.full_name,
          email: targetUser.email,
          username: targetUser.username,
          password: '',
          role: targetUser.role,
          position: targetUser.position || '',
          status: targetUser.status,
          office_id: isOfficeManager ? currentUser?.office_id || null : targetUser.office_id || null
      });
      setFormError('');
      setShowPassword(false);
      setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setFormError('');

      try {
          if (isOfficeManager && !currentUser?.office_id) {
              throw new Error('Your account does not have an office assignment.');
          }

          if (isOfficeManager) {
              if (editingId === null) {
                  throw new Error('Office Managers can edit users in their office, but cannot create new users.');
              }
          }

          if (!isOfficeManagerEditing) {
              const { data: existing } = await supabase
                .from('users')
                .select('user_id')
                .eq('username', formData.username)
                .neq('user_id', editingId || -1) 
                .single();
              
              if (existing) throw new Error("Username already taken.");
          }

          if (editingId) {
              const updates: any = isOfficeManagerEditing
                ? {
                    email: formData.email,
                    position: formData.position
                  }
                : {
                    full_name: formData.full_name,
                    email: formData.email,
                    username: formData.username,
                    role: formData.role,
                    position: formData.position,
                    status: formData.status,
                    office_id: formData.office_id
                  };

              if (formData.password) {
                  if (formData.password.length < 4) throw new Error("Password must be at least 4 characters.");
                  const salt = await bcrypt.genSalt(10);
                  updates.password_hash = await bcrypt.hash(formData.password, salt);
              }

              let updateQuery = supabase
                  .from('users')
                  .update(updates)
                  .eq('user_id', editingId);

              if (isOfficeManager && currentUser?.office_id) {
                  updateQuery = updateQuery
                    .eq('office_id', currentUser.office_id)
                    .neq('role', 'Admin');
              }

              const { error } = await updateQuery;

              if (error) throw error;

          } else {
              if (!formData.password || formData.password.length < 4) {
                  throw new Error("Password must be at least 4 characters.");
              }
              
              const salt = await bcrypt.genSalt(10);
              const hash = await bcrypt.hash(formData.password, salt);

              const { error } = await supabase.from('users').insert([{
                  full_name: formData.full_name,
                  email: formData.email,
                  username: formData.username,
                  password_hash: hash,
                  role: formData.role,
                  position: formData.position,
                  status: formData.status,
                  office_id: isOfficeManager ? currentUser?.office_id || null : formData.office_id
              }]);

              if (error) throw error;
          }

          setShowModal(false);
          fetchUsers();
      } catch (err: any) {
          setFormError(err.message);
      } finally {
          setSubmitting(false);
      }
  };

  const filteredUsers = users.filter(u => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const matchesSearch = !normalizedSearch ||
        u.full_name.toLowerCase().includes(normalizedSearch) ||
        u.username.toLowerCase().includes(normalizedSearch) ||
        u.role.toLowerCase().includes(normalizedSearch) ||
        Boolean(u.offices?.code?.toLowerCase().includes(normalizedSearch)) ||
        Boolean(u.offices?.name?.toLowerCase().includes(normalizedSearch));
      const matchesOffice =
        officeFilter === 'all' ||
        (officeFilter === 'unassigned' ? !u.office_id : u.office_id === Number(officeFilter));
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;

      return matchesSearch && matchesOffice && matchesRole && matchesStatus;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
  );

  return (
    <div className="min-h-0 flex flex-col gap-6 -m-4 h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)] p-4 md:py-8 md:px-12 lg:px-16">
      {activeView === 'users' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-6">
          {isOfficeManager && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              You can edit only the email, position, and password of users assigned to your office. Creating users, deleting users, and changing other account details are restricted.
            </div>
          )}

          {isOfficeManager && !currentUser?.office_id && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Your account does not have an office assignment yet, so user management is unavailable.
            </div>
          )}

          <div className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card p-3">
            <div className="flex flex-col gap-3 md:grid md:grid-cols-2 xl:grid-cols-[35%_minmax(260px,1fr)_minmax(200px,240px)_minmax(190px,230px)_auto]">
              <div className="flex min-w-0 gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-14 h-9 bg-card border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 transition-colors"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters((prev) => !prev)}
                  aria-expanded={showFilters}
                  className="flex shrink-0 items-center gap-2 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card px-3 h-9 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 md:hidden"
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>
                {canCreateUsers && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    aria-label="Add User"
                    title="Add User"
                    className="flex shrink-0 items-center justify-center rounded-md bg-indigo-600 px-3 h-9 text-white transition-colors hover:bg-indigo-700 md:hidden"
                  >
                    <UserPlus size={16} />
                  </button>
                )}
              </div>
              <div className={`${showFilters ? 'grid' : 'hidden'} grid-cols-1 gap-3 md:contents`}>
              <div className="relative min-w-0">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <select
                  value={officeFilter}
                  onChange={(e) => {
                    setOfficeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full appearance-none rounded-md border border-[rgb(var(--ink)/0.10)] bg-card h-9 pl-9 pr-8 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                  aria-label="Filter users by office"
                >
                  <option value="all">All offices</option>
                  {offices.map(office => (
                    <option key={office.office_id} value={office.office_id}>
                      {office.code} - {office.name}
                    </option>
                  ))}
                  {!isOfficeManager && <option value="unassigned">Unassigned</option>}
                </select>
              </div>
              <div className="relative min-w-0">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value as 'all' | UserRole);
                    setCurrentPage(1);
                  }}
                  className="w-full appearance-none rounded-md border border-[rgb(var(--ink)/0.10)] bg-card h-9 pl-9 pr-8 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                  aria-label="Filter users by role"
                >
                  <option value="all">All roles</option>
                  <option value="Admin">Admin</option>
                  <option value="EventManager">EventManager</option>
                  <option value="OfficeManager">OfficeManager</option>
                  <option value="Scanner">Scanner</option>
                </select>
              </div>
              <div className="relative min-w-0">
                <CheckCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as 'all' | 'Active' | 'Inactive');
                    setCurrentPage(1);
                  }}
                  className="w-full appearance-none rounded-md border border-[rgb(var(--ink)/0.10)] bg-card h-9 pl-9 pr-8 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                  aria-label="Filter users by status"
                >
                  <option value="all">All statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              </div>
              {canCreateUsers && (
                <button
                    onClick={openCreateModal}
                    className="hidden w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-indigo-600 px-4 h-9 text-sm font-medium text-white transition-colors hover:bg-indigo-700 md:flex md:w-auto"
                >
                    <UserPlus size={16} /> Add User
                </button>
              )}
            </div>
          </div>

      <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)] overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)] shrink-0">
              <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-indigo-600/10 text-indigo-600">
                  <Users size={13} />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">System Users</h3>
              <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full font-medium font-mono bg-indigo-600/10 text-indigo-700">
                  {filteredUsers.length}
              </span>
              {activeFilterCount > 0 && (
                  <span className="ml-auto text-xs text-slate-500">
                      {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} applied
                  </span>
              )}
          </div>

          <div className="hidden md:block flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-[rgb(var(--ink)/0.06)]">
                      <tr>
                          <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">User</th>
                          <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Office</th>
                          <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Role & Position</th>
                          <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Status</th>
                          <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Last Login</th>
                          <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Created</th>
                          <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--ink)/0.04)]">
                      {loading ? (
                          <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-400">Loading users…</td></tr>
                      ) : paginatedUsers.length === 0 ? (
                          <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-400">No users found.</td></tr>
                      ) : (
                          paginatedUsers.map((user) => (
                              <tr key={user.user_id} className="hover:bg-slate-50/60 transition-colors">
                                  <td className="px-4 py-3">
                                      <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-indigo-600/10 border border-indigo-600/20 text-indigo-600 flex items-center justify-center text-[11px] font-medium font-mono shrink-0">
                                              {user.full_name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                              <div className="text-sm font-medium text-slate-900 leading-tight">{user.full_name}</div>
                                              <div className="text-xs text-slate-500 font-mono">@{user.username}</div>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="px-4 py-3">
                                      {user.offices ? (
                                        <span
                                          className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded border border-[rgb(var(--ink)/0.08)] bg-slate-50 text-slate-600"
                                          title={user.offices.name}
                                        >
                                            {user.offices.code}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-xs italic">Unassigned</span>
                                      )}
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="flex flex-col gap-1">
                                          <span className={`inline-flex items-center gap-1.5 w-fit px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROLE_BADGE_STYLES[user.role] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                              {user.role === 'Admin' && <Shield size={11} />}
                                              {user.role}
                                          </span>
                                          {user.position && <span className="text-xs text-slate-500">{user.position}</span>}
                                      </div>
                                  </td>
                                  <td className="px-4 py-3">
                                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                          user.status === 'Active' ? 'text-emerald-700' : 'text-slate-500'
                                      }`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                          {user.status}
                                      </span>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="flex flex-col gap-1">
                                          <span className="text-xs font-mono text-slate-600">{formatLastLogin(user.last_login_activity)}</span>
                                          {getLoginMethodBadge(user.last_login_activity)}
                                      </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs font-mono text-slate-500">
                                      {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '–'}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                      <div className="flex items-center justify-end gap-0.5">
                                          <button
                                              onClick={() => openEditModal(user)}
                                              disabled={!canManageUserRecord(user)}
                                              className={`p-1.5 rounded-md transition-colors ${
                                                canManageUserRecord(user)
                                                  ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-600/10'
                                                  : 'text-slate-300 cursor-not-allowed'
                                              }`}
                                              title={canManageUserRecord(user) ? 'Edit User' : 'You cannot edit this user'}
                                          >
                                              <Edit size={16} />
                                          </button>
                                          <button
                                              onClick={() => handleDelete(user)}
                                              disabled={!canDeleteUserRecord(user)}
                                              className={`p-1.5 rounded-md transition-colors
                                                  ${!canDeleteUserRecord(user)
                                                      ? 'text-slate-300 cursor-not-allowed'
                                                      : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                  }
                                              `}
                                              title={canDeleteUserRecord(user) ? 'Delete User' : 'Deletion is restricted'}
                                          >
                                              <Trash2 size={16} />
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))
                      )}
                  </tbody>
              </table>
          </div>

          <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
              {loading ? (
                  [...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse rounded-lg border border-[rgb(var(--ink)/0.08)] p-4 space-y-3">
                          <div className="h-5 bg-slate-200 rounded w-2/3"></div>
                          <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                          <div className="h-4 bg-slate-100 rounded w-1/3"></div>
                      </div>
                  ))
              ) : paginatedUsers.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-[rgb(var(--ink)/0.06)]">
                      No users found.
                  </div>
              ) : (
                  paginatedUsers.map((user) => (
                      <div key={user.user_id} className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card p-4">
                          <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-indigo-600/10 border border-indigo-600/20 text-indigo-600 flex items-center justify-center text-[11px] font-medium font-mono shrink-0">
                                      {user.full_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                      <div className="text-sm font-medium text-slate-900 truncate">{user.full_name}</div>
                                      <div className="text-xs text-slate-500 font-mono">@{user.username}</div>
                                  </div>
                              </div>
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${
                                  user.status === 'Active' ? 'text-emerald-700' : 'text-slate-500'
                              }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                  {user.status}
                              </span>
                          </div>

                          <div className="mt-3 space-y-1.5">
                              <div className="text-xs text-slate-600">{user.email || '–'}</div>
                              <div className="text-xs text-slate-500">{user.position || '–'}</div>
                              <div className="flex flex-wrap gap-1.5 items-center pt-1">
                                  <span className={`inline-flex items-center gap-1.5 w-fit px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROLE_BADGE_STYLES[user.role] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                      {user.role === 'Admin' && <Shield size={11} />}
                                      {user.role}
                                  </span>
                                  {user.offices ? (
                                      <span className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded border border-[rgb(var(--ink)/0.08)] bg-slate-50 text-slate-600">
                                          {user.offices.code}
                                      </span>
                                  ) : (
                                      <span className="text-slate-400 text-xs italic">Unassigned</span>
                                  )}
                              </div>
                          </div>

                          <div className="mt-3 flex gap-2">
                              <button
                                  onClick={() => openEditModal(user)}
                                  disabled={!canManageUserRecord(user)}
                                  className={`flex-1 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                                    canManageUserRecord(user)
                                      ? 'text-indigo-700 bg-indigo-600/10 hover:bg-indigo-600/20'
                                      : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  }`}
                              >
                                  <Edit size={14} /> Edit
                              </button>
                              <button
                                  onClick={() => handleDelete(user)}
                                  disabled={!canDeleteUserRecord(user)}
                                  className={`flex-1 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5
                                      ${!canDeleteUserRecord(user)
                                          ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                          : 'bg-red-50 text-red-700 hover:bg-red-100'
                                      }
                                  `}
                              >
                                  <Trash2 size={14} /> Delete
                              </button>
                          </div>
                      </div>
                  ))
              )}
          </div>

          {/* Pagination Controls */}
          {!loading && totalPages > 1 && (
              <div className="px-4 py-3 border-t border-[rgb(var(--ink)/0.06)] flex items-center justify-between gap-3 shrink-0">
                  <p className="text-xs text-slate-500">
                      Showing <span className="font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-medium text-slate-700">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of <span className="font-medium text-slate-700">{filteredUsers.length}</span>
                  </p>
                  <div className="flex items-center gap-2">
                      <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="h-8 px-3 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                          Previous
                      </button>
                      <span className="text-xs font-mono text-slate-600 px-1">
                          {currentPage} / {totalPages}
                      </span>
                      <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="h-8 px-3 rounded-md border border-[rgb(var(--ink)/0.10)] bg-card text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                          Next
                      </button>
                  </div>
              </div>
          )}
      </div>

      {/* Create/Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
                onClick={() => setShowModal(false)}
            ></div>

            <div className="bg-card border border-[rgb(var(--ink)/0.10)] rounded-lg shadow-2xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-5 py-4 border-b border-[rgb(var(--ink)/0.06)] flex justify-between items-center">
                    <h3 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        {editingId ? <Edit size={16} className="text-indigo-600" /> : <UserPlus size={16} className="text-indigo-600" />}
                        {editingId ? 'Edit User' : 'Create New User'}
                    </h3>
                    <button
                        onClick={() => setShowModal(false)}
                        className="text-slate-500 hover:text-slate-900 p-1 hover:bg-slate-100 rounded-md transition"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {formError && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg border border-red-100 text-sm flex items-center gap-2">
                            <AlertCircle size={16} /> {formError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {isOfficeManagerEditing ? (
                            <>
                                <div className="sm:col-span-2 rounded-lg border border-[rgb(var(--ink)/0.08)] bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-800">{formData.full_name}</p>
                                    <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                                        <p>Username: <span className="font-medium text-slate-700">@{formData.username}</span></p>
                                        <p>Role: <span className="font-medium text-slate-700">{formData.role}</span></p>
                                        <p>Status: <span className="font-medium text-slate-700">{formData.status}</span></p>
                                        <p>
                                            Office: <span className="font-medium text-slate-700">
                                                {offices.find((office) => office.office_id === formData.office_id)?.name || 'Unassigned'}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Full Name</label>
                                    <input 
                                        required
                                        type="text"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        placeholder="John Doe"
                                        value={formData.full_name}
                                        onChange={e => setFormData({...formData, full_name: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Username</label>
                                    <input 
                                        required
                                        type="text"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        placeholder="johndoe"
                                        value={formData.username}
                                        onChange={e => setFormData({...formData, username: e.target.value})}
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">
                                {editingId ? 'Password (Optional)' : 'Password'}
                            </label>
                            <div className="relative">
                                <input 
                                    required={!editingId}
                                    type={showPassword ? "text" : "password"}
                                    className="w-full px-3 py-2 pr-10 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                    placeholder={editingId ? "Leave blank to keep" : "••••••"}
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {!isOfficeManagerEditing && (
                            <div>
                                <label className="block text-xs font-medium text-slate-900 mb-1.5">Role</label>
                                <select
                                    className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors bg-card"
                                    value={formData.role}
                                    onChange={e => setFormData({...formData, role: e.target.value as any})}
                                >
                                    <option value="Scanner">Scanner</option>
                                    <option value="EventManager">EventManager</option>
                                    <option value="OfficeManager">OfficeManager</option>
                                    {isAdmin && <option value="Admin">Admin</option>}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-slate-900 mb-1.5">Position</label>
                            <input 
                                type="text"
                                className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                placeholder="e.g. Staff"
                                value={formData.position}
                                onChange={e => setFormData({...formData, position: e.target.value})}
                            />
                        </div>
                        
                        {!isOfficeManagerEditing && (
                            <>
                                <div className="sm:col-span-2">
                                     <label className="block text-xs font-medium text-slate-900 mb-1.5">Office Assignment</label>
                                     <div className="relative">
                                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <select 
                                            className="w-full pl-10 pr-4 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors bg-card appearance-none"
                                            value={formData.office_id || ''}
                                            disabled={isOfficeManager}
                                            onChange={e => setFormData({...formData, office_id: e.target.value ? Number(e.target.value) : null})}
                                        >
                                            <option value="">-- No Office Assigned --</option>
                                            {offices.map(office => (
                                                <option key={office.office_id} value={office.office_id}>{office.name} ({office.code})</option>
                                            ))}
                                        </select>
                                     </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Status</label>
                                    <select
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors bg-card"
                                        value={formData.status}
                                        onChange={e => setFormData({...formData, status: e.target.value as any})}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>
                            </>
                        )}
                        
                        <div className="sm:col-span-2">
                             <label className="block text-xs font-medium text-slate-900 mb-1.5">Email (Optional)</label>
                            <input 
                                type="email"
                                className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                placeholder="john@example.com"
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setShowModal(false)}
                            className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="h-9 bg-indigo-600 text-white px-5 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {submitting && <Loader2 className="animate-spin" size={15} />}
                            {submitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Create User')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
                onClick={() => !deleting && setShowDeleteModal(false)}
            ></div>

            <div className="bg-card border border-[rgb(var(--ink)/0.10)] rounded-lg shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-50 border border-red-200 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={22} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Confirm Deletion</h3>
                    <p className="text-sm text-slate-600 mb-6">
                        Are you sure you want to delete user <strong>"{userToDelete.username}"</strong>? This action cannot be undone.
                    </p>

                    <div className="flex justify-center gap-3">
                        <button
                            onClick={() => setShowDeleteModal(false)}
                            disabled={deleting}
                            className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDelete}
                            disabled={deleting}
                            className="h-9 bg-red-600 text-white px-5 rounded-md text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {deleting && <Loader2 className="animate-spin" size={15} />}
                            {deleting ? 'Deleting...' : 'Yes, Delete User'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ParticipantsList />
        </div>
      )}
    </div>
  );
};

export default UserManagement;
