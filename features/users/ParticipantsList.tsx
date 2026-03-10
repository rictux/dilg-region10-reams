import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Participant } from '../../types/database';
import { Search, Edit, Loader2, X, Save, User } from 'lucide-react';

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
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search participants..." 
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Participant Name</th>
                                <th className="px-6 py-4">Contact</th>
                                <th className="px-6 py-4">Office & Position</th>
                                <th className="px-6 py-4">Demographics</th>
                                {currentUser?.role === 'Admin' && <th className="px-6 py-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-8">Loading participants...</td></tr>
                            ) : paginatedParticipants.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No participants found.</td></tr>
                            ) : (
                                paginatedParticipants.map((participant) => (
                                    <tr key={participant.participant_id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                                                    {participant.f_name?.charAt(0) || <User size={20} />}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-800">{participant.full_name}</div>
                                                    <div className="text-xs text-slate-500 font-mono">{participant.participant_code}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-slate-800">{participant.email || '-'}</div>
                                            <div className="text-xs text-slate-500">{participant.mobile_no || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-slate-800">{participant.office || '-'}</div>
                                            <div className="text-xs text-slate-500">{participant.position || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs text-slate-600">
                                                <div>Gender: {participant.gender || '-'}</div>
                                                <div>Age: {participant.age_group || '-'}</div>
                                                <div className="flex gap-2 mt-1">
                                                    {participant.pwd === 'Yes' && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium">PWD</span>}
                                                    {participant.indigenous_people === 'Yes' && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium">IP</span>}
                                                </div>
                                            </div>
                                        </td>
                                        {currentUser?.role === 'Admin' && (
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleEdit(participant)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Edit Participant"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-sm text-slate-500">
                            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredParticipants.length)}</span> of <span className="font-medium">{filteredParticipants.length}</span> results
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <div className="flex items-center gap-1 text-sm font-medium text-slate-700 px-2">
                                {currentPage} of {totalPages}
                            </div>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !submitting && setShowEditModal(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Edit className="text-indigo-600" size={24} />
                                Edit Participant
                            </h3>
                            <button onClick={() => !submitting && setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        
                        {formError && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
                                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                                <p className="text-sm">{formError}</p>
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                                    <input 
                                        required
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.f_name}
                                        onChange={e => setEditingParticipant({...editingParticipant, f_name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                                    <input 
                                        required
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.l_name}
                                        onChange={e => setEditingParticipant({...editingParticipant, l_name: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Middle Initial</label>
                                    <input 
                                        type="text"
                                        maxLength={1}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.m_initial || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, m_initial: e.target.value.toUpperCase()})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Suffix</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.suffix || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, suffix: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input 
                                        type="email"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.email || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, email: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mobile No.</label>
                                    <input 
                                        type="tel"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.mobile_no || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, mobile_no: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Office</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.office || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, office: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Position</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.position || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, position: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.gender || ''}
                                        onChange={e => setEditingParticipant({...editingParticipant, gender: e.target.value})}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Age Group</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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
                                    <label className="block text-sm font-medium text-slate-700 mb-1">PWD</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.pwd || 'No'}
                                        onChange={e => setEditingParticipant({...editingParticipant, pwd: e.target.value})}
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Indigenous People</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={editingParticipant.indigenous_people || 'No'}
                                        onChange={e => setEditingParticipant({...editingParticipant, indigenous_people: e.target.value})}
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={submitting}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
                                >
                                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
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
