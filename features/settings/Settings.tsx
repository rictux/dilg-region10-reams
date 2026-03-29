import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Save, Loader2, CheckCircle, AlertCircle, Building2, Upload, Eye, X } from 'lucide-react';
import { Event, Office } from '../../types/database';
import { parseFoodInclusion } from '../../lib/eventFoodInclusion';
import CertificateOfAppearanceCard, {
  buildEventDateString,
  CertificateParticipantRecord,
  CertificateTemplateVariant,
  DEFAULT_CERTIFICATE_TEMPLATE_VARIANT,
  getEventDateRows
} from '../reports/CertificateOfAppearanceTemplate';

const MM_TO_PX = 3.7795275591;
const CERTIFICATE_MODAL_PREVIEW_SCALE = 0.72;
const CERTIFICATE_TEMPLATE_OPTIONS: Array<{
  value: CertificateTemplateVariant;
  label: string;
  description: string;
}> = [
  {
    value: 'with_serial',
    label: 'With Serial Number',
    description: 'Displays the generated certificate serial number in the upper-right corner.'
  },
  {
    value: 'without_serial',
    label: 'Without Serial Number',
    description: 'Uses the same certificate layout but hides the serial number.'
  }
];

const CERTIFICATE_PREVIEW_EVENT: Event = {
  event_id: 0,
  event_name: 'Regional Orientation on Local Governance',
  venue: 'DILG Region X Training Hall',
  start_date: '2026-03-24',
  end_date: '2026-03-25',
  status: 'Scheduled',
  registration_open: true,
  session: 'All_Day',
  organize_by: null,
  has_accommodation: true,
  dates_with_accom: ['2026-03-24'],
  food_inclusion: [
    '2026-03-24=am_snacks|lunch|pm_snacks',
    '2026-03-25=breakfast|lunch'
  ]
};

const CERTIFICATE_PREVIEW_PARTICIPANT: CertificateParticipantRecord = {
  participant: {
    participant_id: 1,
    participant_code: 'CERT-PREVIEW-001',
    full_name: 'Juan Dela Cruz',
    f_name: 'Juan',
    l_name: 'Dela Cruz',
    office: 'City Government of Sample',
    position: 'Planning Officer'
  },
  needs_accommodation: true,
  date_accommodation: ['2026-03-24'],
  log_dates: ['2026-03-24', '2026-03-25']
};

const CERTIFICATE_PREVIEW_DATE_STRING = buildEventDateString(CERTIFICATE_PREVIEW_EVENT);
const CERTIFICATE_PREVIEW_FOOD_INCLUSION_MAP = parseFoodInclusion(
  CERTIFICATE_PREVIEW_EVENT.food_inclusion || [],
  getEventDateRows(CERTIFICATE_PREVIEW_EVENT).map((row) => row.key)
);

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
    esig_link: '',
    certificate_template_variant: DEFAULT_CERTIFICATE_TEMPLATE_VARIANT as CertificateTemplateVariant
  });
  const [selectedSignatureFile, setSelectedSignatureFile] = useState<File | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState('');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

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
      setSignatory({
        name: '',
        position: '',
        esig_link: '',
        certificate_template_variant: DEFAULT_CERTIFICATE_TEMPLATE_VARIANT
      });
      setSelectedSignatureFile(null);
      setSignaturePreviewUrl('');
      setIsPreviewModalOpen(false);
    }
  }, [selectedOfficeId]);

  useEffect(() => {
    return () => {
      if (signaturePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(signaturePreviewUrl);
      }
    };
  }, [signaturePreviewUrl]);

  useEffect(() => {
    if (!isPreviewModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewModalOpen]);

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
          esig_link: data.esig_link || '',
          certificate_template_variant:
            data.certificate_template_variant === 'without_serial'
              ? 'without_serial'
              : DEFAULT_CERTIFICATE_TEMPLATE_VARIANT
        });
        setSignaturePreviewUrl(data.esig_link || '');
        setIsPreviewModalOpen(false);
      } else {
        setSignatory({
          name: '',
          position: '',
          esig_link: '',
          certificate_template_variant: DEFAULT_CERTIFICATE_TEMPLATE_VARIANT
        });
        setSignaturePreviewUrl('');
        setIsPreviewModalOpen(false);
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
            esig_link: esigLink,
            certificate_template_variant: signatory.certificate_template_variant
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
            esig_link: esigLink,
            certificate_template_variant: signatory.certificate_template_variant
          });
          
        if (error) throw error;
      }

      setSignatory((prev) => ({ ...prev, esig_link: esigLink }));
      setSelectedSignatureFile(null);
      setSignaturePreviewUrl(esigLink);
      setMessage({ type: 'success', text: 'Certificate settings saved successfully.' });
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

  const selectedOffice = offices.find((office) => office.office_id === selectedOfficeId) || null;
  const previewSignatory = {
    name: signatory.name,
    position: signatory.position,
    esig_link: signaturePreviewUrl || signatory.esig_link,
    certificate_template_variant: signatory.certificate_template_variant
  };

  const renderCertificatePreview = (scale: number) => {
    const previewWidthPx = 210 * MM_TO_PX * scale;
    const previewHeightPx = 148.5 * MM_TO_PX * scale;

    return (
      <div
        className="mx-auto overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)]"
        style={{
          width: `${previewWidthPx}px`,
          height: `${previewHeightPx}px`
        }}
      >
        <div
          style={{
            width: '210mm',
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          <CertificateOfAppearanceCard
            event={CERTIFICATE_PREVIEW_EVENT}
            participantRecord={CERTIFICATE_PREVIEW_PARTICIPANT}
            signatory={previewSignatory}
            dateString={CERTIFICATE_PREVIEW_DATE_STRING}
            eventFoodInclusionMap={CERTIFICATE_PREVIEW_FOOD_INCLUSION_MAP}
            certificateSerialNumber="LGMED-2026-Mar-24-25-001-01"
            templateVariant={signatory.certificate_template_variant}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Certificate Signatories</h2>
            <p className="mt-1 text-sm text-slate-500">
              Configure the default signatory and template for Certificates of Appearance for each office.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-5 sm:p-6">
            <div className="space-y-6">
              {message && (
                <div
                  className={`flex items-start gap-3 rounded-xl border p-3.5 ${
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

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(460px,0.9fr)]">
                <section className="space-y-4">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 lg:p-6">
                    <div className="mb-5">
                      <h3 className="text-sm font-semibold text-slate-800">Signatory Setup</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Update the office, signer details, and e-signature in one place so the signature stays visible while editing.
                      </p>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-slate-700">Select Office</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                              <Building2 className="h-5 w-5 text-slate-400" />
                            </div>
                            <select
                              value={selectedOfficeId}
                              onChange={(e) => setSelectedOfficeId(e.target.value ? Number(e.target.value) : '')}
                              className="w-full appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option value="" disabled>Select an office...</option>
                              {offices.map((office) => (
                                <option key={office.office_id} value={office.office_id}>
                                  {office.name} {office.code ? `(${office.code})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-slate-700">Name</label>
                          <input
                            type="text"
                            required
                            disabled={!selectedOfficeId}
                            value={signatory.name}
                            onChange={(e) => setSignatory({ ...signatory, name: e.target.value })}
                            placeholder="e.g. Corazon S. Vicente"
                            className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-slate-700">Position</label>
                          <input
                            type="text"
                            required
                            disabled={!selectedOfficeId}
                            value={signatory.position}
                            onChange={(e) => setSignatory({ ...signatory, position: e.target.value })}
                            placeholder="e.g. Division Chief, LGMED"
                            className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                        <div className="mb-3">
                          <h3 className="text-sm font-semibold text-slate-800">Signature Image</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Upload a transparent PNG for the cleanest printed result.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <label className={`flex w-full items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-slate-600 transition-colors ${
                            selectedOfficeId ? 'cursor-pointer bg-slate-50 hover:bg-slate-100' : 'cursor-not-allowed bg-slate-100'
                          }`}>
                            <Upload className="h-5 w-5" />
                            <span className="text-sm font-medium">
                              {selectedSignatureFile ? selectedSignatureFile.name : 'Upload signature image'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleSignatureChange}
                              disabled={!selectedOfficeId}
                              className="hidden"
                            />
                          </label>

                          <p className="text-xs leading-relaxed text-slate-500">
                            The file is saved to the `signatory` bucket and used in the certificate preview and print layout.
                          </p>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="mb-2 text-sm font-medium text-slate-700">
                              {signaturePreviewUrl
                                ? selectedSignatureFile
                                  ? 'Signature Preview'
                                  : 'Current E-Signature'
                                : 'Signature Preview'}
                            </p>
                            <div className="flex h-40 items-center justify-center rounded-lg bg-white px-4">
                              {signaturePreviewUrl ? (
                                <img
                                  src={signaturePreviewUrl}
                                  alt="Signatory e-signature"
                                  className="max-h-28 max-w-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <p className="text-center text-xs text-slate-500">
                                  Upload a signature to see it here.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </section>

                <section className="space-y-4">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-800">Template Selection</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Choose which Certificate of Appearance layout this office will use for preview, saving, and printing.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {CERTIFICATE_TEMPLATE_OPTIONS.map((option) => {
                        const isSelected = signatory.certificate_template_variant === option.value;

                        return (
                          <label
                            key={option.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                              isSelected
                                ? 'border-indigo-300 bg-indigo-50'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="certificate_template_variant"
                              value={option.value}
                              checked={isSelected}
                              onChange={() =>
                                setSignatory((prev) => ({
                                  ...prev,
                                  certificate_template_variant: option.value
                                }))
                              }
                              className="mt-1 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{option.label}</p>
                              <p className="mt-1 text-xs leading-relaxed text-slate-500">{option.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-800">Preview Template</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Open the certificate preview in a modal so the settings content stays compact.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-slate-800">
                          {selectedOffice?.name || 'Selected Office'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {signatory.certificate_template_variant === 'with_serial'
                            ? 'Serial number is visible in this layout.'
                            : 'Serial number is hidden in this layout.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsPreviewModalOpen(true)}
                        disabled={!selectedOfficeId}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-400"
                      >
                        <Eye className="h-4 w-4" />
                        Show Template Preview
                      </button>
                    </div>
                  </section>
                </section>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                Saving updates the signatory, signature image, and default certificate layout for{' '}
                <span className="font-medium text-slate-700">{selectedOffice?.name || 'the selected office'}</span>.
              </div>

              <button
                type="submit"
                disabled={saving || !selectedOfficeId}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>

      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Close certificate preview"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setIsPreviewModalOpen(false)}
          />

          <div className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Certificate Preview</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Reviewing {selectedOffice?.name || 'the selected office'} using the active template and signature.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 overflow-auto no-scrollbar bg-slate-100 p-4 sm:p-6">
              <div className="min-w-fit">
                {renderCertificatePreview(CERTIFICATE_MODAL_PREVIEW_SCALE)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
