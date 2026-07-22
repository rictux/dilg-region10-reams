import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Save, Loader2, CheckCircle, AlertCircle, Building2, Upload, Eye, X, Trash2, Plus, Star, FileSignature, Megaphone, Handshake } from 'lucide-react';
import { Event, Office } from '../../types/database';
import AnnouncementManagement from './AnnouncementManagement';
import AppearanceSettings from './AppearanceSettings';
import { parseFoodInclusion } from '../../lib/eventFoodInclusion';
import CertificateOfAppearanceCard, {
  buildEventDateString,
  CertificateParticipantRecord,
  CertificateTemplateVariant,
  DEFAULT_CERTIFICATE_TEMPLATE_VARIANT,
  getEventDateRows
} from '../reports/CertificateOfAppearanceTemplate';

const MM_TO_PX = 3.7795275591;
const CERTIFICATE_BASE_WIDTH_PX = 210 * MM_TO_PX;
const CERTIFICATE_BASE_HEIGHT_PX = 148.5 * MM_TO_PX;

const getCertificatePreviewModalLayout = (viewportWidth: number, viewportHeight: number) => {
  let baseScale = 1;
  let modalMaxWidth = Math.min(viewportWidth - 24, 960);
  let horizontalPadding = 24;
  let verticalChrome = 160;

  if (viewportWidth < 640) {
    baseScale = 0.5;
    modalMaxWidth = viewportWidth - 12;
    horizontalPadding = 12;
    verticalChrome = 136;
  } else if (viewportWidth < 1024) {
    baseScale = 0.72;
    modalMaxWidth = Math.min(viewportWidth - 24, 720);
    horizontalPadding = 20;
    verticalChrome = 148;
  } else if (viewportWidth < 1280) {
    baseScale = 0.9;
    modalMaxWidth = Math.min(viewportWidth - 48, 860);
    horizontalPadding = 24;
    verticalChrome = 156;
  } else {
    baseScale = 1.04;
    modalMaxWidth = Math.min(viewportWidth - 64, 980);
    horizontalPadding = 28;
    verticalChrome = 168;
  }

  const availableWidth = Math.max(modalMaxWidth - horizontalPadding * 2, 240);
  const availableHeight = Math.max(viewportHeight - verticalChrome, 220);
  const fitScale = Math.min(
    availableWidth / CERTIFICATE_BASE_WIDTH_PX,
    availableHeight / CERTIFICATE_BASE_HEIGHT_PX
  );

  return {
    scale: Math.min(baseScale, fitScale),
    modalMaxWidth
  };
};
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

const createEmptySignatoryState = () => ({
  label: '',
  name: '',
  position: '',
  esig_link: '',
  agency_name: '',
  agency_logo_url: '',
  header: '',
  sub_header: '',
  address: '',
  website: '',
  footer: '',
  post_nominals: '',
  certificate_template_variant: DEFAULT_CERTIFICATE_TEMPLATE_VARIANT as CertificateTemplateVariant,
  is_default: false
});

const normalizeSignatoryName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const SIGNATORY_NAME_LOOKUP_DEBOUNCE_MS = 450;

type SignatoryState = ReturnType<typeof createEmptySignatoryState>;

type SignatoryRow = SignatoryState & {
  id: number;
  office_id: number;
  active?: boolean | null;
  sort_order?: number | null;
};

const isPartnerAgencySignatory = (row: Pick<SignatoryState, 'agency_name' | 'agency_logo_url'>) =>
  Boolean(row.agency_name?.trim() || row.agency_logo_url?.trim());

const Settings: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const isOfficeManager = user?.role === 'OfficeManager';
  const canManageCertificateSettings = isAdmin || isOfficeManager;
  const location = useLocation();
  // View is driven by the sidebar submenu (/settings, ?view=partner-signatories, etc.).
  // Appearance is open to every user; certificate settings/Announcements stay permission-gated,
  // so users without certificate access land on Appearance by default.
  const viewParam = new URLSearchParams(location.search).get('view');
  const activeView =
    viewParam === 'appearance'
      ? 'appearance'
      : canManageCertificateSettings && viewParam === 'partner-signatories'
        ? 'partner-signatories'
      : isAdmin && viewParam === 'announcements'
        ? 'announcements'
        : canManageCertificateSettings
          ? 'signatories'
          : 'appearance';
  const isPartnerSignatoryView = activeView === 'partner-signatories';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | ''>('');
  
  const [signatory, setSignatory] = useState(createEmptySignatoryState);
  const [signatories, setSignatories] = useState<SignatoryRow[]>([]);
  const [selectedSignatoryId, setSelectedSignatoryId] = useState<number | ''>('');
  const [selectedSignatureFile, setSelectedSignatureFile] = useState<File | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState('');
  const [selectedAgencyLogoFile, setSelectedAgencyLogoFile] = useState<File | null>(null);
  const [agencyLogoPreviewUrl, setAgencyLogoPreviewUrl] = useState('');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewViewport, setPreviewViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900
  }));

  useEffect(() => {
    if (!user) return;

    if (isAdmin) {
      fetchOffices();
      return;
    }

    if (isOfficeManager && user.office_id) {
      fetchManagedOffice(user.office_id);
      return;
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (selectedOfficeId) {
      fetchSignatories(selectedOfficeId);
    } else {
      setSignatories([]);
      setSelectedSignatoryId('');
      setSignatory(createEmptySignatoryState());
      setSelectedSignatureFile(null);
      setSignaturePreviewUrl('');
      setSelectedAgencyLogoFile(null);
      setAgencyLogoPreviewUrl('');
      setIsPreviewModalOpen(false);
    }
  }, [selectedOfficeId, isPartnerSignatoryView]);

  useEffect(() => {
    return () => {
      if (signaturePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(signaturePreviewUrl);
      }
    };
  }, [signaturePreviewUrl]);

  useEffect(() => {
    return () => {
      if (agencyLogoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(agencyLogoPreviewUrl);
      }
    };
  }, [agencyLogoPreviewUrl]);

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

  useEffect(() => {
    if (!isPreviewModalOpen) return;

    const updatePreviewViewport = () => {
      setPreviewViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updatePreviewViewport();
    window.addEventListener('resize', updatePreviewViewport);

    return () => window.removeEventListener('resize', updatePreviewViewport);
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

  const fetchManagedOffice = async (officeId: number) => {
    try {
      const { data, error } = await supabase
        .from('offices')
        .select('*')
        .eq('office_id', officeId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setOffices([data]);
        setSelectedOfficeId(data.office_id);
      } else {
        setOffices([]);
        setSelectedOfficeId('');
      }
    } catch (err) {
      console.error('Error fetching managed office:', err);
    } finally {
      setLoading(false);
    }
  };

  const applySignatoryRow = (row: SignatoryRow | null) => {
    setSelectedSignatureFile(null);
    setSignaturePreviewUrl(row?.esig_link || '');
    setSelectedAgencyLogoFile(null);
    setAgencyLogoPreviewUrl(row?.agency_logo_url || '');
    setSignatory(
      row
        ? {
            label: row.label || '',
            name: row.name || '',
            position: row.position || '',
            esig_link: row.esig_link || '',
            agency_name: row.agency_name || '',
            agency_logo_url: row.agency_logo_url || '',
            header: row.header || '',
            sub_header: row.sub_header || '',
            address: row.address || '',
            website: row.website || '',
            footer: row.footer || '',
            post_nominals: row.post_nominals || '',
            certificate_template_variant:
              row.certificate_template_variant === 'without_serial'
                ? 'without_serial'
                : DEFAULT_CERTIFICATE_TEMPLATE_VARIANT,
            is_default: !!row.is_default
          }
        : createEmptySignatoryState()
    );
    setIsPreviewModalOpen(false);
  };

  const findLoadedSignatoryByName = (name: string) => {
    const normalizedName = normalizeSignatoryName(name);

    if (!normalizedName) {
      return null;
    }

    return signatories.find((item) => normalizeSignatoryName(item.name || '') === normalizedName) || null;
  };

  const fetchExistingSignatoryByName = async (name: string) => {
    if (!selectedOfficeId) {
      return null;
    }

    const normalizedName = normalizeSignatoryName(name);

    if (!normalizedName) {
      return null;
    }

    const loadedMatch = findLoadedSignatoryByName(name);

    if (loadedMatch) {
      return loadedMatch;
    }

    const { data, error } = await supabase
      .from('tbl_signatory')
      .select('*')
      .eq('office_id', selectedOfficeId)
      .ilike('name', name.trim())
      .order('active', { ascending: false })
      .order('is_default', { ascending: false })
      .limit(5);

    if (error) throw error;

    const rows = (data || []) as SignatoryRow[];
    return rows.find((item) =>
      isPartnerAgencySignatory(item) === isPartnerSignatoryView
      && normalizeSignatoryName(item.name || '') === normalizedName
    ) || null;
  };

  useEffect(() => {
    if (!selectedOfficeId || selectedSignatoryId) {
      return;
    }

    const nameToLookup = signatory.name;

    if (normalizeSignatoryName(nameToLookup).length < 2) {
      return;
    }

    let isCurrentLookup = true;
    const timer = window.setTimeout(async () => {
      try {
        const existing = await fetchExistingSignatoryByName(nameToLookup);

        if (!isCurrentLookup || !existing) {
          return;
        }

        setSelectedSignatoryId(existing.id);
        applySignatoryRow(existing);
        setMessage({
          type: 'success',
          text: 'Existing signatory found. Saved details and signature were loaded.'
        });
      } catch (err: any) {
        if (!isCurrentLookup) {
          return;
        }

        console.error('Error checking existing signatory:', err);
        setMessage({ type: 'error', text: err.message || 'Unable to check existing signatories.' });
      }
    }, SIGNATORY_NAME_LOOKUP_DEBOUNCE_MS);

    return () => {
      isCurrentLookup = false;
      window.clearTimeout(timer);
    };
  }, [selectedOfficeId, selectedSignatoryId, signatory.name, signatories]);

  const fetchSignatories = async (officeId: number, preferredSignatoryId?: number | '') => {
    try {
      const { data, error } = await supabase
        .from('tbl_signatory')
        .select('*')
        .eq('office_id', officeId)
        .eq('active', true)
        .order('is_default', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      const rows = ((data || []) as SignatoryRow[]).filter(
        (row) => isPartnerAgencySignatory(row) === isPartnerSignatoryView
      );
      setSignatories(rows);

      const selected =
        rows.find((row) => row.id === preferredSignatoryId) ||
        rows.find((row) => row.id === selectedSignatoryId) ||
        rows.find((row) => row.is_default) ||
        rows[0] ||
        null;

      setSelectedSignatoryId(selected?.id || '');
      applySignatoryRow(selected);
    } catch (err) {
      console.error('Error fetching signatories:', err);
    }
  };

  const handleSelectSignatory = (id: number | '') => {
    setSelectedSignatoryId(id);

    if (!id) {
      applySignatoryRow(null);
      return;
    }

    const row = signatories.find((item) => item.id === id) || null;
    applySignatoryRow(row);
  };

  const handleAddSignatory = () => {
    setSelectedSignatoryId('');
    applySignatoryRow(null);
    setSignatory((current) => ({
      ...current,
      header: isPartnerSignatoryView ? '' : signatory.header,
      sub_header: isPartnerSignatoryView ? '' : signatory.sub_header,
      address: isPartnerSignatoryView ? '' : signatory.address,
      website: isPartnerSignatoryView ? '' : signatory.website,
      footer: isPartnerSignatoryView ? '' : signatory.footer,
      certificate_template_variant: signatory.certificate_template_variant,
      is_default: !isPartnerSignatoryView && signatories.length === 0
    }));
    setMessage(null);
  };

  const handleSignatoryNameChange = (value: string) => {
    setSignatory((current) => ({ ...current, name: value }));

    if (selectedSignatoryId) {
      return;
    }

    const existing = findLoadedSignatoryByName(value);

    if (!existing) {
      return;
    }

    setSelectedSignatoryId(existing.id);
    applySignatoryRow(existing);
    setMessage({
      type: 'success',
      text: 'Existing signatory found. Saved details and signature were loaded.'
    });
  };

  const handleDeactivateSignatory = async () => {
    if (!selectedOfficeId || !selectedSignatoryId) {
      handleAddSignatory();
      return;
    }

    if (!isPartnerSignatoryView && signatories.length <= 1) {
      setMessage({ type: 'error', text: 'Each office must keep at least one active signatory.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('tbl_signatory')
        .update({ active: false, is_default: false })
        .eq('id', selectedSignatoryId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Signatory removed from the active list.' });
      await fetchSignatories(selectedOfficeId);
    } catch (err: any) {
      console.error('Error removing signatory:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to remove signatory.' });
    } finally {
      setSaving(false);
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

  const handleRemoveSignature = () => {
    if (signaturePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(signaturePreviewUrl);
    }

    setMessage(null);
    setSelectedSignatureFile(null);
    setSignaturePreviewUrl('');
    setSignatory((prev) => ({ ...prev, esig_link: '' }));
  };

  const handleAgencyLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Agency logos must be PNG, JPEG, or WebP images.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Agency logo must be 5 MB or smaller.' });
      return;
    }

    setMessage(null);
    setSelectedAgencyLogoFile(file);
    setAgencyLogoPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveAgencyLogo = () => {
    if (agencyLogoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(agencyLogoPreviewUrl);
    }

    setMessage(null);
    setSelectedAgencyLogoFile(null);
    setAgencyLogoPreviewUrl('');
    setSignatory((prev) => ({ ...prev, agency_logo_url: '' }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfficeId) return;

    if (isOfficeManager && selectedOfficeId !== user?.office_id) {
      setMessage({ type: 'error', text: 'You can only manage certificate settings for your assigned office.' });
      return;
    }

    if (isPartnerSignatoryView && !signatory.agency_name.trim()) {
      setMessage({ type: 'error', text: 'Enter the official partner agency name.' });
      return;
    }

    if (
      isPartnerSignatoryView
      && !selectedAgencyLogoFile
      && !signatory.agency_logo_url
      && !agencyLogoPreviewUrl
    ) {
      setMessage({ type: 'error', text: 'Upload the official partner agency logo.' });
      return;
    }
    
    setSaving(true);
    setMessage(null);

    try {
      const existingSignatory = selectedSignatoryId
        ? null
        : await fetchExistingSignatoryByName(signatory.name);

      if (existingSignatory) {
        setSelectedSignatoryId(existingSignatory.id);
        applySignatoryRow(existingSignatory);
        setMessage({
          type: 'success',
          text: 'Existing signatory found. Saved details and signature were loaded. Review the details, then save any changes.'
        });
        return;
      }

      let esigLink = signatory.esig_link;
      let agencyLogoUrl = isPartnerSignatoryView ? signatory.agency_logo_url : '';

      if (selectedSignatureFile) {
        const fileExtension = selectedSignatureFile.name.includes('.')
          ? selectedSignatureFile.name.split('.').pop()?.toLowerCase()
          : '';
        const filePath = `office-${selectedOfficeId}/esignature-${selectedOfficeId}-${Date.now()}${fileExtension ? `.${fileExtension}` : ''}`;

        const { error: uploadError } = await supabase.storage
          .from('esig')
          .upload(filePath, selectedSignatureFile, {
            cacheControl: '3600',
            upsert: true,
            contentType: selectedSignatureFile.type
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('esig')
          .getPublicUrl(filePath);

        esigLink = publicUrlData.publicUrl;
      }

      if (isPartnerSignatoryView && selectedAgencyLogoFile) {
        const fileExtension = selectedAgencyLogoFile.name.includes('.')
          ? selectedAgencyLogoFile.name.split('.').pop()?.toLowerCase()
          : '';
        const filePath = `office-${selectedOfficeId}/agency-logo-${selectedOfficeId}-${Date.now()}${fileExtension ? `.${fileExtension}` : ''}`;

        const { error: uploadError } = await supabase.storage
          .from('esig')
          .upload(filePath, selectedAgencyLogoFile, {
            cacheControl: '3600',
            upsert: true,
            contentType: selectedAgencyLogoFile.type
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('esig')
          .getPublicUrl(filePath);

        agencyLogoUrl = publicUrlData.publicUrl;
      }

      const shouldSetDefault = !isPartnerSignatoryView && (signatory.is_default || signatories.length === 0);

      if (shouldSetDefault) {
        const { error } = await supabase
          .from('tbl_signatory')
          .update({ is_default: false })
          .eq('office_id', selectedOfficeId)
          .eq('active', true);

        if (error) throw error;
      }

      const payload = {
        office_id: selectedOfficeId,
        label: signatory.label.trim() || null,
        name: signatory.name,
        position: signatory.position,
        esig_link: esigLink,
        agency_name: isPartnerSignatoryView ? signatory.agency_name.trim() : null,
        agency_logo_url: isPartnerSignatoryView ? agencyLogoUrl || null : null,
        header: isPartnerSignatoryView ? null : signatory.header.trim() || null,
        sub_header: isPartnerSignatoryView ? null : signatory.sub_header.trim() || null,
        address: isPartnerSignatoryView ? null : signatory.address.trim() || null,
        website: isPartnerSignatoryView ? null : signatory.website.trim() || null,
        footer: isPartnerSignatoryView ? null : signatory.footer.trim() || null,
        post_nominals: signatory.post_nominals.trim() || null,
        certificate_template_variant: signatory.certificate_template_variant,
        is_default: shouldSetDefault,
        active: true,
        sort_order: selectedSignatoryId
          ? signatories.find((item) => item.id === selectedSignatoryId)?.sort_order || 0
          : signatories.length
      };

      let savedSignatoryId = selectedSignatoryId;

      if (selectedSignatoryId) {
        const { error } = await supabase
          .from('tbl_signatory')
          .update({
            label: payload.label,
            name: payload.name,
            position: payload.position,
            esig_link: payload.esig_link,
            agency_name: payload.agency_name,
            agency_logo_url: payload.agency_logo_url,
            header: payload.header,
            sub_header: payload.sub_header,
            address: payload.address,
            website: payload.website,
            footer: payload.footer,
            post_nominals: payload.post_nominals,
            certificate_template_variant: payload.certificate_template_variant,
            is_default: payload.is_default,
            active: payload.active,
            sort_order: payload.sort_order
          })
          .eq('id', selectedSignatoryId);
          
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('tbl_signatory')
          .insert(payload)
          .select('id')
          .single();
          
        if (error) throw error;
        savedSignatoryId = inserted?.id || '';
      }

      setSignatory((prev) => ({ ...prev, esig_link: esigLink, agency_logo_url: agencyLogoUrl }));
      setSelectedSignatureFile(null);
      setSignaturePreviewUrl(esigLink);
      setSelectedAgencyLogoFile(null);
      setAgencyLogoPreviewUrl(agencyLogoUrl);
      setMessage({
        type: 'success',
        text: isPartnerSignatoryView
          ? 'Partner agency signatory saved successfully.'
          : 'Certificate signatory saved successfully.'
      });
      await fetchSignatories(selectedOfficeId, savedSignatoryId);
    } catch (err: any) {
      console.error('Error saving signatory:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && activeView !== 'appearance') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!canManageCertificateSettings && activeView !== 'appearance') {
    return (
      <div className="p-6 bg-card rounded-xl shadow-sm border border-slate-200">
        <p className="text-slate-500">You do not have permission to view this page.</p>
      </div>
    );
  }

  if (
    isOfficeManager
    && !user?.office_id
    && (activeView === 'signatories' || activeView === 'partner-signatories')
  ) {
    return (
      <div className="p-6 bg-card rounded-xl shadow-sm border border-slate-200">
        <p className="text-slate-500">Your account does not have an office assignment yet, so certificate settings cannot be managed.</p>
      </div>
    );
  }

  const selectedOffice = offices.find((office) => office.office_id === selectedOfficeId) || null;
  const previewSignatory = {
    name: signatory.name,
    position: signatory.position,
    esig_link: signaturePreviewUrl || signatory.esig_link,
    header: signatory.header,
    sub_header: signatory.sub_header,
    address: signatory.address,
    website: signatory.website,
    footer: signatory.footer,
    post_nominals: signatory.post_nominals,
    certificate_template_variant: signatory.certificate_template_variant
  };
  const certificatePreviewModalLayout = getCertificatePreviewModalLayout(
    previewViewport.width,
    previewViewport.height
  );

  const renderCertificatePreview = (scale: number) => {
    const previewWidthPx = CERTIFICATE_BASE_WIDTH_PX * scale;
    const previewHeightPx = CERTIFICATE_BASE_HEIGHT_PX * scale;

    return (
      <div
        className="mx-auto overflow-hidden rounded-[20px] border border-slate-200 bg-card shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)]"
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
    <div className="min-h-0 flex flex-col -m-4 h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)] p-4 md:py-8 md:px-12 lg:px-16">
      <div className="flex-1 min-h-0 bg-card rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {(activeView === 'signatories' || activeView === 'partner-signatories') && (
        <>
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  isPartnerSignatoryView
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {isPartnerSignatoryView ? <Handshake className="h-4 w-4" /> : <FileSignature className="h-4 w-4" />}
                </span>
                <h2 className="text-lg font-semibold text-slate-800">
                  {isPartnerSignatoryView ? 'Partner Agency Signatories' : 'Certificate Signatories'}
                </h2>
                {selectedOffice && (
                  <span className="inline-flex max-w-full items-center truncate rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    {selectedOffice.name}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {isPartnerSignatoryView
                  ? 'Manage external agency signers available to this office for joint Certificates of Participation.'
                  : 'Configure the office signers used for certificates and official certificate branding.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {!isPartnerSignatoryView && (
                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(true)}
                  disabled={!selectedOfficeId}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-card px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Eye className="h-4 w-4" />
                  Show Template Preview
                </button>
              )}

              <button
                type="submit"
                form="certificate-signatory-form"
                disabled={saving || !selectedOfficeId}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isPartnerSignatoryView ? 'Save Partner Signatory' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        <form id="certificate-signatory-form" onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4">
            <div className="space-y-4">
              {message && (
                <div
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
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

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.68fr)]">
                <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {isPartnerSignatoryView ? 'Managing Office and Partner Signatory' : 'Office and Signatory'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {isPartnerSignatoryView
                        ? 'Assign the external signer to the DILG office that is allowed to use this partnership.'
                        : 'Manage the signer identity shown at the bottom of the certificate.'}
                    </p>
                  </div>

                  <div className="grid gap-2.5 md:grid-cols-2">
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700">Select Office</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                          <Building2 className="h-4 w-4 text-slate-400" />
                        </div>
                        <select
                          value={selectedOfficeId}
                          onChange={(e) => setSelectedOfficeId(e.target.value ? Number(e.target.value) : '')}
                          disabled={!isAdmin}
                          className="w-full appearance-none rounded-lg border border-slate-300 bg-card py-2 pl-9 pr-4 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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

                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700">
                        {isPartnerSignatoryView ? 'Select Partner Signatory' : 'Select Signatory'}
                      </label>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <select
                          value={selectedSignatoryId}
                          onChange={(e) => handleSelectSignatory(e.target.value ? Number(e.target.value) : '')}
                          disabled={!selectedOfficeId || signatories.length === 0}
                          className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {signatories.length === 0 ? (
                            <option value="">
                              {isPartnerSignatoryView ? 'No partner signatories yet' : 'No signatories yet'}
                            </option>
                          ) : (
                            signatories.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label || item.name}
                                {isPartnerSignatoryView && item.agency_name ? ` — ${item.agency_name}` : ''}
                                {!isPartnerSignatoryView && item.is_default ? ' (Default)' : ''}
                              </option>
                            ))
                          )}
                        </select>

                        <button
                          type="button"
                          onClick={handleAddSignatory}
                          disabled={!selectedOfficeId}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <Plus className="h-4 w-4" />
                          New
                        </button>

                        <button
                          type="button"
                          onClick={handleDeactivateSignatory}
                          disabled={!selectedOfficeId || saving || (!selectedSignatoryId && signatories.length === 0)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className={`space-y-1 ${isPartnerSignatoryView ? 'md:col-span-2' : ''}`}>
                      <label className="block text-xs font-medium text-slate-700">Label</label>
                      <input
                        type="text"
                        disabled={!selectedOfficeId}
                        value={signatory.label}
                        onChange={(e) => setSignatory({ ...signatory, label: e.target.value })}
                        placeholder="e.g. Regional Director"
                        className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    {!isPartnerSignatoryView && (
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-card px-3 py-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={signatory.is_default || signatories.length === 0}
                          disabled={!selectedOfficeId || signatories.length === 0}
                          onChange={(e) => setSignatory({ ...signatory, is_default: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <Star className="h-4 w-4 text-amber-500" />
                        Default
                      </label>
                    )}

                    <div className={`space-y-1 ${isPartnerSignatoryView ? 'md:col-span-2' : ''}`}>
                      <label className="block text-xs font-medium text-slate-700">Name</label>
                      <input
                        type="text"
                        required
                        disabled={!selectedOfficeId}
                        value={signatory.name}
                        onChange={(e) => handleSignatoryNameChange(e.target.value)}
                        placeholder="e.g. Bruce A. Colao"
                        className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div className={`space-y-1 ${isPartnerSignatoryView ? 'order-[6]' : ''}`}>
                      <label className="block text-xs font-medium text-slate-700">Post Nominals</label>
                      <input
                        type="text"
                        disabled={!selectedOfficeId}
                        value={signatory.post_nominals}
                        onChange={(e) => setSignatory({ ...signatory, post_nominals: e.target.value })}
                        placeholder="e.g. CESO V"
                        className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div className={`space-y-1 ${isPartnerSignatoryView ? 'order-[5]' : 'md:col-span-2'}`}>
                      <label className="block text-xs font-medium text-slate-700">Position</label>
                      <input
                        type="text"
                        required
                        disabled={!selectedOfficeId}
                        value={signatory.position}
                        onChange={(e) => setSignatory({ ...signatory, position: e.target.value })}
                        placeholder="e.g. Regional Director"
                        className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-card p-3">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-slate-800">Signature Image</h3>
                    <p className="mt-1 text-xs text-slate-500">Upload a transparent PNG for the cleanest printed result.</p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <label className={`flex w-full items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-slate-600 transition-colors ${
                        selectedOfficeId ? 'cursor-pointer bg-slate-50 hover:bg-slate-100' : 'cursor-not-allowed bg-slate-100'
                      }`}>
                        <Upload className="h-4 w-4" />
                        <span className="truncate text-sm font-medium">
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

                      <button
                        type="button"
                        onClick={handleRemoveSignature}
                        disabled={!selectedOfficeId || (!signaturePreviewUrl && !signatory.esig_link && !selectedSignatureFile)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sm:hidden lg:inline">Remove Signature</span>
                      </button>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <p className="mb-2 text-xs font-medium text-slate-700">
                        {signaturePreviewUrl
                          ? selectedSignatureFile
                            ? 'Signature Preview'
                            : 'Current E-Signature'
                          : 'Signature Preview'}
                      </p>
                      <div className="flex h-24 items-center justify-center rounded-lg bg-card px-4">
                        {signaturePreviewUrl ? (
                          <img
                            src={signaturePreviewUrl}
                            alt="Signatory e-signature"
                            className="max-h-16 max-w-full object-contain"
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
                </section>
              </div>

              {isPartnerSignatoryView && (
              <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-800">Partner Agency Details</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Required. These verified details appear only when this person is selected as the second signatory on a Certificate of Participation.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700">Agency Name</label>
                    <input
                      type="text"
                      required
                      disabled={!selectedOfficeId}
                      value={signatory.agency_name}
                      onChange={(e) => setSignatory({ ...signatory, agency_name: e.target.value })}
                      placeholder="e.g. DEPARTMENT OF JUSTICE REGION X"
                      className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <p className="text-xs text-slate-500">Displayed below “in partnership with” when this partner signatory is selected.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-700">Agency Logo</label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors ${
                        selectedOfficeId ? 'cursor-pointer bg-slate-50 hover:bg-slate-100' : 'cursor-not-allowed bg-slate-100'
                      }`}>
                        <Upload className="h-4 w-4" />
                        <span className="truncate">{selectedAgencyLogoFile?.name || 'Upload agency logo'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleAgencyLogoChange}
                          disabled={!selectedOfficeId}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleRemoveAgencyLogo}
                        disabled={!selectedOfficeId || (!agencyLogoPreviewUrl && !signatory.agency_logo_url && !selectedAgencyLogoFile)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                    <div className="flex h-24 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4">
                      {agencyLogoPreviewUrl ? (
                        <img
                          src={agencyLogoPreviewUrl}
                          alt="Partner agency logo preview"
                          className="max-h-16 max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <p className="text-center text-xs text-slate-500">No agency logo uploaded.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
              )}

              {!isPartnerSignatoryView && (
              <section className="rounded-lg border border-slate-200 bg-card p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-800">Certificate Header and Footer Content</h3>
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  <div className="space-y-1.5 lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Header</label>
                    <input
                      type="text"
                      disabled={!selectedOfficeId}
                      value={signatory.header}
                      onChange={(e) => setSignatory({ ...signatory, header: e.target.value })}
                      placeholder="e.g. REGION X - NORTHERN MINDANAO"
                      className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Sub Header</label>
                    <input
                      type="text"
                      disabled={!selectedOfficeId}
                      value={signatory.sub_header}
                      onChange={(e) => setSignatory({ ...signatory, sub_header: e.target.value })}
                      placeholder="Optional line above Certificate of Appearance"
                      className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Address</label>
                    <input
                      type="text"
                      disabled={!selectedOfficeId}
                      value={signatory.address}
                      onChange={(e) => setSignatory({ ...signatory, address: e.target.value })}
                      placeholder="e.g. Km 3 Fr. W.F. Masterson Avenue, Upper Carmen, Cagayan de Oro City"
                      className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Website</label>
                    <input
                      type="text"
                      disabled={!selectedOfficeId}
                      value={signatory.website}
                      onChange={(e) => setSignatory({ ...signatory, website: e.target.value })}
                      placeholder="e.g. www.region10.dilg.gov.ph"
                      className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1.5 lg:col-span-4">
                    <label className="block text-xs font-medium text-slate-700">Footer</label>
                    <textarea
                      rows={2}
                      disabled={!selectedOfficeId}
                      value={signatory.footer}
                      onChange={(e) => setSignatory({ ...signatory, footer: e.target.value })}
                      placeholder="e.g. T: (088) 859-4181 E: records.dilg10@gmail.com FB: www.facebook.com/DILGX"
                      className="w-full min-w-0 rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>
              </section>
              )}
            </div>
          </div>
        </form>
        </>
        )}

        {/* Announcements view - Admin Only */}
        {isAdmin && activeView === 'announcements' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <AnnouncementManagement />
          </div>
        )}

        {/* Appearance view - UI design templates */}
        {activeView === 'appearance' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <AppearanceSettings />
          </div>
        )}
      </div>

      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 lg:p-4">
          <button
            type="button"
            aria-label="Close certificate preview"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsPreviewModalOpen(false)}
          />

          <div
            className="relative z-10 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-[24px] bg-card shadow-2xl sm:rounded-[28px]"
            style={{ maxWidth: `${certificatePreviewModalLayout.modalMaxWidth}px` }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-3 py-3 sm:px-4 lg:px-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 sm:text-base">Certificate Preview</h3>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  Reviewing {selectedOffice?.name || 'the selected office'} using the current signatory and signature.
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

            <div className="min-h-0 overflow-auto no-scrollbar bg-slate-100 p-2 sm:p-3 lg:p-4">
              <div className="min-w-fit mx-auto">
                {renderCertificatePreview(certificatePreviewModalLayout.scale)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
