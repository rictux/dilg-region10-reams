
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { User, Office } from '../../types/database';
import { Trash2, UserPlus, Shield, CheckCircle, XCircle, Search, Mail, Briefcase, Lock, X, Loader2, AlertCircle, Edit, Building2, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import bcrypt from 'bcryptjs';

// Extend User type locally to include joined office data
interface UserWithOffice extends User {
    offices?: {
        code: string;
        name: string;
    } | null;
}

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithOffice[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Password Visibility
  const [showPassword, setShowPassword] = useState(false);

  // Form Data
  const initialFormState = {
    full_name: '',
    email: '',
    username: '',
    password: '',
    role: 'Scanner' as 'Admin' | 'Scanner' | 'EventManager',
    position: '',
    status: 'Active' as 'Active' | 'Inactive',
    office_id: null as number | null
  };
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchUsers();
    fetchOffices();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, offices(code, name)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setUsers(data as UserWithOffice[] || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOffices = async () => {
      const { data } = await supabase.from('offices').select('*').order('name');
      if (data) setOffices(data);
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

    if (!confirm(`Are you sure you want to delete user "${targetUser.username}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const { error } = await supabase.from('users').delete().eq('user_id', targetUser.user_id);
        if (error) throw error;
        
        setUsers(users.filter(u => u.user_id !== targetUser.user_id));
    } catch (err: any) {
        alert("Error deleting user: " + err.message);
    }
  };

  const openCreateModal = () => {
      setEditingId(null);
      setFormData(initialFormState);
      setFormError('');
      setShowPassword(false);
      setShowModal(true);
  };

  const openEditModal = (user: UserWithOffice) => {
      setEditingId(user.user_id);
      setFormData({
          full_name: user.full_name,
          email: user.email,
          username: user.username,
          password: '',
          role: user.role,
          position: user.position || '',
          status: user.status,
          office_id: user.office_id || null
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
          const { data: existing } = await supabase
            .from('users')
            .select('user_id')
            .eq('username', formData.username)
            .neq('user_id', editingId || -1) 
            .single();
          
          if (existing) throw new Error("Username already taken.");

          if (editingId) {
              const updates: any = {
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

              const { error } = await supabase
                  .from('users')
                  .update(updates)
                  .eq('user_id', editingId);

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
                  office_id: formData.office_id
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

  const filteredUsers = users.filter(u => 
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.offices?.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
            <p className="text-slate-500 mt-1">Manage system access and roles.</p>
        </div>
        <button 
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-colors font-medium"
        >
            <UserPlus size={20} /> Add User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search users..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
              </div>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                          <th className="px-6 py-4">User Details</th>
                          <th className="px-6 py-4">Office Code</th>
                          <th className="px-6 py-4">Role & Position</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Created</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {loading ? (
                          <tr><td colSpan={6} className="text-center py-8">Loading users...</td></tr>
                      ) : filteredUsers.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-8 text-slate-400">No users found.</td></tr>
                      ) : (
                          filteredUsers.map((user) => (
                              <tr key={user.user_id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4">
                                      <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                                              {user.full_name.charAt(0)}
                                          </div>
                                          <div>
                                              <div className="font-medium text-slate-800">{user.full_name}</div>
                                              <div className="text-xs text-slate-500">@{user.username}</div>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="px-6 py-4">
                                      {user.offices ? (
                                        <span className="font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">
                                            {user.offices.code}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-xs italic">Unassigned</span>
                                      )}
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex flex-col">
                                          <span className={`inline-flex items-center gap-1.5 w-fit px-2 py-0.5 rounded-full text-xs font-semibold
                                              ${user.role === 'Admin' ? 'bg-purple-100 text-purple-700' : ''}
                                              ${user.role === 'Scanner' ? 'bg-orange-100 text-orange-700' : ''}
                                              ${user.role === 'EventManager' ? 'bg-blue-100 text-blue-700' : ''}
                                          `}>
                                              {user.role === 'Admin' && <Shield size={12} />}
                                              {user.role}
                                          </span>
                                          {user.position && <span className="text-xs text-slate-500 mt-1">{user.position}</span>}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border
                                          ${user.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}
                                      `}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                                          {user.status}
                                      </span>
                                  </td>
                                  <td className="px-6 py-4 text-slate-500">
                                      {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '-'}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                          <button
                                              onClick={() => openEditModal(user)}
                                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                              title="Edit User"
                                          >
                                              <Edit size={18} />
                                          </button>
                                          <button 
                                              onClick={() => handleDelete(user)}
                                              disabled={user.role === 'Admin' || user.user_id === currentUser?.user_id}
                                              className={`p-2 rounded-lg transition-colors
                                                  ${(user.role === 'Admin' || user.user_id === currentUser?.user_id) 
                                                      ? 'text-slate-300 cursor-not-allowed' 
                                                      : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                  }
                                              `}
                                              title={user.role === 'Admin' ? "Cannot delete Admins" : "Delete User"}
                                          >
                                              <Trash2 size={18} />
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* Create/Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
                onClick={() => setShowModal(false)}
            ></div>

            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-semibold flex items-center gap-2">
                        {editingId ? <Edit size={20} /> : <UserPlus size={20} />}
                        {editingId ? 'Edit User' : 'Create New User'}
                    </h3>
                    <button 
                        onClick={() => setShowModal(false)} 
                        className="text-indigo-100 hover:text-white p-1 hover:bg-white/20 rounded-full transition"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {formError && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg border border-red-100 text-sm flex items-center gap-2">
                            <AlertCircle size={16} /> {formError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                            <input 
                                required
                                type="text"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                placeholder="John Doe"
                                value={formData.full_name}
                                onChange={e => setFormData({...formData, full_name: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                            <input 
                                required
                                type="text"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                placeholder="johndoe"
                                value={formData.username}
                                onChange={e => setFormData({...formData, username: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                {editingId ? 'Password (Optional)' : 'Password'}
                            </label>
                            <div className="relative">
                                <input 
                                    required={!editingId}
                                    type={showPassword ? "text" : "password"}
                                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                            <select
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                value={formData.role}
                                onChange={e => setFormData({...formData, role: e.target.value as any})}
                            >
                                <option value="Scanner">Scanner</option>
                                <option value="EventManager">EventManager</option>
                                <option value="Admin">Admin</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Position</label>
                            <input 
                                type="text"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                placeholder="e.g. Staff"
                                value={formData.position}
                                onChange={e => setFormData({...formData, position: e.target.value})}
                            />
                        </div>
                        
                        <div className="sm:col-span-2">
                             <label className="block text-sm font-medium text-slate-700 mb-1">Office Assignment</label>
                             <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <select 
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white appearance-none"
                                    value={formData.office_id || ''}
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
                            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                            <select
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white"
                                value={formData.status}
                                onChange={e => setFormData({...formData, status: e.target.value as any})}
                            >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>
                        
                        <div className="sm:col-span-2">
                             <label className="block text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                            <input 
                                type="email"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={submitting}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg shadow-md hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
                        >
                            {submitting && <Loader2 className="animate-spin" size={16} />}
                            {submitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Create User')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
