import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Save, Loader2, CheckCircle, AlertCircle, Building2, Upload } from 'lucide-react';
import { Office } from '../../types/database';

const Settings: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | ''>('');
  
  const [signatory, setSignatory] = useState({
    name: '',
    position: '',
    esig_link: ''
  });
  const [selectedSignatureFile, setSelectedSignatureFile] = useState<File | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState('');

  useEffect(() => {
    if (user?.role === 'Admin') {
      fetchOffices();
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedOfficeId) {
      fetchSignatory(selectedOfficeId);
    } else {
      setSignatory({ name: '', position: '', esig_link: '' });
      setSelectedSignatureFile(null);
      setSignaturePreviewUrl('');
    }
  }, [selectedOfficeId]);

  useEffect(() => {
    return () => {
      if (signaturePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(signaturePreviewUrl);
      }
    };
  }, [signaturePreviewUrl]);

  const fetchOffices = async () => {
    try {
      const { data, error } = await supabase
        .from('offices')
        .select('*')
        .order('name');
        
      if (error) throw error;
      setOffices(data || []);
      
      if (data && data.length > 0) {
        setSelectedOfficeId(data[0].office_id);
      }
    } catch (err) {
      console.error('Error fetching offices:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignatory = async (officeId: number) => {
    try {
      setSelectedSignatureFile(null);
      setSignaturePreviewUrl('');
      const { data, error } = await supabase
        .from('tbl_signatory')
        .select('*')
        .eq('office_id', officeId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSignatory({
          name: data.name || '',
          position: data.position || '',
          esig_link: data.esig_link || ''
        });
        setSignaturePreviewUrl(data.esig_link || '');
      } else {
        setSignatory({ name: '', position: '', esig_link: '' });
        setSignaturePreviewUrl('');
      }
    } catch (err) {
      console.error('Error fetching signatory:', err);
    }
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload a valid image file for the e-signature.' });
      e.target.value = '';
      return;
    }

    setMessage(null);
    setSelectedSignatureFile(file);
    setSignaturePreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfficeId) return;
    
    setSaving(true);
    setMessage(null);

    try {
      let esigLink = signatory.esig_link;

      if (selectedSignatureFile) {
        const fileExtension = selectedSignatureFile.name.includes('.')
          ? selectedSignatureFile.name.split('.').pop()?.toLowerCase()
          : '';
        const filePath = `office-${selectedOfficeId}/esignature-${selectedOfficeId}-${Date.now()}${fileExtension ? `.${fileExtension}` : ''}`;

        const { error: uploadError } = await supabase.storage
          .from('signatory')
          .upload(filePath, selectedSignatureFile, {
            cacheControl: '3600',
            upsert: true,
            contentType: selectedSignatureFile.type
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('signatory')
          .getPublicUrl(filePath);

        esigLink = publicUrlData.publicUrl;
      }

      // Check if exists
      const { data: existing } = await supabase
        .from('tbl_signatory')
        .select('id')
        .eq('office_id', selectedOfficeId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('tbl_signatory')
          .update({
            name: signatory.name,
            position: signatory.position,
            esig_link: esigLink
          })
          .eq('id', existing.id);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tbl_signatory')
          .insert({
            office_id: selectedOfficeId,
            name: signatory.name,
            position: signatory.position,
            esig_link: esigLink
          });
          
        if (error) throw error;
      }

      setSignatory((prev) => ({ ...prev, esig_link: esigLink }));
      setSelectedSignatureFile(null);
      setSignaturePreviewUrl(esigLink);
      setMessage({ type: 'success', text: 'Signatory settings saved successfully.' });
    } catch (err: any) {
      console.error('Error saving signatory:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (user?.role !== 'Admin') {
    return (
      <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
        <p className="text-slate-500">You do not have permission to view this page. Only Administrators can configure signatories.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Certificate Signatories</h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure the default signatory for Certificates of Appearance for each office.
          </p>
        </div>

        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Office</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Building2 className="h-5 w-5 text-slate-400" />
            </div>
            <select
              value={selectedOfficeId}
              onChange={(e) => setSelectedOfficeId(e.target.value ? Number(e.target.value) : '')}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none bg-white"
            >
              <option value="" disabled>Select an office...</option>
              {offices.map(office => (
                <option key={office.office_id} value={office.office_id}>
                  {office.name} {office.code ? `(${office.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedOfficeId ? (
          <form onSubmit={handleSave} className="p-6 space-y-6">
            {message && (
              <div className={`p-4 rounded-lg flex items-start gap-3 ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <p className="text-sm font-medium">{message.text}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  required
                  value={signatory.name}
                  onChange={(e) => setSignatory({ ...signatory, name: e.target.value })}
                  placeholder="e.g. Corazon S. Vicente"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Position</label>
                <input
                  type="text"
                  required
                  value={signatory.position}
                  onChange={(e) => setSignatory({ ...signatory, position: e.target.value })}
                  placeholder="e.g. Division Chief, LGMED"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-4 md:col-span-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">E-Signature Image (Optional)</label>
                  <label className="flex items-center justify-center gap-3 w-full px-4 py-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer text-slate-600">
                    <Upload className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      {selectedSignatureFile ? selectedSignatureFile.name : 'Upload signature image'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSignatureChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    Upload the signature image and it will be saved to the `signatory` bucket. PNG with transparent background is recommended.
                  </p>
                </div>

                {signaturePreviewUrl && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      {selectedSignatureFile ? 'Signature Preview' : 'Current E-Signature'}
                    </p>
                    <div className="h-28 flex items-center justify-center rounded-lg bg-slate-50">
                      <img
                        src={signaturePreviewUrl}
                        alt="Signatory e-signature"
                        className="max-h-20 max-w-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="p-12 text-center text-slate-500">
            Please select an office to configure its signatory.
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
