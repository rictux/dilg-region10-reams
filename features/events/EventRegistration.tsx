
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant, RefLocation } from '../../types/database';
import { DelegateChoice, delegateTypeFromChoice } from '../../lib/delegates';
import QRCode from 'react-qr-code';
import { CheckCircle, Calendar, MapPin, User, Mail, Briefcase, Building, Loader2, Phone, Heart, Users, Home, AlertCircle, Lock, Landmark, Download, Info, Gift, Star, UserCheck, Upload } from 'lucide-react';
import { eachDayOfInterval, format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import QrScanner, { decodeQrFromFile } from './QrScanner';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';
import { formatSuffix, toProperCase } from '../../lib/participantName';

type ParticipantMatch = Pick<Participant, 'participant_id' | 'participant_code'> & Partial<Pick<Participant, 'full_name' | 'f_name' | 'l_name' | 'm_initial' | 'suffix' | 'email' | 'mobile_no' | 'office' | 'position'>> & {
  participatedEventsCount?: number;
};

const getDateRangeOptions = (start?: string, end?: string) => {
  if (!start) return [] as string[];

  try {
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;
    if (startDate > endDate) {
      return [format(startDate, 'yyyy-MM-dd')];
    }

    return eachDayOfInterval({ start: startDate, end: endDate }).map((date) => format(date, 'yyyy-MM-dd'));
  } catch {
    return [start];
  }
};

const formatAccommodationDateLabel = (value: string) => {
  try {
    return format(parseISO(value), 'EEE, MMM d, yyyy');
  } catch {
    return value;
  }
};

const isValidEmailAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const AGE_GROUP_OPTIONS = ['Under 18', '18-24', '25-34', '35-44', '45-54', '55-65', '65+'] as const;

const normalizeAgeGroup = (value?: string | null) =>
  AGE_GROUP_OPTIONS.some((option) => option === value) ? value! : '';

const RequiredMark = () => (
  <>
    <span className="text-red-500" aria-hidden="true"> *</span>
    <span className="sr-only"> (required)</span>
  </>
);

const EventRegistration: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [decodingQrFile, setDecodingQrFile] = useState(false);
  const [showMatchPrompt, setShowMatchPrompt] = useState(false);
  const [potentialMatches, setPotentialMatches] = useState<ParticipantMatch[]>([]);
  const [inlineMatches, setInlineMatches] = useState<ParticipantMatch[]>([]);
  const [inlineMatchDismissed, setInlineMatchDismissed] = useState(false);
  const [inlineLookupLoading, setInlineLookupLoading] = useState(false);
  const [applyingExistingRecord, setApplyingExistingRecord] = useState(false);
  const [revealEmail, setRevealEmail] = useState(false);
  const [revealMobile, setRevealMobile] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [showEmailInfo, setShowEmailInfo] = useState(false);
  
  // Ref for saving image
  const ticketRef = useRef<HTMLDivElement>(null);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Location / Office State
  const [locations, setLocations] = useState<RefLocation[]>([]);
  const [affiliationType, setAffiliationType] = useState<'Office' | 'LGU'>('Office');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  // Consent State
  const [consent, setConsent] = useState(false);

  const formatEventDate = (start: string, end: string) => {
    if (!start) return 'TBD';
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;

    if (start === end) {
        return format(startDate, 'MMMM d, yyyy');
    }

    if (isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMMM d')} - ${format(endDate, 'd, yyyy')}`;
    }

    if (!isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;
    }

    return `${format(startDate, 'MMMM d, yyyy')} - ${format(endDate, 'MMMM d, yyyy')}`;
  };

  const [formData, setFormData] = useState({
    f_name: '',
    l_name: '',
    m_initial: '',
    suffix: '',
    full_name: '', // We'll keep this to store the returned full_name from backend
    email: '',
    gender: '',
    position: '',
    office: '',
    mobile_no: '',
    age_group: '',
    pwd: 'No',
    indigenous_people: 'No',
    role: 'Delegate',
    delegate_type: '' as '' | DelegateChoice,
    needs_accommodation: false,
    accommodation_pax: 0,
    date_accommodation: [] as string[],
    location_id: null as number | null,
    accept_photo_video: false,
    store_to_db: false,
    need_ca: false,
    participant_code: '',
    giveaway_selections: {} as Record<string, string | boolean>
  });

  const emailValidationMessage = !emailTouched
    ? null
    : formData.email.trim() && !isValidEmailAddress(formData.email.trim())
      ? 'Enter a valid address, such as name@example.com, or leave this blank.'
      : null;

  const getEventAccommodationDates = () => {
    if (!event?.has_accommodation) return [] as string[];
    const savedDates = (event.dates_with_accom || []).filter(Boolean);
    return savedDates.length > 0 ? savedDates : getDateRangeOptions(event.start_date, event.end_date);
  };

  const toggleAccommodation = (enabled: boolean) => {
    const availableDates = getEventAccommodationDates();
    const nextDates = enabled ? availableDates : [];

    setFormData((prev) => ({
      ...prev,
      needs_accommodation: enabled,
      accommodation_pax: enabled ? 1 : 0,
      date_accommodation: nextDates
    }));
  };

  const setGiveawaySelection = (key: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      giveaway_selections: { ...prev.giveaway_selections, [key]: value }
    }));
  };

  const toggleAccommodationDate = (date: string) => {
    setFormData((prev) => {
      const nextDates = prev.date_accommodation.includes(date)
        ? prev.date_accommodation.filter((value) => value !== date)
        : [...prev.date_accommodation, date];

      return {
        ...prev,
        date_accommodation: nextDates
      };
    });
  };

  useEffect(() => {
    fetchEventDetails();
    fetchLocations();
  }, [eventId]);

  const fetchEventDetails = async () => {
    if (!eventId) return;
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('event_id', parseInt(eventId))
      .is('deleted_at', null)
      .single();
    
    if (error || !data) {
      setError("Event not found or has been cancelled.");
    } else {
      setEvent(data);
    }
    setLoading(false);
  };

  const fetchLocations = async () => {
    const { data } = await supabase
        .from('ref_locations')
        .select('*')
        .order('province_huc', { ascending: true })
        .order('city_mun', { ascending: true });
    
    if (data) {
        setLocations(data);
    }
  };

  const normalizeNamePart = (value: string) => value.trim().toLowerCase();

  // Hyphenated married surnames (e.g. "Cruz-Santos") should match records stored
  // under either segment ("Cruz" or "Santos") and vice versa.
  const splitLastNameSegments = (value: string) =>
    normalizeNamePart(value)
      .split('-')
      .map((segment) => segment.trim())
      .filter(Boolean);

  const lastNamesShareSegment = (a: string, b: string) => {
    const aSegments = splitLastNameSegments(a);
    const bSegments = splitLastNameSegments(b);
    return aSegments.some((segment) => bSegments.includes(segment));
  };

  const closeMatchPrompt = () => {
    setShowMatchPrompt(false);
    setPotentialMatches([]);
  };

  const maskEmail = (value?: string | null) => {
    if (!value) return '';
    const [localPart, domain] = value.split('@');
    if (!localPart || !domain) return value;
    if (localPart.length <= 3) {
      return `${localPart.charAt(0)}***${localPart.slice(-Math.min(2, Math.max(localPart.length - 1, 0)))}@${domain}`;
    }
    const stars = '*'.repeat(Math.max(localPart.length - 3, 3));
    return `${localPart.charAt(0)}${stars}${localPart.slice(-2)}@${domain}`;
  };

  const maskMobile = (value?: string | null) => {
    if (!value) return '';
    if (value.length <= 5) {
      return `${value.slice(0, 1)}***${value.slice(-Math.min(3, Math.max(value.length - 1, 0)))}`;
    }
    const stars = '*'.repeat(Math.max(value.length - 5, 3));
    return `${value.slice(0, 2)}${stars}${value.slice(-3)}`;
  };

  const getParticipantDisplayName = (match: ParticipantMatch) => {
    const parts = [
      match.f_name || '',
      match.m_initial ? `${match.m_initial}` : '',
      match.l_name || '',
      match.suffix || ''
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' ');
    }

    return match.full_name || 'Unknown Participant';
  };

  const renderPotentialMatchCard = (match: ParticipantMatch, action?: React.ReactNode) => (
    <div key={match.participant_id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div>
        <p className="text-base font-bold text-slate-900">{getParticipantDisplayName(match)}</p>
        <p className="text-sm text-slate-600 mt-2">Participated Events: <span className="font-medium">{match.participatedEventsCount ?? 0}</span></p>
        {match.office && <p className="text-sm text-slate-600 mt-2">Office: <span className="font-medium">{match.office}</span></p>}
        {match.position && <p className="text-sm text-slate-600 mt-1">Position: <span className="font-medium">{match.position}</span></p>}
        <p className="text-sm text-slate-600 mt-1">Mobile No: <span className="font-medium">{match.mobile_no ? maskMobile(match.mobile_no) : '-'}</span></p>
        <p className="text-sm text-slate-600 mt-1">Email: <span className="font-medium">{match.email ? maskEmail(match.email) : '-'}</span></p>
      </div>
      {action}
    </div>
  );

  const attachParticipationCounts = async (matches: ParticipantMatch[]) => {
    if (matches.length === 0) return matches;

    const participantIds = matches.map((match) => match.participant_id);
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('participant_id, event_id')
      .in('participant_id', participantIds)
      .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES]);

    if (error) throw error;

    const countsByParticipant = new Map<number, Set<number>>();
    (data || []).forEach((record) => {
      if (!countsByParticipant.has(record.participant_id)) {
        countsByParticipant.set(record.participant_id, new Set<number>());
      }
      countsByParticipant.get(record.participant_id)?.add(record.event_id);
    });

    return matches.map((match) => ({
      ...match,
      participatedEventsCount: countsByParticipant.get(match.participant_id)?.size || 0
    }));
  };

  const getSubmissionContext = () => {
    if (!consent) {
      setError("You must accept the Data Privacy consent to proceed.");
      return null;
    }

    if (formData.gender !== 'Male' && formData.gender !== 'Female') {
      setError("Please select a gender (Male or Female).");
      return null;
    }

    if (!AGE_GROUP_OPTIONS.some((option) => option === formData.age_group)) {
      setError("Please select your age group.");
      return null;
    }

    if (event?.has_principal_delegates && !formData.delegate_type) {
      setError("Please select whether you are attending as the Principal, as a Representative, or as an Attendee.");
      return null;
    }

    const normalizedEmail = formData.email.trim().toLowerCase();
    if (normalizedEmail && !isValidEmailAddress(normalizedEmail)) {
      setEmailTouched(true);
      setError("Please enter a valid email address, or leave the email field blank.");
      return null;
    }

    if (formData.needs_accommodation && formData.accommodation_pax < 1) {
      setError("Please specify at least 1 pax for accommodation.");
      return null;
    }

    const availableAccommodationDates = getEventAccommodationDates();
    const normalizedAccommodationDates = formData.needs_accommodation && event?.has_accommodation
      ? (() => {
          const selectedDates = (formData.date_accommodation || []).filter((date) => availableAccommodationDates.includes(date));
          if (selectedDates.length > 0) return selectedDates;
          if (availableAccommodationDates.length === 1) return [availableAccommodationDates[0]];
          return [];
        })()
      : [];

    if (formData.needs_accommodation && event?.has_accommodation && normalizedAccommodationDates.length === 0) {
      setError("Please select at least one accommodation date.");
      return null;
    }

    let finalLocationId = null as number | null;
    let finalOfficeName = formData.office;

    if (affiliationType === 'LGU') {
      if (!selectedProvince) {
        setError("Please select a Province/HUC for LGU.");
        return null;
      }
      
      if (selectedCity) {
        const loc = locations.find(l => l.province_huc === selectedProvince && l.city_mun === selectedCity);
        if (loc) {
          finalLocationId = loc.location_id;
          finalOfficeName = `LGU ${selectedCity}, ${selectedProvince}`;
        } else {
          setError("Selected location is invalid.");
          return null;
        }
      } else {
        const loc = locations.find(l => l.province_huc === selectedProvince && !l.city_mun);
        if (loc) {
          finalLocationId = loc.location_id;
        }
        if (selectedProvince.toLowerCase().includes('city')) {
          finalOfficeName = `LGU ${selectedProvince}`;
        } else {
          finalOfficeName = `Provincial Gov't of ${selectedProvince}`;
        }
      }
    } else if (!formData.office.trim()) {
      setError("Please enter your Office / Agency name.");
      return null;
    }

    const suffixTrimmed = formData.suffix.trim().toLowerCase();
    if (suffixTrimmed && ['none', 'n/a', 'na'].includes(suffixTrimmed)) {
      setError("Not a valid Suffix.");
      return null;
    }

    // Giveaways: validate required selections and keep only answers for items this event defines.
    // When giveaway selection is closed, skip required checks — registrants can't choose anymore.
    const giveawaysClosed = event?.giveaways_open === false;
    const eventGiveaways = event?.giveaways || [];
    const normalizedGiveawaySelections: Record<string, string | boolean> = {};
    for (const item of eventGiveaways) {
      const value = formData.giveaway_selections[item.key];
      if (item.type === 'single-select') {
        if (item.required && !value && !giveawaysClosed) {
          setError(`Please select ${item.label}.`);
          return null;
        }
        if (value) normalizedGiveawaySelections[item.key] = value;
      } else if (item.type === 'boolean') {
        normalizedGiveawaySelections[item.key] = !!value;
      }
    }

    return {
      finalLocationId,
      finalOfficeName,
      finalEmail: normalizedEmail || null,
      finalMobile: formData.mobile_no.trim() === '' ? null : formData.mobile_no.trim(),
      normalizedAccommodationDates,
      normalizedGiveawaySelections
    };
  };

  const findPotentialNameMatches = async () => {
    const normalizedFirstName = normalizeNamePart(formData.f_name);
    const normalizedLastName = normalizeNamePart(formData.l_name);

    if (!normalizedFirstName || !normalizedLastName) {
      return [];
    }

    const lastNameSegments = splitLastNameSegments(formData.l_name)
      .map((segment) => segment.replace(/[(),]/g, ''))
      .filter(Boolean);

    if (lastNameSegments.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from('participants')
      .select('participant_id, participant_code, full_name, f_name, l_name, m_initial, suffix, email, mobile_no, office, position')
      .ilike('f_name', formData.f_name.trim())
      .or(lastNameSegments.map((segment) => `l_name.ilike.%${segment}%`).join(','))
      .limit(25);

    if (error) throw error;

    const baseMatches = (data || []).filter((participant) =>
      normalizeNamePart(participant.f_name || '') === normalizedFirstName &&
      (normalizeNamePart(participant.l_name || '') === normalizedLastName ||
        lastNamesShareSegment(participant.l_name || '', formData.l_name))
    );

    // Exact last-name matches appear before hyphen-segment matches.
    baseMatches.sort((a, b) => {
      const aExact = normalizeNamePart(a.l_name || '') === normalizedLastName ? 0 : 1;
      const bExact = normalizeNamePart(b.l_name || '') === normalizedLastName ? 0 : 1;
      return aExact - bExact;
    });

    return attachParticipationCounts(baseMatches);
  };

  useEffect(() => {
    const f = formData.f_name.trim();
    const l = formData.l_name.trim();

    if (formData.participant_code) {
      setInlineMatches([]);
      return;
    }

    if (!f || !l) {
      setInlineMatches([]);
      return;
    }

    setInlineMatchDismissed(false);

    const handle = setTimeout(async () => {
      setInlineLookupLoading(true);
      try {
        const matches = await findPotentialNameMatches();
        setInlineMatches(matches);
      } catch (err) {
        console.error('Name lookup failed', err);
      } finally {
        setInlineLookupLoading(false);
      }
    }, 600);

    return () => clearTimeout(handle);
  }, [formData.f_name, formData.l_name, formData.participant_code]);

  const dismissInlineMatch = () => {
    setInlineMatches([]);
    setInlineMatchDismissed(true);
  };

  const applyExistingRecord = async (match: ParticipantMatch) => {
    setApplyingExistingRecord(true);
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('participant_id', match.participant_id)
        .single();

      if (error || !data) {
        toast.error('Failed to load record. Please try again.');
        return;
      }

      setFormData((prev: typeof formData) => ({
        ...prev,
        f_name: data.f_name || '',
        l_name: data.l_name || '',
        m_initial: data.m_initial || '',
        suffix: data.suffix || '',
        full_name: data.full_name || '',
        email: data.email || '',
        gender: data.gender || '',
        position: data.position || '',
        office: data.office || '',
        mobile_no: data.mobile_no || '',
        age_group: normalizeAgeGroup(data.age_group),
        pwd: data.pwd || 'No',
        indigenous_people: data.indigenous_people || 'No',
        location_id: data.location_id,
        participant_code: data.participant_code || ''
      }));

      if (data.location_id) {
        const loc = locations.find((l: RefLocation) => l.location_id === data.location_id);
        if (loc) {
          setAffiliationType('LGU');
          setSelectedProvince(loc.province_huc);
          setSelectedCity(loc.city_mun || '');
        } else {
          setAffiliationType('Office');
        }
      } else {
        setAffiliationType('Office');
      }

      setInlineMatches([]);
      setInlineMatchDismissed(true);
      setRevealEmail(false);
      setRevealMobile(false);
      toast.success('Existing record loaded. Review your details and complete registration.');
    } catch (err) {
      console.error('Failed to apply existing record', err);
      toast.error('Failed to load record. Please try again.');
    } finally {
      setApplyingExistingRecord(false);
    }
  };

  const processRegistration = async (options?: { existingUser?: ParticipantMatch | null; skipPotentialMatch?: boolean }) => {
    const submissionContext = getSubmissionContext();
    if (!submissionContext) return;

    setSubmitting(true);
    setError(null);
    setAlreadyRegistered(false);

    try {
      if (!event) throw new Error("Event not loaded");
      if (!event.registration_open) throw new Error("Registration for this event is closed.");

      const id = parseInt(eventId!);
      const { finalLocationId, finalOfficeName, finalEmail, finalMobile, normalizedAccommodationDates, normalizedGiveawaySelections } = submissionContext;

      let participantId: number;
      let finalParticipantCode = '';
      let existingUser = options?.existingUser || null;

      if (!existingUser && formData.participant_code) {
        const { data } = await supabase
          .from('participants')
          .select('participant_id, participant_code')
          .eq('participant_code', formData.participant_code)
          .limit(1)
          .maybeSingle();
        existingUser = data;
      }

      if (!existingUser && finalEmail) {
        const { data } = await supabase
          .from('participants')
          .select('participant_id, participant_code')
          .eq('email', finalEmail)
          .limit(1)
          .maybeSingle();
        existingUser = data;
      }

      if (!existingUser && finalMobile) {
        const { data } = await supabase
          .from('participants')
          .select('participant_id, participant_code')
          .eq('mobile_no', finalMobile)
          .limit(1)
          .maybeSingle();
        existingUser = data;
      }

      if (!existingUser && !options?.skipPotentialMatch) {
        const matches = await findPotentialNameMatches();
        if (matches.length > 0) {
          setPotentialMatches(matches);
          setShowMatchPrompt(true);
          return;
        }
      }

      if (existingUser) {
        participantId = existingUser.participant_id;
        finalParticipantCode = existingUser.participant_code;

        const { data: updatedUser, error: updateError } = await supabase
          .from('participants')
          .update({
            f_name: toProperCase(formData.f_name.trim()),
            l_name: toProperCase(formData.l_name.trim()),
            m_initial: formData.m_initial.trim() === '' ? null : formData.m_initial.trim().toUpperCase(),
            suffix: formData.suffix.trim() === '' ? null : formatSuffix(formData.suffix.trim()),
            email: finalEmail,
            gender: formData.gender,
            position: formData.position,
            office: finalOfficeName,
            location_id: finalLocationId,
            mobile_no: finalMobile,
            age_group: formData.age_group,
            pwd: formData.pwd,
            indigenous_people: formData.indigenous_people
          })
          .eq('participant_id', participantId)
          .select()
          .single();

        if (updateError) throw updateError;
        setFormData((prev) => ({ ...prev, full_name: updatedUser.full_name || '' }));
      } else {
        const { data: newUser, error: createError } = await supabase
          .from('participants')
          .insert([{
            f_name: toProperCase(formData.f_name.trim()),
            l_name: toProperCase(formData.l_name.trim()),
            m_initial: formData.m_initial.trim() === '' ? null : formData.m_initial.trim().toUpperCase(),
            suffix: formData.suffix.trim() === '' ? null : formatSuffix(formData.suffix.trim()),
            email: finalEmail,
            mobile_no: finalMobile,
            gender: formData.gender,
            position: formData.position,
            office: finalOfficeName,
            location_id: finalLocationId,
            age_group: formData.age_group,
            pwd: formData.pwd,
            indigenous_people: formData.indigenous_people
          }])
          .select()
          .single();

        if (createError) throw createError;
        participantId = newUser.participant_id;
        finalParticipantCode = newUser.participant_code;
        setFormData((prev) => ({ ...prev, full_name: newUser.full_name || '' }));
      }

      const { error: regError } = await supabase
        .from('event_participants')
        .insert({
          event_id: id,
          participant_id: participantId,
          registration_status: 'Registered',
          role: 'Delegate',
          // 'Attendee' is a UI-only answer meaning "neither", so it collapses to NULL.
          delegate_type: event.has_principal_delegates ? delegateTypeFromChoice(formData.delegate_type) : null,
          needs_accommodation: formData.needs_accommodation,
          accommodation_pax: formData.needs_accommodation ? formData.accommodation_pax : 0,
          date_accommodation: formData.needs_accommodation && event.has_accommodation ? normalizedAccommodationDates : null,
          accept_photo_video: formData.accept_photo_video,
          store_to_db: formData.store_to_db,
          need_ca: formData.need_ca,
          giveaway_selections: normalizedGiveawaySelections
        });

      if (regError) {
        if (regError.code === '23505') {
          setAlreadyRegistered(true);
        } else {
          throw regError;
        }
      }

      // Event-level auto-attendance applies only to this public registration
      // flow. The database function revalidates the event date, setting, recent
      // registration, and participant code before it writes an attendance log.
      if (!regError && event.auto_attendance_on_registration) {
        const { data: loggedSession, error: attendanceError } = await supabase.rpc(
          'log_public_event_registration_attendance',
          {
            p_event_id: id,
            p_participant_code: finalParticipantCode
          }
        );

        if (attendanceError) {
          console.error('Event Registration auto-attendance failed', attendanceError);
          toast.error('Registration completed, but attendance could not be logged. Please contact the event organizer.');
        } else if (loggedSession === 'AM' || loggedSession === 'PM') {
          toast.success(`${loggedSession} attendance logged for today.`);
        }
      }

      closeMatchPrompt();
      setQrToken(finalParticipantCode);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQrScanSuccess = async (decodedText: string) => {
    setShowQrScanner(false);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('participant_code', decodedText)
        .single();

      if (error || !data) {
        setError("QR Code invalid or participant not found.");
      } else {
        setFormData(prev => ({
          ...prev,
          f_name: data.f_name || '',
          l_name: data.l_name || '',
          m_initial: data.m_initial || '',
          suffix: data.suffix || '',
          email: data.email || '',
          gender: data.gender || '',
          position: data.position || '',
          office: data.office || '',
          mobile_no: data.mobile_no || '',
          age_group: normalizeAgeGroup(data.age_group),
          pwd: data.pwd || 'No',
          indigenous_people: data.indigenous_people || 'No',
          location_id: data.location_id,
          participant_code: data.participant_code || decodedText
        }));

        if (data.location_id) {
          const loc = locations.find(l => l.location_id === data.location_id);
          if (loc) {
            setAffiliationType('LGU');
            setSelectedProvince(loc.province_huc);
            setSelectedCity(loc.city_mun || '');
          } else {
            setAffiliationType('Office');
          }
        } else {
          setAffiliationType('Office');
        }
        setRevealEmail(false);
        setRevealMobile(false);
        setError(null);
      }
    } catch (err: any) {
      setError("Failed to fetch participant details.");
    } finally {
      setLoading(false);
    }
  };

  const handleQrFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires a change event.
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG) containing your QR code.');
      return;
    }

    setDecodingQrFile(true);
    setError(null);
    try {
      const decodedText = await decodeQrFromFile(file);
      setShowQrScanner(false);
      await handleQrScanSuccess(decodedText.trim());
    } catch (err) {
      console.error('Failed to decode QR image', err);
      setError('No QR code was found in that image. Please upload a clearer photo or screenshot of your QR code.');
    } finally {
      setDecodingQrFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const skipPotentialMatch = inlineMatchDismissed || inlineMatches.length > 0;
    await processRegistration({ skipPotentialMatch });
  };

  const handleDownload = async () => {
    if (!ticketRef.current) return;
    setIsDownloading(true);
    try {
        const dataUrl = await toPng(ticketRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
        
        const link = document.createElement('a');
        link.download = `${event?.event_name.substring(0, 20).replace(/\s+/g, '_')}_${formData.full_name.replace(/\s+/g, '_')}_Pass.png`;
        link.href = dataUrl;
        link.click();
    } catch (err) {
        console.error("Failed to save image", err);
        toast.error("Failed to save image. Please screenshot instead.");
    } finally {
        setIsDownloading(false);
    }
  };

  // Helper to get unique provinces
  const provinces = Array.from(new Set(locations.map(l => l.province_huc))).sort();
  
  // Helper to get cities based on selected province (Filter out nulls/empty)
  const cities = locations
    .filter(l => l.province_huc === selectedProvince && l.city_mun)
    .map(l => l.city_mun as string)
    .sort();

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
      );
  }

  if (!event) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
              <div className="bg-card p-8 rounded-xl shadow-md text-center max-w-md w-full">
                  <div className="text-red-500 mb-4 flex justify-center"><CheckCircle size={48} className="rotate-45" /></div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Event Not Found</h2>
                  <p className="text-slate-500">{error || "The event link might be invalid or expired."}</p>
              </div>
          </div>
      );
  }

  // Registration Closed Screen
  if (!event.registration_open) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
              <div className="bg-card p-8 rounded-xl shadow-md text-center max-w-md w-full border border-slate-100">
                  <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock size={32} className="text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Registration Closed</h2>
                  <p className="text-slate-500">
                      Registration for <strong className="text-slate-700">{event.event_name}</strong> is currently closed.
                  </p>
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="text-slate-400 text-xs uppercase font-medium mb-1">Contact Organizer</p>
                    <p className="text-indigo-600 font-medium text-sm">Please contact the event organizer for assistance.</p>
                  </div>
              </div>
          </div>
    );
  }

  if (success && qrToken) {
      return (
          <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex justify-center">
              <div className="max-w-md w-full bg-card rounded-2xl shadow-xl overflow-hidden">
                  <div className={`${alreadyRegistered ? 'bg-amber-500' : 'bg-green-600'} px-6 py-8 text-center text-white transition-colors`}>
                      <div className="flex justify-center mb-4">
                          <div className="bg-white/20 p-3 rounded-full">
                              {alreadyRegistered ? (
                                <Info size={48} className="text-white" />
                              ) : (
                                <CheckCircle size={48} className="text-white" />
                              )}
                          </div>
                      </div>
                      <h2 className="text-3xl font-bold mb-2">
                          {alreadyRegistered ? 'Already Registered' : 'Registration Confirmed!'}
                      </h2>
                      <p className={`${alreadyRegistered ? 'text-amber-100' : 'text-green-100'}`}>
                          {alreadyRegistered 
                            ? 'You are already on the list for:' 
                            : 'See you at'
                          } <br/>
                          <span className="font-semibold">{event.event_name}</span>
                      </p>
                  </div>
                  
                  <div className="p-8 flex flex-col items-center text-center">
                      <p className="text-slate-600 mb-6">
                          Please save this QR code. Present it at the venue entrance for attendance scanning.
                      </p>
                      
                      {/* Ticket / Pass Container for Image Generation */}
                      <div 
                        ref={ticketRef}
                        className="bg-card p-6 rounded-xl w-full border-2 border-slate-100"
                      >
                          <div className="border-4 border-[#111110] p-4 rounded-xl mb-4 bg-white inline-block">
                              <div className="relative inline-block">
                                  <QRCode value={qrToken} size={180} fgColor="#000000" bgColor="#FFFFFF" level="H" />
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-1">
                                      <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-11 h-11 object-contain rounded-full" />
                                  </div>
                              </div>
                          </div>

                          <div className="w-full text-center">
                              <p className="font-bold text-slate-900 text-xl">{formData.full_name}</p>
                              <p className="text-indigo-600 font-semibold">{formData.position}</p>
                              
                              <div className="mt-1 flex items-center justify-center gap-1.5 text-slate-500 text-sm">
                                 {affiliationType === 'LGU' ? <Landmark size={14} /> : <Building size={14} />}
                                 <span>
                                     {affiliationType === 'LGU' && selectedCity 
                                        ? `LGU ${selectedCity}, ${selectedProvince}`
                                        : affiliationType === 'LGU' && selectedProvince
                                        ? (selectedProvince.toLowerCase().includes('city') ? `LGU ${selectedProvince}` : `Provincial Gov't of ${selectedProvince}`)
                                        : formData.office
                                     }
                                 </span>
                              </div>
                              <p className="text-[10px] text-slate-300 font-mono mt-3 uppercase tracking-widest">{qrToken}</p>
                          </div>
                      </div>
                      
                      <button 
                        onClick={handleDownload} 
                        disabled={isDownloading}
                        className="mt-8 w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]"
                      >
                          {isDownloading ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                          {isDownloading ? 'Saving...' : 'Save QR Code'}
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <>
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 flex justify-center">
        <div className="max-w-3xl w-full bg-card rounded-2xl shadow-xl overflow-hidden border border-slate-100">
            {/* Event Header */}
            <div className="bg-sidebar p-6 sm:p-8 text-white relative overflow-hidden">
                {/* Grid texture */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                    }}
                />
                <div className="absolute -top-16 -right-16 w-56 h-56 bg-indigo-600/25 rounded-full blur-3xl pointer-events-none"></div>
                <div className="relative z-10">
                    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium mb-3 font-mono">
                        Registration Open
                    </span>
                    <h1 className="text-xl sm:text-2xl font-semibold leading-snug mb-3">{event.event_name}</h1>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-white/50 text-sm">
                        <div className="flex items-center gap-1.5">
                            <Calendar size={14} />
                            <span className="font-mono">{formatEventDate(event.start_date, event.end_date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <MapPin size={14} />
                            <span>{event.venue}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Form */}
            <div className="p-6 sm:p-8">
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded">
                        {error}
                    </div>
                )}
                
                <div className="mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-indigo-800">
                        <strong>Already have a QR code?</strong> Scan it or upload a saved image to quickly fill out this form.
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowQrScanner(!showQrScanner)}
                            className="whitespace-nowrap bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                            {showQrScanner ? 'Close Scanner' : 'Scan QR'}
                        </button>
                        <button
                            type="button"
                            onClick={() => qrFileInputRef.current?.click()}
                            disabled={decodingQrFile}
                            className="whitespace-nowrap bg-card border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors disabled:opacity-60 flex items-center gap-2"
                        >
                            {decodingQrFile ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                            {decodingQrFile ? 'Reading...' : 'Upload QR'}
                        </button>
                    </div>
                </div>

                <input
                    ref={qrFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleQrFileSelected}
                />
                
                <form onSubmit={handleSubmit} className="space-y-5">
                    
                    {/* SECTION: Personal Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b pb-2 mb-4">Personal Information</h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name<RequiredMark /></label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        required 
                                        type="text"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="First Name"
                                        value={formData.f_name}
                                        onChange={(e) => setFormData({ ...formData, f_name: e.target.value })}
                                        onBlur={(e) => setFormData({ ...formData, f_name: toProperCase(e.target.value) })}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name<RequiredMark /></label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input 
                                        required 
                                        type="text"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="Last Name"
                                        value={formData.l_name}
                                        onChange={(e) => setFormData({ ...formData, l_name: e.target.value })}
                                        onBlur={(e) => setFormData({ ...formData, l_name: toProperCase(e.target.value) })}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                        </div>

                        {inlineLookupLoading && inlineMatches.length === 0 && !inlineMatchDismissed && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 size={14} className="animate-spin" />
                                Checking for existing records...
                            </div>
                        )}

                        {inlineMatches.length > 0 && !inlineMatchDismissed && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-start gap-3">
                                    <Info className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-amber-900">
                                            {inlineMatches.length === 1
                                                ? 'We found an existing record matching your name'
                                                : `We found ${inlineMatches.length} existing records matching your name`}
                                        </p>
                                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                            Selecting an existing record will autofill the rest of the form. Sensitive details are partially hidden for your privacy.
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {inlineMatches.map((match) => (
                                        <div key={match.participant_id} className="bg-card border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <p className="text-sm font-bold text-slate-900">{getParticipantDisplayName(match)}</p>
                                                <p className="text-xs text-slate-500">
                                                    Past events: <span className="font-medium text-slate-700">{match.participatedEventsCount ?? 0}</span>
                                                    {match.position && <> · {match.position}</>}
                                                </p>
                                                {match.office && <p className="text-xs text-slate-500 truncate">{match.office}</p>}
                                                {match.email && <p className="text-xs text-slate-500 font-mono">{maskEmail(match.email)}</p>}
                                                {match.mobile_no && <p className="text-xs text-slate-500 font-mono">{maskMobile(match.mobile_no)}</p>}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => applyExistingRecord(match)}
                                                disabled={applyingExistingRecord}
                                                className="whitespace-nowrap bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {applyingExistingRecord && <Loader2 size={14} className="animate-spin" />}
                                                Use this record
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-3 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={dismissInlineMatch}
                                        className="text-xs font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
                                    >
                                        Not me, continue with new registration
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Middle Initial</label>
                                <input 
                                    type="text"
                                    maxLength={1}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="e.g. A"
                                    value={formData.m_initial}
                                    onChange={e => setFormData({...formData, m_initial: e.target.value.toUpperCase()})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Suffix (Jr, Sr, III)</label>
                                <input 
                                    type="text"
                                    maxLength={10}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="e.g. Jr (if none leave blank)"
                                    value={formData.suffix}
                                    onChange={e => setFormData({...formData, suffix: e.target.value})}
                                    onBlur={e => setFormData({...formData, suffix: formatSuffix(e.target.value)})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <label htmlFor="registration-email" className="block text-sm font-medium text-slate-700">
                                        Email Address
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowEmailInfo((visible) => !visible)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                                        aria-label={showEmailInfo ? 'Hide email information' : 'Why provide an email address?'}
                                        aria-expanded={showEmailInfo}
                                        aria-controls="registration-email-help"
                                        title="Why provide an email address?"
                                    >
                                        <Info size={17} aria-hidden="true" />
                                    </button>
                                </div>
                                <div className="relative">
                                    {showEmailInfo && (
                                        <div
                                            id="registration-email-help"
                                            role="tooltip"
                                            className="absolute bottom-full left-0 z-30 mb-2 w-full min-w-64 rounded-lg border border-indigo-100 bg-white px-3 py-2.5 shadow-xl ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 duration-150"
                                        >
                                            <span className="absolute -bottom-1.5 left-5 h-3 w-3 rotate-45 border-b border-r border-indigo-100 bg-white" aria-hidden="true" />
                                            <p className="relative flex items-start gap-2 text-xs leading-relaxed text-slate-700">
                                                <Mail size={15} className="mt-0.5 shrink-0 text-indigo-600" aria-hidden="true" />
                                                <span>
                                                    Provide a valid email to receive your Certificate of Appearance (if requested) and Certificate of Participation conveniently in your inbox. You may leave this blank if you prefer not to receive certificates by email.
                                                </span>
                                            </p>
                                        </div>
                                    )}
                                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input
                                        id="registration-email"
                                        type={!!formData.participant_code && !!formData.email && !revealEmail ? 'text' : 'email'}
                                        className={`w-full pl-10 ${!!formData.participant_code && !!formData.email && !revealEmail ? 'pr-16 bg-slate-50 text-slate-500 font-mono cursor-not-allowed' : 'pr-4'} py-2.5 border ${emailValidationMessage ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20'} rounded-lg focus:ring-2 outline-none transition-all`}
                                        placeholder="juandelacruz@gmail.com"
                                        value={!!formData.participant_code && !!formData.email && !revealEmail ? maskEmail(formData.email) : formData.email}
                                        onChange={e => {
                                            setFormData({...formData, email: e.target.value});
                                            if (emailTouched && (!e.target.value.trim() || isValidEmailAddress(e.target.value.trim()))) {
                                                setEmailTouched(false);
                                            }
                                        }}
                                        onFocus={() => setShowEmailInfo(true)}
                                        onBlur={() => {
                                            setEmailTouched(true);
                                            setShowEmailInfo(false);
                                        }}
                                        readOnly={!!formData.participant_code && !!formData.email && !revealEmail}
                                        autoComplete="email"
                                        inputMode="email"
                                        spellCheck={false}
                                        aria-invalid={!!emailValidationMessage}
                                        aria-describedby={[
                                            showEmailInfo ? 'registration-email-help' : '',
                                            emailValidationMessage ? 'registration-email-error' : ''
                                        ].filter(Boolean).join(' ') || undefined}
                                    />
                                    {!!formData.participant_code && !!formData.email && !revealEmail && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRevealEmail(true);
                                                setFormData({ ...formData, email: '' });
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                        >
                                            Edit
                                        </button>
                                    )}
                                </div>
                                {emailValidationMessage && (
                                    <p id="registration-email-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
                                        <AlertCircle size={14} aria-hidden="true" />
                                        {emailValidationMessage}
                                    </p>
                                )}
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mobile No.</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input
                                        type={!!formData.participant_code && !!formData.mobile_no && !revealMobile ? 'text' : 'tel'}
                                        className={`w-full pl-10 ${!!formData.participant_code && !!formData.mobile_no && !revealMobile ? 'pr-16 bg-slate-50 text-slate-500 font-mono cursor-not-allowed' : 'pr-4'} py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all`}
                                        placeholder="09123456789"
                                        value={!!formData.participant_code && !!formData.mobile_no && !revealMobile ? maskMobile(formData.mobile_no) : formData.mobile_no}
                                        onChange={e => setFormData({...formData, mobile_no: e.target.value.replace(/[^0-9]/g, '')})}
                                        maxLength={11}
                                        readOnly={!!formData.participant_code && !!formData.mobile_no && !revealMobile}
                                    />
                                    {!!formData.participant_code && !!formData.mobile_no && !revealMobile && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRevealMobile(true);
                                                setFormData({ ...formData, mobile_no: '' });
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                        >
                                            Edit
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender<RequiredMark /></label>
                                <select 
                                    required
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                    value={formData.gender}
                                    onChange={e => setFormData({...formData, gender: e.target.value})}
                                >
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">What age group do you belong?<RequiredMark /></label>
                                <select 
                                    required
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                    value={formData.age_group}
                                    onChange={e => setFormData({...formData, age_group: e.target.value})}
                                >
                                    <option value="" disabled>Select Age Group</option>
                                    {AGE_GROUP_OPTIONS.map((ageGroup) => (
                                        <option key={ageGroup} value={ageGroup}>{ageGroup}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* SECTION: Demographics */}
                    <div className="space-y-4">
                         <div className="space-y-4">
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5 leading-snug">
                                    Are you a person with disability (PWD), as defined under RA 7277 (Magna Carta for Persons with Disability)?
                                </label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                    value={formData.pwd}
                                    onChange={e => setFormData({...formData, pwd: e.target.value})}
                                >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5 leading-snug">
                                    Do you identify as a member of an Indigenous Cultural Community / Indigenous People (ICCs/IPs)?
                                </label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                    value={formData.indigenous_people}
                                    onChange={e => setFormData({...formData, indigenous_people: e.target.value})}
                                >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* SECTION: Professional Info */}
                    <div className="space-y-4">
                         <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b pb-2 mb-4 pt-4">Professional Details</h3>
                         
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Position / Title<RequiredMark /></label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input 
                                    required 
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                    placeholder="Manager"
                                    value={formData.position}
                                    onChange={e => setFormData({...formData, position: e.target.value})}
                                />
                            </div>
                        </div>

                        {/* Principal vs Representative — only for events that seat principals */}
                        {event.has_principal_delegates && (
                            <div className="pt-2">
                                <label className="block text-sm font-medium text-slate-700 mb-2">Are you attending as<RequiredMark /></label>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    {([
                                        { value: 'Principal' as DelegateChoice, icon: Star, title: 'Principal', hint: 'The official member invited to this event' },
                                        { value: 'Representative' as DelegateChoice, icon: UserCheck, title: 'Representative', hint: 'Authorized to attend on behalf of the principal' },
                                        { value: 'Attendee' as DelegateChoice, icon: Users, title: 'Attendee', hint: 'Attending as participant/observer' }
                                    ]).map(({ value, icon: Icon, title, hint }) => {
                                        const active = formData.delegate_type === value;
                                        return (
                                            <label
                                                key={value}
                                                className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-start gap-3 transition-all ${active ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 hover:bg-slate-50'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="delegate_type"
                                                    className="hidden"
                                                    checked={active}
                                                    onChange={() => setFormData({ ...formData, delegate_type: value })}
                                                />
                                                <Icon size={20} className="mt-0.5 shrink-0" />
                                                <span>
                                                    <span className="block font-medium">{title}</span>
                                                    <span className={`block text-xs mt-0.5 ${active ? 'text-amber-700' : 'text-slate-500'}`}>{hint}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Office vs LGU Selection */}
                        <div className="pt-2">
                             <label className="block text-sm font-medium text-slate-700 mb-2">Affiliation Type<RequiredMark /></label>
                             <div className="flex gap-4 mb-4">
                                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${affiliationType === 'Office' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="radio" 
                                        className="hidden" 
                                        checked={affiliationType === 'Office'} 
                                        onChange={() => setAffiliationType('Office')}
                                    />
                                    <Building size={20} />
                                    <span className="font-medium">NGA / Office</span>
                                </label>
                                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${affiliationType === 'LGU' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="radio" 
                                        className="hidden" 
                                        checked={affiliationType === 'LGU'} 
                                        onChange={() => setAffiliationType('LGU')}
                                    />
                                    <Landmark size={20} />
                                    <span className="font-medium">LGU</span>
                                </label>
                             </div>

                             {affiliationType === 'Office' ? (
                                <div className="animate-in fade-in zoom-in-95 duration-200">
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Office / Agency Name<RequiredMark /></label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-3 text-slate-400" size={18} />
                                        <input 
                                            required={affiliationType === 'Office'}
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            placeholder="e.g. DILG Regional Office 10"
                                            value={formData.office}
                                            onChange={e => setFormData({...formData, office: e.target.value})}
                                        />
                                    </div>
                                </div>
                             ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Province / HUC<RequiredMark /></label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <select 
                                                required={affiliationType === 'LGU'}
                                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card appearance-none"
                                                value={selectedProvince}
                                                onChange={e => {
                                                    setSelectedProvince(e.target.value);
                                                    setSelectedCity('');
                                                }}
                                            >
                                                <option value="">-- Select Province --</option>
                                                {provinces.map(prov => (
                                                    <option key={prov} value={prov}>{prov}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">City / Municipality</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <select 
                                                disabled={!selectedProvince}
                                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card appearance-none disabled:bg-slate-100 disabled:text-slate-400"
                                                value={selectedCity}
                                                onChange={e => setSelectedCity(e.target.value)}
                                            >
                                                <option value="">-- Provincial / HUC Level (Optional) --</option>
                                                {cities.map(city => (
                                                    <option key={city} value={city}>{city}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                             )}
                        </div>
                    </div>

                    {/* SECTION: Accommodation (Conditional) */}
                    {event.has_accommodation && (
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                             <h3 className="text-sm font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                <Home size={16}/> Accommodation Request
                             </h3>
                             
                             <div>
                                <label className="block text-sm font-medium text-slate-800 mb-3 leading-snug">
                                    We offer accommodation during the entire duration of the event. Do you wish to avail this offer?
                                </label>
                                <div className="flex gap-6">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.needs_accommodation ? 'border-indigo-600 bg-indigo-600' : 'border-slate-400 bg-card'}`}>
                                            {formData.needs_accommodation && <div className="w-2 h-2 rounded-full bg-card"></div>}
                                        </div>
                                        <input
                                            type="radio"
                                            name="accommodation"
                                            className="hidden"
                                            checked={formData.needs_accommodation}
                                            onChange={() => toggleAccommodation(true)}
                                        />
                                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-700">Yes</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer group">
                                         <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${!formData.needs_accommodation ? 'border-indigo-600 bg-indigo-600' : 'border-slate-400 bg-card'}`}>
                                            {!formData.needs_accommodation && <div className="w-2 h-2 rounded-full bg-card"></div>}
                                        </div>
                                        <input
                                            type="radio"
                                            name="accommodation"
                                            className="hidden"
                                            checked={!formData.needs_accommodation}
                                            onChange={() => toggleAccommodation(false)}
                                        />
                                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-700">No</span>
                                    </label>
                                </div>
                             </div>

                             {formData.needs_accommodation && getEventAccommodationDates().length === 1 && (
                                <div className="rounded-lg border border-indigo-100 bg-white/80 px-3 py-2">
                                    <p className="text-xs text-slate-600">
                                        Accommodation date is  <span className="font-semibold text-slate-800">{formatAccommodationDateLabel(getEventAccommodationDates()[0])}</span>.
                                    </p>
                                </div>
                             )}

                             {formData.needs_accommodation && getEventAccommodationDates().length > 1 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold tracking-wide text-indigo-700">The selected dates below reflect the event’s accommodation period. You can adjust them to match your preferred stay.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {getEventAccommodationDates().map((date) => {
                                          const isChecked = formData.date_accommodation.includes(date);
                                          return (
                                            <label
                                              key={date}
                                              className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                                isChecked ? 'border-indigo-400 bg-indigo-100/70 text-indigo-700' : 'border-indigo-100 bg-card text-slate-700 hover:border-indigo-300'
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleAccommodationDate(date)}
                                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                              />
                                              <span className="text-sm font-medium">{formatAccommodationDateLabel(date)}</span>
                                            </label>
                                          );
                                        })}
                                    </div>
                                </div>
                             )}
                        </div>
                    )}

                    {/* SECTION: Giveaways / Freebies (Conditional, separate from CA).
                        Hidden entirely when giveaway selection is closed for the event. */}
                    {(event.giveaways && event.giveaways.length > 0 && event.giveaways_open !== false) && (
                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <h3 className="text-sm font-bold text-purple-800 uppercase tracking-wider flex items-center gap-2">
                                <Gift size={16}/> Giveaways
                            </h3>

                            {event.giveaways.map((item) => (
                                <div key={item.key}>
                                    <label className="block text-sm font-medium text-slate-800 mb-2 leading-snug">
                                        {item.label}
                                        {item.required && item.type === 'single-select' && <RequiredMark />}
                                    </label>

                                    {item.type === 'single-select' ? (
                                        <select
                                            required={item.required}
                                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none bg-card"
                                            value={(formData.giveaway_selections[item.key] as string) || ''}
                                            onChange={(e) => setGiveawaySelection(item.key, e.target.value)}
                                        >
                                            <option value="">-- Select --</option>
                                            {(item.options || []).map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="flex gap-6">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.giveaway_selections[item.key] ? 'border-purple-600 bg-purple-600' : 'border-slate-400 bg-card'}`}>
                                                    {formData.giveaway_selections[item.key] && <div className="w-2 h-2 rounded-full bg-card"></div>}
                                                </div>
                                                <input
                                                    type="radio"
                                                    name={`giveaway-${item.key}`}
                                                    className="hidden"
                                                    checked={!!formData.giveaway_selections[item.key]}
                                                    onChange={() => setGiveawaySelection(item.key, true)}
                                                />
                                                <span className="text-sm font-medium text-slate-700 group-hover:text-purple-700">Yes</span>
                                            </label>

                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${!formData.giveaway_selections[item.key] ? 'border-purple-600 bg-purple-600' : 'border-slate-400 bg-card'}`}>
                                                    {!formData.giveaway_selections[item.key] && <div className="w-2 h-2 rounded-full bg-card"></div>}
                                                </div>
                                                <input
                                                    type="radio"
                                                    name={`giveaway-${item.key}`}
                                                    className="hidden"
                                                    checked={!formData.giveaway_selections[item.key]}
                                                    onChange={() => setGiveawaySelection(item.key, false)}
                                                />
                                                <span className="text-sm font-medium text-slate-700 group-hover:text-purple-700">No</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* SECTION: Certificate of Appearance */}
                    <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 space-y-4">
                        <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-2">
                            <Briefcase size={16}/> Certificate of Appearance
                        </h3>

                        <div>
                            <label className="block text-sm font-medium text-slate-800 mb-3 leading-snug">
                                Do you need a Certificate of Appearance (CA) for this event?
                            </label>
                            <div className="flex gap-6">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.need_ca ? 'border-emerald-600 bg-emerald-600' : 'border-slate-400 bg-card'}`}>
                                        {formData.need_ca && <div className="w-2 h-2 rounded-full bg-card"></div>}
                                    </div>
                                    <input
                                        type="radio"
                                        name="need_ca"
                                        className="hidden"
                                        checked={formData.need_ca}
                                        onChange={() => setFormData({ ...formData, need_ca: true })}
                                    />
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-700">Yes</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${!formData.need_ca ? 'border-emerald-600 bg-emerald-600' : 'border-slate-400 bg-card'}`}>
                                        {!formData.need_ca && <div className="w-2 h-2 rounded-full bg-card"></div>}
                                    </div>
                                    <input
                                        type="radio"
                                        name="need_ca"
                                        className="hidden"
                                        checked={!formData.need_ca}
                                        onChange={() => setFormData({ ...formData, need_ca: false })}
                                    />
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-700">No</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Data Privacy Consent */}
                    <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-lg border border-slate-100 mt-4">
                        <div className="text-xs text-slate-600 leading-relaxed text-justify">
                            <strong>Privacy Notice</strong><br/>
                            DILG 10 Regional Office collects your data for event documentation, monitoring, and evaluation. Records are stored for one year. Photos and recordings may be captured for documentation or used in official publications.<br/>
                            To withdraw consent or report concerns, contact records.dilg10@gmail.com or the DILG Data Protection Officer at dpo.dilg@gmail.com.
                        </div>
                        
                        <div className="text-xs font-bold text-slate-700 mt-2">Consent:</div>

                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="consent-checkbox"
                                    type="checkbox"
                                    required
                                    checked={consent}
                                    onChange={(e) => setConsent(e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="consent-checkbox" className="text-xs text-slate-700 font-bold leading-relaxed cursor-pointer">
                                I have read and agree to the Data Privacy Notice above.<RequiredMark />
                            </label>
                        </div>
                        
                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="accept-photo-video"
                                    type="checkbox"
                                    checked={formData.accept_photo_video}
                                    onChange={(e) => setFormData({...formData, accept_photo_video: e.target.checked})}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="accept-photo-video" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                I consent to the capture of my photo, video, and audio for use in DILG publications.
                            </label>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="flex items-center h-5">
                                <input
                                    id="store-to-db"
                                    type="checkbox"
                                    checked={formData.store_to_db}
                                    onChange={(e) => setFormData({...formData, store_to_db: e.target.checked})}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <label htmlFor="store-to-db" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                I consent to the storage of my data in the organizer’s database for future document processing.
                            </label>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={submitting || !consent}
                            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {submitting && <Loader2 className="animate-spin" size={20} />}
                            {submitting ? 'Registering...' : 'Complete Registration'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    {showMatchPrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeMatchPrompt}></div>
        <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h3 className="text-xl font-bold text-slate-900">
              {potentialMatches.length === 1 ? 'We found a possible existing record' : 'Possible matches'}
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              {potentialMatches.length === 1
                ? 'We found an existing record with similar details. Is this you?'
                : 'We found multiple participant records with similar details. Please select your existing record, or create a new one.'}
            </p>
          </div>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {potentialMatches.length === 1 ? (
              <>
                {renderPotentialMatchCard(potentialMatches[0])}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const selectedMatch = potentialMatches[0];
                      closeMatchPrompt();
                      await processRegistration({ existingUser: selectedMatch, skipPotentialMatch: true });
                    }}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    Yes, use existing record
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      closeMatchPrompt();
                      await processRegistration({ skipPotentialMatch: true });
                    }}
                    className="flex-1 bg-card text-slate-700 py-3 rounded-xl font-semibold border border-slate-300 hover:bg-slate-50 transition-colors"
                  >
                    No, create new registration
                  </button>
                  <button
                    type="button"
                    onClick={closeMatchPrompt}
                    className="sm:w-auto px-5 py-3 rounded-xl font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {potentialMatches.map((match) => (
                  <div key={match.participant_id}>
                    {renderPotentialMatchCard(
                      match,
                      <button
                        type="button"
                        onClick={async () => {
                          closeMatchPrompt();
                          await processRegistration({ existingUser: match, skipPotentialMatch: true });
                        }}
                        className="mt-1 inline-flex items-center justify-center bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                      >
                        Use this record
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      closeMatchPrompt();
                      await processRegistration({ skipPotentialMatch: true });
                    }}
                    className="flex-1 bg-card text-slate-700 py-3 rounded-xl font-semibold border border-slate-300 hover:bg-slate-50 transition-colors"
                  >
                    None of these, create new record
                  </button>
                  <button
                    type="button"
                    onClick={closeMatchPrompt}
                    className="sm:w-auto px-5 py-3 rounded-xl font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )}

    {/* QR Scanner Modal - Floating Overlay */}
    {showQrScanner && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="relative bg-card rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Scan QR Code</h3>
              <button
                onClick={() => setShowQrScanner(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close scanner"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <QrScanner
              active={showQrScanner}
              onScanSuccess={(code) => {
                setShowQrScanner(false);
                handleQrScanSuccess(code);
              }}
              onScanFailure={(err) => console.log(err)}
            />

            <p className="text-xs text-center text-slate-500">Position the QR code within the frame to scan.</p>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">or</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={() => qrFileInputRef.current?.click()}
              disabled={decodingQrFile}
              className="w-full border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {decodingQrFile ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {decodingQrFile ? 'Reading image...' : 'Upload QR code image'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default EventRegistration;
