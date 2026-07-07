import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FeatureAnnouncement, AnnouncementType } from '../../types/database';
import { Plus, Trash2, Loader2, CheckCircle, AlertCircle, Eye, Power, Pencil } from 'lucide-react';
import { AnnouncementModalCard, AnnouncementCardData } from '../../components/AnnouncementModal';

const AnnouncementManagement: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<FeatureAnnouncement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  // Announcement id being edited; null means the form creates a new one
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'info' as AnnouncementType,
    is_active: true
  });

  // Announcement being previewed (saved item or the current draft), null when closed
  const [previewData, setPreviewData] = useState<AnnouncementCardData | null>(null);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('feature_announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error fetching announcements:', err);
      setMessage({ type: 'error', text: 'Failed to load announcements' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', type: 'info', is_active: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleStartEdit = (announcement: FeatureAnnouncement) => {
    setFormData({
      title: announcement.title,
      description: announcement.description,
      type: announcement.type,
      is_active: announcement.is_active
    });
    setEditingId(announcement.id);
    setShowForm(true);
    setMessage(null);
  };

  const handleStartCreate = () => {
    if (showForm && !editingId) {
      resetForm();
      return;
    }
    setFormData({ title: '', description: '', type: 'info', is_active: true });
    setEditingId(null);
    setShowForm(true);
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim() || !formData.description.trim()) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        const { error } = await supabase
          .from('feature_announcements')
          .update({
            title: formData.title,
            description: formData.description,
            type: formData.type,
            is_active: formData.is_active
          })
          .eq('id', editingId);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Announcement updated successfully!' });
      } else {
        const { error } = await supabase
          .from('feature_announcements')
          .insert([{
            title: formData.title,
            description: formData.description,
            type: formData.type,
            is_active: formData.is_active,
            created_by: user.user_id
          }]);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Announcement created successfully!' });
      }

      resetForm();
      await fetchAnnouncements();
    } catch (err) {
      console.error('Error saving announcement:', err);
      setMessage({ type: 'error', text: editingId ? 'Failed to update announcement' : 'Failed to create announcement' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: number, current: boolean) => {
    try {
      const { error } = await supabase
        .from('feature_announcements')
        .update({ is_active: !current })
        .eq('id', id);

      if (error) throw error;
      await fetchAnnouncements();
    } catch (err) {
      console.error('Error updating announcement:', err);
      setMessage({ type: 'error', text: 'Failed to update announcement' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this announcement?')) return;

    try {
      const { error } = await supabase
        .from('feature_announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      if (id === editingId) resetForm();
      await fetchAnnouncements();
      setMessage({ type: 'success', text: 'Announcement deleted' });
    } catch (err) {
      console.error('Error deleting announcement:', err);
      setMessage({ type: 'error', text: 'Failed to delete announcement' });
    }
  };

  const typeColors = {
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    success: 'bg-green-50 border-green-200 text-green-700'
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Feature Announcements</h3>
          <p className="mt-1 text-xs text-slate-500">
            Create announcements to notify users about new features when they log in.
          </p>
        </div>
        <button
          onClick={handleStartCreate}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <Plus className="h-4 w-4" />
          New Announcement
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-lg border p-3 ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          )}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-3 rounded-lg border border-slate-300 bg-card p-4">
          <h4 className="text-sm font-semibold text-slate-800">
            {editingId ? 'Edit Announcement' : 'New Announcement'}
          </h4>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Certificate Email Feature"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the new feature in detail..."
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as AnnouncementType })}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Status</label>
              <select
                value={formData.is_active ? 'active' : 'inactive'}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editingId ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                editingId ? 'Save Changes' : 'Create Announcement'
              )}
            </button>
            <button
              type="button"
              onClick={() => setPreviewData({
                title: formData.title.trim() || 'Untitled announcement',
                description: formData.description.trim() || 'No description yet.',
                type: formData.type
              })}
              disabled={!formData.title.trim() && !formData.description.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Announcements List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : announcements.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No announcements yet</p>
        ) : (
          announcements.map((announcement) => (
            <div
              key={announcement.id}
              className={`flex items-start gap-3 rounded-lg border p-3 ${typeColors[announcement.type]}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm">{announcement.title}</h4>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    announcement.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-700'
                  }`}>
                    {announcement.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-1 text-xs whitespace-pre-wrap opacity-75">
                  {announcement.description.substring(0, 120)}
                  {announcement.description.length > 120 ? '...' : ''}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPreviewData(announcement)}
                  title="Preview as users will see it"
                  className="rounded p-1.5 text-slate-600 transition-colors hover:bg-slate-200"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleStartEdit(announcement)}
                  title="Edit"
                  className={`rounded p-1.5 transition-colors ${
                    editingId === announcement.id
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleToggleActive(announcement.id, announcement.is_active)}
                  title={announcement.is_active ? 'Deactivate' : 'Activate'}
                  className={`rounded p-1.5 transition-colors ${
                    announcement.is_active
                      ? 'text-green-600 hover:bg-green-100'
                      : 'text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  <Power className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(announcement.id)}
                  title="Delete"
                  className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Preview overlay — renders the same card users see at login */}
      {previewData && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewData(null)}
        >
          <div className="flex w-full max-w-md flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow">
              <Eye className="h-3.5 w-3.5" />
              Preview — this is how users will see it at login
            </span>
            <AnnouncementModalCard
              announcement={previewData}
              position={1}
              total={1}
              onDismiss={() => setPreviewData(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default AnnouncementManagement;
