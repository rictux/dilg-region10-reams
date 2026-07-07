import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Participant } from '../../types/database';
import { Search, Edit, Loader2, X, Save, User, Mail, Briefcase, Phone, AlertCircle, Contact } from 'lucide-react';

const ParticipantsList: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        fetchParticipants();
    }, []);

    const fetchParticipants = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('participants')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setParticipants(data || []);
        } catch (err) {
            console.error('Error fetching participants:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (participant: Participant) => {
        setEditingParticipant(participant);
        setFormError('');
        setShowEditModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingParticipant) return;

        setSubmitting(true);
        setFormError('');

        try {
            const { error } = await supabase
                .from('participants')
                .update({
                    f_name: editingParticipant.f_name,
                    l_name: editingParticipant.l_name,
                    m_initial: editingParticipant.m_initial,
                    suffix: editingParticipant.suffix,
                    full_name: `${editingParticipant.f_name} ${editingParticipant.m_initial ? editingParticipant.m_initial + '. ' : ''}${editingParticipant.l_name}${editingParticipant.suffix ? ' ' + editingParticipant.suffix : ''}`.trim(),
                    email: editingParticipant.email,
                    position: editingParticipant.position,
                    office: editingParticipant.office,
                    mobile_no: editingParticipant.mobile_no,
                    gender: editingParticipant.gender,
                    age_group: editingParticipant.age_group,
                    pwd: editingParticipant.pwd,
                    indigenous_people: editingParticipant.indigenous_people
                })
                .eq('participant_id', editingParticipant.participant_id);

            if (error) throw error;

            setShowEditModal(false);
            fetchParticipants();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const filteredParticipants = participants.filter(p => 
        p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.office?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredParticipants.length / itemsPerPage);
    const paginatedParticipants = filteredParticipants.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="h-full min-h-0 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                        type="text"
                        placeholder="Search participants..."
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
            </div>

            <div className="bg-card rounded-lg border border-[rgb(var(--ink)/0.08)] overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--ink)/0.06)] shrink-0">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-indigo-600/10 text-indigo-600">
                        <Contact size={13} />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">Participants</h3>
                    <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full font-medium font-mono bg-indigo-600/10 text-indigo-700">
                        {filteredParticipants.length}
                    </span>
                </div>

                <div className="hidden md:block flex-1 min-h-0 overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-[rgb(var(--ink)/0.06)]">
                            <tr>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Participant</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Contact</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Office & Position</th>
                                <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono">Demographics</th>
                                {currentUser?.role === 'Admin' && <th className="px-4 py-2.5 bg-slate-50 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 font-mono text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgb(var(--ink)/0.04)]">
                            {loading ? (
                                <tr><td colSpan={5} className="py-10 text-center text-xs text-slate-400">Loading participants…</td></tr>
                            ) : paginatedParticipants.length === 0 ? (
                                <tr><td colSpan={5} className="py-10 text-center text-xs text-slate-400">No participants found.</td></tr>
                            ) : (
                                paginatedParticipants.map((participant) => (
                                    <tr key={participant.participant_id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-600/10 border border-indigo-600/20 text-indigo-600 flex items-center justify-center text-[11px] font-medium font-mono shrink-0">
                                                    {participant.f_name?.charAt(0)?.toUpperCase() || <User size={14} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-slate-900 leading-tight">{participant.full_name}</div>
                                                    <div className="text-xs text-slate-500 font-mono">{participant.participant_code}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs text-slate-700">{participant.email || '–'}</div>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">{participant.mobile_no || '–'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs text-slate-700">{participant.office || '–'}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{participant.position || '–'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                                                <span>{participant.gender || '–'}</span>
                                                <span className="text-slate-300">·</span>
                                                <span className="font-mono">{participant.age_group || '–'}</span>
                                                {participant.pwd === 'Yes' && <span className="border border-blue-200 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium">PWD</span>}
                                                {participant.indigenous_people === 'Yes' && <span className="border border-emerald-200 bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-medium">IP</span>}
                                            </div>
                                        </td>
                                        {currentUser?.role === 'Admin' && (
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleEdit(participant)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-600/10 rounded-md transition-colors"
                                                    title="Edit Participant"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                            </td>
                                        )}
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
                    ) : paginatedParticipants.length === 0 ? (
                        <div className="py-10 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-[rgb(var(--ink)/0.06)]">No participants found.</div>
                    ) : (
                        paginatedParticipants.map((participant) => (
                            <div key={participant.participant_id} className="rounded-lg border border-[rgb(var(--ink)/0.08)] bg-card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-indigo-600/10 border border-indigo-600/20 text-indigo-600 flex items-center justify-center text-[11px] font-medium font-mono shrink-0">
                                            {participant.f_name?.charAt(0)?.toUpperCase() || <User size={14} />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-slate-900 truncate">{participant.full_name}</div>
                                            <div className="text-xs text-slate-500 font-mono">{participant.participant_code}</div>
                                        </div>
                                    </div>
                                    {currentUser?.role === 'Admin' && (
                                        <button
                                            onClick={() => handleEdit(participant)}
                                            className="shrink-0 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-600/10 rounded-md transition-colors"
                                            title="Edit Participant"
                                        >
                                            <Edit size={16} />
                                        </button>
                                    )}
                                </div>

                                <div className="mt-3 space-y-2">
                                    <div className="flex items-start gap-2 text-xs text-slate-600">
                                        <Mail size={13} className="text-slate-400 shrink-0 mt-0.5" />
                                        <span>{participant.email || '–'}</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-slate-600">
                                        <Phone size={13} className="text-slate-400 shrink-0 mt-0.5" />
                                        <span className="font-mono">{participant.mobile_no || '–'}</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-slate-600">
                                        <Briefcase size={13} className="text-slate-400 shrink-0 mt-0.5" />
                                        <div>
                                            <div>{participant.office || '–'}</div>
                                            <div className="text-slate-500 mt-0.5">{participant.position || '–'}</div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 rounded-md bg-slate-50 border border-[rgb(var(--ink)/0.06)] px-3 py-2">
                                        <span>{participant.gender || '–'}</span>
                                        <span className="text-slate-300">·</span>
                                        <span className="font-mono">{participant.age_group || '–'}</span>
                                        {participant.pwd === 'Yes' && <span className="border border-blue-200 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium">PWD</span>}
                                        {participant.indigenous_people === 'Yes' && <span className="border border-emerald-200 bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-medium">IP</span>}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-[rgb(var(--ink)/0.06)] flex items-center justify-between gap-3 shrink-0">
                        <p className="text-xs text-slate-500">
                            Showing <span className="font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-medium text-slate-700">{Math.min(currentPage * itemsPerPage, filteredParticipants.length)}</span> of <span className="font-medium text-slate-700">{filteredParticipants.length}</span>
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

            {/* Edit Modal */}
            {showEditModal && editingParticipant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && setShowEditModal(false)}></div>
                    <div className="bg-card border border-[rgb(var(--ink)/0.10)] rounded-lg shadow-2xl w-full max-w-2xl p-5 relative z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-5 pb-4 border-b border-[rgb(var(--ink)/0.06)]">
                            <h3 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                                <Edit className="text-indigo-600" size={16} />
                                Edit Participant
                            </h3>
                            <button
                                onClick={() => !submitting && setShowEditModal(false)}
                                className="text-slate-500 hover:text-slate-900 p-1 hover:bg-slate-100 rounded-md transition"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {formError && (
                            <div className="mb-5 p-3 bg-red-50 border border-red-100 rounded-md flex items-start gap-2.5 text-red-600">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                <p className="text-sm">{formError}</p>
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">First Name</label>
                                    <input 
                                        required
                                        type="text"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.f_name}
                                        onChange={e => setEditingParticipant({...editingParticipant, f_name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Last Name</label>
                                    <input 
                                        required
                                        type="text"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.l_name}
                                        onChange={e => setEditingParticipant({...editingParticipant, l_name: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Middle Initial</label>
                                    <input 
                                        type="text"
                                        maxLength={1}
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.m_initial || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, m_initial: e.target.value.toUpperCase()})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Suffix</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.suffix || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, suffix: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Email</label>
                                    <input 
                                        type="email"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.email || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, email: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Mobile No.</label>
                                    <input 
                                        type="tel"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.mobile_no || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, mobile_no: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Office</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.office || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, office: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Position</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.position || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, position: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Gender</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.gender || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, gender: e.target.value})}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Age Group</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.age_group || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, age_group: e.target.value})}
                                    >
                                        <option value="18-24">18-24</option>
                                        <option value="25-34">25-34</option>
                                        <option value="35-44">35-44</option>
                                        <option value="45-54">45-54</option>
                                        <option value="55-64">55-64</option>
                                        <option value="65+">65+</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">PWD</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.pwd || 'No'}
                                        onChange={e => setEditingParticipant({...editingParticipant, pwd: e.target.value})}
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Indigenous People</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 outline-none transition-colors"
                                        value={editingParticipant.indigenous_people || 'No'}
                                        onChange={e => setEditingParticipant({...editingParticipant, indigenous_people: e.target.value})}
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[rgb(var(--ink)/0.06)]">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="h-9 px-5 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {submitting ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ParticipantsList;
