
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { DelegateType, Event, Participant, Office, GiveawayItem, EventAccessRole, EventUserAccess, User } from '../../types/database';
import { CalendarPlus, Trash2, X, MapPin, Type, Clock, Share2, Edit, Users, Calendar, Check, Copy, Bed, Lock, UserPlus, Loader2, ArrowRight, Search, Building2, Save, XCircle, AlertTriangle, MoreVertical, Building, Landmark, Download, Info, RotateCcw, CameraOff, DatabaseBackup, Gift, Settings, ChevronDown, Hash, Utensils } from 'lucide-react';
import { eachDayOfInterval, format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import QRCode from 'react-qr-code';
import ExcelJS from 'exceljs';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  type EventFoodInclusionMap,
  type FoodMealOption,
  FOOD_MEAL_OPTIONS,
  normalizeFoodInclusionMap,
  parseFoodInclusion,
  serializeFoodInclusion
} from '../../lib/eventFoodInclusion';
import { MANAGE_EVENT_ACCESS_ROLES, fetchAccessibleEvents, isEventOwnerOffice } from '../../lib/eventAccess';
import { sendParticipantQrById } from '../../lib/emailService';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';
import { canvasToPdfBlob, PAGE_SIZES } from '../../lib/canvasPdf';
import { diffRecords, logAudit, sanitizeSnapshot } from '../../lib/auditLog';
import { formatParticipantOfficialName } from '../../lib/participantName';
import {
  DELEGATE_CHIP_CLASS,
  DELEGATE_TYPES,
  delegateTypeForRole,
  readDelegateType
} from '../../lib/delegates';

type ParticipantFormData = {
  f_name: string;
  l_name: string;
  m_initial: string;
  suffix: string;
  full_name: string;
  email: string;
  role: string;
  delegate_type: '' | DelegateType;
  office: string;
  mobile_no: string;
  position: string;
  gender: string;
  age_group: string;
  pwd: string;
  indigenous_people: string;
  needs_accommodation: boolean;
  accommodation_pax: number;
  date_accommodation: string[];
  participant_id?: number | null;
  accept_photo_video: boolean;
  store_to_db: boolean;
  need_ca: boolean;
  giveaway_selections: Record<string, string | boolean>;
};

type ParticipantModalRecord = {
  id: number;
  participant_id: number;
  registration_status: string;
  registered_at?: string | null;
  role: string;
  delegate_type: string | null;
  needs_accommodation: boolean;
  accommodation_pax: number;
  accept_photo_video: boolean;
  store_to_db: boolean;
  need_ca: boolean;
  date_accommodation: string[] | null;
  giveaway_selections: Record<string, string | boolean> | null;
  participants: Participant | null;
};

const getRoleChipClass = (role: string) => {
  if (role === 'Secretariat') return 'bg-indigo-50 text-indigo-600 border-indigo-100';
  if (role === 'Speaker') return 'bg-amber-50 text-amber-600 border-amber-100';
  if (role === 'Guest' || role === 'VIP') return 'bg-emerald-50 text-emerald-600 border-emerald-100';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const getRoleChipLabel = (role: string) => (role === 'Guest' || role === 'VIP' ? 'Guest/VIP' : role);

type EventAccessUser = Pick<User, 'user_id' | 'full_name' | 'username' | 'office_id' | 'status'> & {
  offices?: Pick<Office, 'code' | 'name'> | null;
};

type EventAccessRecord = EventUserAccess & {
  users?: EventAccessUser | null;
};

const createEmptyParticipantForm = (): ParticipantFormData => ({
  f_name: '',
  l_name: '',
  m_initial: '',
  suffix: '',
  full_name: '',
  email: '',
  role: 'Delegate',
  delegate_type: '',
  office: '',
  mobile_no: '',
  position: '',
  gender: '',
  age_group: '18-24',
  pwd: 'No',
  indigenous_people: 'No',
  needs_accommodation: false,
  accommodation_pax: 0,
  date_accommodation: [],
  participant_id: null,
  accept_photo_video: true,
  store_to_db: true,
  need_ca: false,
  giveaway_selections: {}
});

const getDateRangeOptions = (start?: string | null, end?: string | null) => {
  if (!start) return [];

  try {
    const startDate = parseISO(start);
    const parsedEnd = end ? parseISO(end) : startDate;
    const endDate = parsedEnd < startDate ? startDate : parsedEnd;

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

const EVENT_STATUS_SORT_ORDER: Record<string, number> = {
  Ongoing: 0,
  Scheduled: 1,
  Completed: 2,
  Cancelled: 3
};

// Page buttons on offer at once. Ten fit beside Previous/Next on a laptop; below the
// `lg` breakpoint (phones and tablets) the row has to stay short enough not to wrap.
const DESKTOP_PAGE_BUTTONS = 10;
const COMPACT_PAGE_BUTTONS = 5;
const DESKTOP_PAGINATION_QUERY = '(min-width: 1024px)';

const useMaxPageButtons = () => {
  const [maxButtons, setMaxButtons] = useState(DESKTOP_PAGE_BUTTONS);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(DESKTOP_PAGINATION_QUERY);
    const apply = () => setMaxButtons(query.matches ? DESKTOP_PAGE_BUTTONS : COMPACT_PAGE_BUTTONS);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return maxButtons;
};

const EventsList: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [events, setEvents] = useState<Event[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [eventView, setEventView] = useState<'active' | 'deleted'>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;
  const navigate = useNavigate();
  const location = useLocation();

  // Modal States
  const [showEventModal, setShowEventModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showEventAccessModal, setShowEventAccessModal] = useState(false);
  const [selectedAccessEvent, setSelectedAccessEvent] = useState<Event | null>(null);
  const [eventAccessList, setEventAccessList] = useState<EventAccessRecord[]>([]);
  const [eventAccessUsers, setEventAccessUsers] = useState<EventAccessUser[]>([]);
  const [loadingEventAccess, setLoadingEventAccess] = useState(false);
  const [accessUserSearch, setAccessUserSearch] = useState('');
  const [selectedAccessUserId, setSelectedAccessUserId] = useState('');
  const [isAccessUserDropdownOpen, setIsAccessUserDropdownOpen] = useState(false);
  const [selectedAccessRole, setSelectedAccessRole] = useState<EventAccessRole>('ManagerScanner');
  const [savingEventAccess, setSavingEventAccess] = useState(false);
  const [editingAccessId, setEditingAccessId] = useState<number | null>(null);
  const [editingAccessRole, setEditingAccessRole] = useState<EventAccessRole>('ManagerScanner');
  const [updatingAccessId, setUpdatingAccessId] = useState<number | null>(null);
  
  // Add Participant Modal State
  const [participantModalView, setParticipantModalView] = useState<'list' | 'add' | 'edit'>('list');
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState<ParticipantFormData>(createEmptyParticipantForm());
  const [editingParticipantRecord, setEditingParticipantRecord] = useState<ParticipantModalRecord | null>(null);
  const [logAttendanceOnRegister, setLogAttendanceOnRegister] = useState(false);
  const [sendQrOnRegister, setSendQrOnRegister] = useState(true);
  // QR email can only be sent when the email field holds a valid address.
  const canSendQrEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newParticipant.email.trim());

  // The existing participant row picked from the name suggestions, kept so the
  // audit trail can diff against it when the Add form updates that record.
  const [selectedExistingParticipant, setSelectedExistingParticipant] = useState<Participant | null>(null);

  // Name change confirmation
  const [selectedParticipantName, setSelectedParticipantName] = useState<{ f_name: string; l_name: string } | null>(null);
  const [showNameChangeConfirm, setShowNameChangeConfirm] = useState(false);
  const [pendingNameChange, setPendingNameChange] = useState<{ field: 'f_name' | 'l_name'; value: string } | null>(null);

  // Affiliation State
  const [affiliationType, setAffiliationType] = useState<'Office' | 'LGU'>('Office');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [locations, setLocations] = useState<any[]>([]);

  const provinces = Array.from(new Set(locations.map(l => l.province_huc))).sort();
  const cities = locations
      .filter(l => l.province_huc === selectedProvince && l.city_mun)
      .map(l => l.city_mun)
      .sort();

  // Auto-suggestion state
  const [suggestions, setSuggestions] = useState<Participant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Selection States
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [viewingParticipants, setViewingParticipants] = useState<ParticipantModalRecord[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  const [participantSearchTerm, setParticipantSearchTerm] = useState('');
  const [accommodationFilter, setAccommodationFilter] = useState<'all' | 'with'>('all');
  const [photoConsentFilter, setPhotoConsentFilter] = useState<'all' | 'declined'>('all');
  const [storeConsentFilter, setStoreConsentFilter] = useState<'all' | 'declined'>('all');
  const [delegateTypeFilter, setDelegateTypeFilter] = useState<'all' | DelegateType>('all');

  // Role Editing State
  const [editingRole, setEditingRole] = useState<{ participantId: number; role: string; delegate_type: string } | null>(null);

  // Delete Confirmation State
  const [participantToDelete, setParticipantToDelete] = useState<number | null>(null);
  const [eventToDelete, setEventToDelete] = useState<number | null>(null);
  const [eventDeleteConfirmation, setEventDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const [actionMenuDirection, setActionMenuDirection] = useState<'up' | 'down'>('down');
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  
  // Form State
  const initialFormState = {
      event_name: '',
      venue: '',
      event_serial: '',
      start_date: '',
      end_date: '',
      status: 'Scheduled' as const,
      organize_by: null as number | null,
      has_accommodation: false,
      registration_open: true,
      auto_attendance_on_registration: false,
      has_principal_delegates: false,
      session: 'All_Day' as const,
      days_accommodation: 0,
      dates_with_accom: [] as string[],
      giveaways: [] as GiveawayItem[],
      giveaways_open: true
  };
  const [formData, setFormData] = useState<Partial<Event>>(initialFormState);
  const [foodInclusionByDate, setFoodInclusionByDate] = useState<EventFoodInclusionMap>({});
  const [hasEventCode, setHasEventCode] = useState(false);
  const [showEventCodeInfo, setShowEventCodeInfo] = useState(false);
  const [giveawaysEnabled, setGiveawaysEnabled] = useState(false);
  const [customizeMealsPerDay, setCustomizeMealsPerDay] = useState(false);
  const [venueSuggestions, setVenueSuggestions] = useState<string[]>([]);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const [loadingVenueSuggestions, setLoadingVenueSuggestions] = useState(false);
  const venueInputFocusedRef = React.useRef(false);
  const qrCodeRef = React.useRef<HTMLDivElement>(null);
  const [downloadingBadge, setDownloadingBadge] = useState(false);

  useEffect(() => {
    if (!isAdmin && eventView === 'deleted') {
      setEventView('active');
      return;
    }

    fetchEvents();
    fetchLocations();
    if (user?.role === 'Admin') {
        fetchOffices();
    }

    const subscription = supabase
      .channel('events_list_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchEvents();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_user_access' }, () => {
        fetchEvents();
        if (selectedAccessEvent) {
          fetchEventAccess(selectedAccessEvent.event_id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user, eventView, selectedAccessEvent]);

  // Realtime updates for the Participants Modal
  useEffect(() => {
    if (showParticipantsModal && selectedEvent) {
        // Initial fetch
        fetchEventParticipants(selectedEvent.event_id);

        // Subscribe to changes for this specific event's participants
        const channel = supabase
            .channel(`modal_participants_${selectedEvent.event_id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'event_participants',
                filter: `event_id=eq.${selectedEvent.event_id}`
            }, () => {
                fetchEventParticipants(selectedEvent.event_id);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
  }, [showParticipantsModal, selectedEvent]);

  useEffect(() => {
    if (!showEventModal) {
        venueInputFocusedRef.current = false;
        setVenueSuggestions([]);
        setShowVenueSuggestions(false);
        setLoadingVenueSuggestions(false);
        setGiveawaysEnabled(false);
        setCustomizeMealsPerDay(false);
        return;
    }

    const searchValue = (formData.venue || '').trim();

    if (searchValue.length < 2) {
        setVenueSuggestions([]);
        setShowVenueSuggestions(false);
        setLoadingVenueSuggestions(false);
        return;
    }

    let cancelled = false;
    setLoadingVenueSuggestions(true);

    const timer = window.setTimeout(async () => {
        let query = supabase
          .from('events')
          .select('venue')
          .ilike('venue', `%${searchValue}%`)
          .not('venue', 'is', null)
          .is('deleted_at', null)
          .order('venue', { ascending: true })
          .limit(12);

        if (!isAdmin && user?.office_id) {
            query = query.eq('organize_by', user.office_id);
        }

        const { data, error } = await query;

        if (cancelled) return;

        if (error) {
            setVenueSuggestions([]);
            setShowVenueSuggestions(false);
            setLoadingVenueSuggestions(false);
            return;
        }

        const normalizedSearch = searchValue.toLowerCase();
        const uniqueVenues = Array.from(
          new Map(
            (data || [])
              .map((record) => record.venue?.trim())
              .filter((venue): venue is string => !!venue && venue.toLowerCase() !== normalizedSearch)
              .map((venue) => [venue.toLowerCase(), venue])
          ).values()
        ).slice(0, 5);

        setVenueSuggestions(uniqueVenues);
        setShowVenueSuggestions(venueInputFocusedRef.current && uniqueVenues.length > 0);
        setLoadingVenueSuggestions(false);
    }, 300);

    return () => {
        cancelled = true;
        window.clearTimeout(timer);
    };
  }, [formData.venue, showEventModal, isAdmin, user?.office_id]);

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

  const fetchEvents = async () => {
    setLoading(true);

    try {
      const data = await fetchAccessibleEvents(user, {
        accessRoles: MANAGE_EVENT_ACCESS_ROLES,
        deletedView: eventView,
        orderBy: eventView === 'deleted' ? 'deleted_at' : 'start_date',
        ascending: false
      });

      setEvents(data);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Unable to load events.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOffices = async () => {
      const { data } = await supabase.from('offices').select('*').order('name');
      if (data) setOffices(data);
  };

  const fetchEventAccess = async (eventId: number) => {
      setLoadingEventAccess(true);

      const { data, error } = await supabase
        .from('event_user_access')
        .select(`
          id,
          event_id,
          user_id,
          access_role,
          assigned_by,
          assigned_at,
          status,
          users!event_user_access_user_id_fkey (
            user_id,
            full_name,
            username,
            office_id,
            status,
            offices (
              code,
              name
            )
          )
        `)
        .eq('event_id', eventId)
        .order('assigned_at', { ascending: false });

      if (error) {
        console.error('Error fetching event access:', error);
        toast.error('Unable to load event access list.');
      } else {
        setEventAccessList((data || []) as EventAccessRecord[]);
      }

      setLoadingEventAccess(false);
  };

  const fetchEventAccessUsers = async () => {
      const { data, error } = await supabase
        .from('users')
        .select(`
          user_id,
          full_name,
          username,
          office_id,
          status,
          offices (
            code,
            name
          )
        `)
        .eq('status', 'Active')
        .neq('role', 'Admin')
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Error fetching users for event access:', error);
        toast.error('Unable to load users for event access.');
        return;
      }

      setEventAccessUsers((data || []) as EventAccessUser[]);
  };

  const fetchEventParticipants = async (eventId: number) => {
    setLoadingParticipants(true);
    const { data, error } = await supabase
        .from('event_participants')
        .select(`
            id,
            participant_id,
            registration_status,
            registered_at,
            role,
            delegate_type,
            needs_accommodation,
            accommodation_pax,
            accept_photo_video,
            store_to_db,
            need_ca,
            date_accommodation,
            giveaway_selections,
            participants (
                participant_id,
                full_name,
                participant_code,
                email,
                f_name,
                l_name,
                m_initial,
                suffix,
                position,
                office,
                mobile_no,
                gender,
                age_group,
                pwd,
                indigenous_people,
                location_id
            )
        `)
        .eq('event_id', eventId);
    
    if (!error && data) {
        const normalizedParticipants = data.map((record: any) => ({
            ...record,
            participants: Array.isArray(record.participants) ? (record.participants[0] || null) : (record.participants || null)
        })) as ParticipantModalRecord[];

        setViewingParticipants(normalizedParticipants);
    }
    setLoadingParticipants(false);
  };

  // --- Date Formatting Logic ---
  const formatEventDate = (start: string, end: string) => {
    if (!start) return 'TBD';
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;

    if (start === end) {
        return format(startDate, 'MMM d, yyyy');
    }

    if (isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMM d')} - ${format(endDate, 'd, yyyy')}`;
    }

    if (!isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
        return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
    }

    return `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
  };

  const formatDeletedDate = (value?: string | null) => {
      if (!value) return '-';

      try {
          return format(parseISO(value), 'MMM d, yyyy h:mm a');
      } catch {
          return value;
      }
  };

  const getFormEventDateOptions = (start = formData.start_date, end = formData.end_date) => {
      return getDateRangeOptions(start, end);
  };

  const normalizeAccommodationDates = (dates: string[], start = formData.start_date, end = formData.end_date) => {
      const validOptions = getFormEventDateOptions(start, end);
      return dates.filter((date) => validOptions.includes(date));
  };

  const getSelectedEventAccommodationDates = (event: Event | null) => {
      if (!event?.has_accommodation) return [];
      const savedDates = (event.dates_with_accom || []).filter(Boolean);
      return savedDates.length > 0 ? savedDates : getDateRangeOptions(event.start_date, event.end_date);
  };

  // True when today's date falls within the event's date range, i.e. the participant
  // is being registered on an actual day of the event.
  const isTodayEventDay = (event: Event | null) => {
      if (!event) return false;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      return getDateRangeOptions(event.start_date, event.end_date).includes(todayStr);
  };

  // Attendance session to auto-log on registration: AM for All_Day / AM-only events, PM for PM-only events.
  const getRegistrationAttendanceSession = (event: Event | null): 'AM' | 'PM' =>
      event?.session === 'PM' ? 'PM' : 'AM';

  const toggleParticipantAccommodation = (checked: boolean) => {
      const availableDates = getSelectedEventAccommodationDates(selectedEvent);
      const normalizedSelectedDates = (newParticipant.date_accommodation || []).filter((date) => availableDates.includes(date));
      const nextDates = checked
        ? (availableDates.length === 1
            ? [availableDates[0]]
            : normalizedSelectedDates)
        : [];

      setNewParticipant({
          ...newParticipant,
          needs_accommodation: checked,
          accommodation_pax: checked ? 1 : 0,
          date_accommodation: nextDates
      });
  };

  const toggleParticipantAccommodationDate = (date: string) => {
      setNewParticipant((prev) => {
          const availableDates = getSelectedEventAccommodationDates(selectedEvent);
          if (!availableDates.includes(date)) return prev;

          const selectedDates = prev.date_accommodation.includes(date)
            ? prev.date_accommodation.filter((value) => value !== date)
            : [...prev.date_accommodation, date];

          return {
              ...prev,
              date_accommodation: selectedDates
          };
      });
  };

  const updateEventDates = (field: 'start_date' | 'end_date', value: string) => {
      const nextFormData = { ...formData, [field]: value };
      const validDates = getDateRangeOptions(nextFormData.start_date, nextFormData.end_date);
      const selectedDates = (nextFormData.dates_with_accom || []).filter((date) => validDates.includes(date));
      const fallbackDates = nextFormData.has_accommodation && selectedDates.length === 0 ? validDates : selectedDates;
      const normalizedFoodInclusion = normalizeFoodInclusionMap(foodInclusionByDate, validDates);

      setFoodInclusionByDate(normalizedFoodInclusion);

      setFormData({
          ...nextFormData,
          dates_with_accom: fallbackDates,
          days_accommodation: nextFormData.has_accommodation ? fallbackDates.length : 0
      });
  };

  const toggleFormAccommodation = (checked: boolean) => {
      const availableDates = getFormEventDateOptions();
      const nextDates = checked
        ? (() => {
            const selectedDates = normalizeAccommodationDates(formData.dates_with_accom || []);
            return selectedDates.length > 0 ? selectedDates : availableDates;
          })()
        : [];

      setFormData({
          ...formData,
          has_accommodation: checked,
          dates_with_accom: nextDates,
          days_accommodation: checked ? nextDates.length : 0
      });
  };

  const toggleFormAccommodationDate = (date: string) => {
      const selectedDates = new Set(normalizeAccommodationDates(formData.dates_with_accom || []));
      if (selectedDates.has(date)) {
          selectedDates.delete(date);
      } else {
          selectedDates.add(date);
      }

      const nextDates = getFormEventDateOptions().filter((value) => selectedDates.has(value));
      setFormData({
          ...formData,
          dates_with_accom: nextDates,
          days_accommodation: nextDates.length
      });
  };

  const toggleFoodInclusionMeal = (date: string, meal: FoodMealOption) => {
      setFoodInclusionByDate((prev) => {
          const validDates = getFormEventDateOptions();
          if (!validDates.includes(date)) return prev;

          const currentMeals = new Set(prev[date] || []);
          if (currentMeals.has(meal)) {
              currentMeals.delete(meal);
          } else {
              currentMeals.add(meal);
          }

          return normalizeFoodInclusionMap(
            {
              ...prev,
              [date]: Array.from(currentMeals)
            },
            validDates
          );
      });
  };

  const isMealOnAllDates = (meal: FoodMealOption) => {
      const dates = getFormEventDateOptions();
      return dates.length > 0 && dates.every((date) => (foodInclusionByDate[date] || []).includes(meal));
  };

  const toggleMealForAllDates = (meal: FoodMealOption) => {
      const dates = getFormEventDateOptions();
      if (dates.length === 0) return;
      const shouldRemove = isMealOnAllDates(meal);
      setFoodInclusionByDate((prev) => {
          const next: EventFoodInclusionMap = { ...prev };
          dates.forEach((date) => {
              const meals = new Set<FoodMealOption>(next[date] || []);
              if (shouldRemove) {
                  meals.delete(meal);
              } else {
                  meals.add(meal);
              }
              next[date] = Array.from(meals);
          });
          return normalizeFoodInclusionMap(next, dates);
      });
  };

  const selectAllMealsForAllDates = () => {
      const dates = getFormEventDateOptions();
      if (dates.length === 0) return;
      setFoodInclusionByDate(normalizeFoodInclusionMap(
          Object.fromEntries(dates.map((date) => [date, [...FOOD_MEAL_OPTIONS]])),
          dates
      ));
  };

  // --- Handlers ---

  const openCreateModal = () => {
      setEditingEventId(null);
      // Pre-select user's office if applicable, unless Admin who can choose
      setFormData({
          ...initialFormState,
          organize_by: user?.role === 'Admin' ? null : (user?.office_id || null)
      });
      setHasEventCode(false);
      setFoodInclusionByDate({});
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
      setLoadingVenueSuggestions(false);
      setEventAccessList([]);
      setAccessUserSearch('');
      setSelectedAccessUserId('');
      setSelectedAccessRole('ManagerScanner');
      setShowEventModal(true);
  };

  const openEditModal = (e: React.MouseEvent, event: Event) => {
      e.stopPropagation(); // Prevent row click
      setEditingEventId(event.event_id);
      setFormData({
          event_name: event.event_name || '',
          venue: event.venue || '',
          event_serial: event.event_serial || '',
          start_date: event.start_date || '',
          end_date: event.end_date || '',
          status: event.status,
          organize_by: event.organize_by,
          has_accommodation: event.has_accommodation,
          registration_open: event.registration_open,
          auto_attendance_on_registration: event.auto_attendance_on_registration ?? false,
          has_principal_delegates: event.has_principal_delegates ?? false,
          session: event.session || 'All_Day',
          days_accommodation: event.days_accommodation || 0,
          dates_with_accom: event.dates_with_accom || [],
          giveaways: event.giveaways || [],
          giveaways_open: event.giveaways_open ?? true
      });
      setHasEventCode(!!event.event_serial?.trim());
      setFoodInclusionByDate(
        parseFoodInclusion(
          event.food_inclusion || [],
          getDateRangeOptions(event.start_date, event.end_date)
        )
      );
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
      setLoadingVenueSuggestions(false);
      setShowEventModal(true);
  };

  const canSetEventAccess = (event: Event | null | undefined) =>
      Boolean(
        eventView === 'active' &&
        event &&
        (
          isAdmin ||
          (user?.role === 'OfficeManager' && isEventOwnerOffice(user, event))
        )
      );

  const openEventAccessModal = (e: React.MouseEvent, event: Event) => {
      e.stopPropagation();
      if (!canSetEventAccess(event)) return;

      setSelectedAccessEvent(event);
      setAccessUserSearch('');
      setSelectedAccessUserId('');
      setSelectedAccessRole('ManagerScanner');
      setIsAccessUserDropdownOpen(false);
      setOpenActionMenuId(null);
      setActionMenuPosition(null);
      setShowEventAccessModal(true);
      fetchEventAccess(event.event_id);
      fetchEventAccessUsers();
  };

  const closeEventAccessModal = () => {
      setShowEventAccessModal(false);
      setSelectedAccessEvent(null);
      setEventAccessList([]);
      setAccessUserSearch('');
      setSelectedAccessUserId('');
      setSelectedAccessRole('ManagerScanner');
      setIsAccessUserDropdownOpen(false);
  };

  // --- Giveaways / freebies config helpers ---
  const addGiveaway = () => {
      setFormData((prev) => ({
          ...prev,
          giveaways: [
              ...((prev.giveaways as GiveawayItem[]) || []),
              {
                  key: `g_${Math.random().toString(36).slice(2, 9)}`,
                  label: '',
                  type: 'single-select',
                  required: true,
                  include_in_attendance: false,
                  options: ['S', 'M', 'L', 'XL']
              }
          ]
      }));
  };

  const updateGiveaway = (index: number, patch: Partial<GiveawayItem>) => {
      setFormData((prev) => {
          const list = [...(((prev.giveaways as GiveawayItem[]) || []))];
          list[index] = { ...list[index], ...patch };
          return { ...prev, giveaways: list };
      });
  };

  const removeGiveaway = (index: number) => {
      setFormData((prev) => ({
          ...prev,
          giveaways: (((prev.giveaways as GiveawayItem[]) || [])).filter((_, i) => i !== index)
      }));
  };

  // Drop incomplete items and clean up options before saving.
  const normalizeGiveaways = (items: GiveawayItem[] = []): GiveawayItem[] =>
      items
          .map((g) => ({
              ...g,
              label: (g.label || '').trim(),
              include_in_attendance: !!g.include_in_attendance,
              options: g.type === 'single-select'
                  ? (g.options || []).map((o) => o.trim()).filter(Boolean)
                  : []
          }))
          .filter((g) => g.label && (g.type === 'boolean' || (g.options && g.options.length > 0)));

  const handleSaveEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // If not admin, force assignment to their office (security fallback)
      const normalizedAccommodationDates = formData.has_accommodation
        ? (() => {
            const selectedDates = normalizeAccommodationDates(formData.dates_with_accom || []);
            return selectedDates.length > 0 ? selectedDates : getFormEventDateOptions(formData.start_date, formData.end_date);
          })()
        : [];
      const validEventDates = getFormEventDateOptions(formData.start_date, formData.end_date);
      const normalizedFoodInclusion = serializeFoodInclusion(foodInclusionByDate, validEventDates);
      const normalizedEventSerial = hasEventCode ? formData.event_serial?.trim() : '';

      let payload = {
          ...formData,
          event_serial: normalizedEventSerial ? normalizedEventSerial : null,
          session: formData.session || 'All_Day',
          dates_with_accom: formData.has_accommodation ? normalizedAccommodationDates : null,
          days_accommodation: formData.has_accommodation ? normalizedAccommodationDates.length : 0,
          food_inclusion: normalizedFoodInclusion,
          giveaways: normalizeGiveaways(formData.giveaways as GiveawayItem[])
      };
      if (user?.role !== 'Admin') {
          payload.organize_by = editingEventId ? (formData.organize_by || null) : (user?.office_id || null);
      }

      let error;
      if (editingEventId) {
          // Update
          const previousEvent = events.find((event) => event.event_id === editingEventId) || null;
          const { error: updateError } = await supabase
            .from('events')
            .update(payload)
            .eq('event_id', editingEventId);
          error = updateError;

          if (!updateError) {
              // `status` is recomputed by a DB trigger from the dates, so it is not
              // a user-made change and would otherwise show up as noise.
              logAudit({
                  actor: user,
                  action: 'Update',
                  entityType: 'Event',
                  entityId: editingEventId,
                  entityLabel: payload.event_name,
                  eventId: editingEventId,
                  eventName: payload.event_name,
                  changes: diffRecords(previousEvent, payload, { ignore: ['status'] })
              });
          }
      } else {
          // Create
          // Ensure status is 'Scheduled' for new events to satisfy the check constraint
          payload.status = 'Scheduled';
          const { data: createdEvent, error: insertError } = await supabase
            .from('events')
            .insert([payload])
            .select()
            .single();
          error = insertError;

          if (!insertError) {
              logAudit({
                  actor: user,
                  action: 'Create',
                  entityType: 'Event',
                  entityId: createdEvent?.event_id ?? null,
                  entityLabel: payload.event_name,
                  eventId: createdEvent?.event_id ?? null,
                  eventName: payload.event_name,
                  snapshot: sanitizeSnapshot(createdEvent)
              });
          }
      }

      if (!error) {
          setShowEventModal(false);
          setEditingEventId(null);
          setFormData(initialFormState);
          setHasEventCode(false);
          setFoodInclusionByDate({});
          setVenueSuggestions([]);
          setShowVenueSuggestions(false);
          setLoadingVenueSuggestions(false);
          fetchEvents(); 
      } else {
        toast.error("Error saving event: " + error.message);
      }
  };

  const handleGrantEventAccess = async () => {
      if (!selectedAccessEvent || !selectedAccessUserId || !user) return;

      if (!canSetEventAccess(selectedAccessEvent)) {
          toast.error('Only Admin or the owning Office Manager can assign users to this event.');
          return;
      }

      setSavingEventAccess(true);

      const { error } = await supabase
        .from('event_user_access')
        .upsert({
          event_id: selectedAccessEvent.event_id,
          user_id: Number(selectedAccessUserId),
          access_role: selectedAccessRole,
          assigned_by: user.user_id,
          status: 'Active'
        }, {
          onConflict: 'event_id,user_id'
        });

      if (error) {
          toast.error('Error assigning user: ' + error.message);
      } else {
          toast.success('Event access saved.');
          setSelectedAccessUserId('');
          setAccessUserSearch('');
          setIsAccessUserDropdownOpen(false);
          fetchEventAccess(selectedAccessEvent.event_id);
      }

      setSavingEventAccess(false);
  };

  const startEditEventAccess = (access: EventAccessRecord) => {
      setEditingAccessId(access.id);
      setEditingAccessRole(access.access_role);
  };

  const cancelEditEventAccess = () => {
      setEditingAccessId(null);
  };

  const handleUpdateEventAccessRole = async (access: EventAccessRecord) => {
      if (!selectedAccessEvent || !user) return;

      if (!canSetEventAccess(selectedAccessEvent)) {
          toast.error('Only Admin or the owning Office Manager can update event access.');
          return;
      }

      if (editingAccessRole === access.access_role) {
          setEditingAccessId(null);
          return;
      }

      setUpdatingAccessId(access.id);

      const { error } = await supabase
        .from('event_user_access')
        .update({ access_role: editingAccessRole })
        .eq('id', access.id);

      if (error) {
          toast.error('Error updating access: ' + error.message);
      } else {
          toast.success('Event access updated.');
          setEditingAccessId(null);
          fetchEventAccess(selectedAccessEvent.event_id);
      }

      setUpdatingAccessId(null);
  };

  const handleRevokeEventAccess = async (access: EventAccessRecord) => {
      if (!selectedAccessEvent || !user) return;

      if (!canSetEventAccess(selectedAccessEvent)) {
          toast.error('Only Admin or the owning Office Manager can revoke event access.');
          return;
      }

      const { error } = await supabase
        .from('event_user_access')
        .update({ status: 'Revoked' })
        .eq('id', access.id);

      if (error) {
          toast.error('Error revoking access: ' + error.message);
      } else {
          toast.success('Event access revoked.');
          fetchEventAccess(selectedAccessEvent.event_id);
      }
  };

  const selectVenueSuggestion = (venue: string) => {
      setFormData((prev) => ({ ...prev, venue }));
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
      setLoadingVenueSuggestions(false);
      venueInputFocusedRef.current = false;
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); // Prevent row click
      const targetEvent = events.find((event) => event.event_id === id);
      if (!targetEvent || !canDeleteEventRecord(targetEvent)) return;

      setEventDeleteConfirmation('');
      setEventToDelete(id);
  };

  const closeDeleteEventModal = () => {
      setEventDeleteConfirmation('');
      setEventToDelete(null);
  };

  const confirmDeleteEvent = async () => {
      if (!eventToDelete) return;

      const targetEvent = events.find((event) => event.event_id === eventToDelete);
      if (!targetEvent || !canDeleteEventRecord(targetEvent)) return;
      
      const deletedEventId = eventToDelete;
      const isPermanentDelete = eventView === 'deleted' && isAdmin;
      setIsDeleting(true);
      try {
          const { error } = isPermanentDelete
            ? await supabase
                .from('events')
                .delete()
                .eq('event_id', deletedEventId)
                .not('deleted_at', 'is', null)
            : await supabase
                .from('events')
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: user?.user_id ?? null
                })
                .eq('event_id', deletedEventId)
                .is('deleted_at', null);
          if (error) throw error;

          logAudit({
              actor: user,
              action: isPermanentDelete ? 'PermanentDelete' : 'Delete',
              entityType: 'Event',
              entityId: deletedEventId,
              entityLabel: targetEvent.event_name,
              // A permanently deleted event cannot be referenced — the FK would be
              // nulled anyway, so keep only the name snapshot.
              eventId: isPermanentDelete ? null : deletedEventId,
              eventName: targetEvent.event_name,
              snapshot: sanitizeSnapshot(targetEvent),
              reason: targetEvent.delete_reason ?? null
          });

          setEvents((prevEvents) => prevEvents.filter((event) => event.event_id !== deletedEventId));
          setOpenActionMenuId(null);
          if (selectedEvent?.event_id === deletedEventId) {
              setSelectedEvent(null);
              setShowParticipantsModal(false);
              setShowShareModal(false);
          }
          closeDeleteEventModal();
          toast.success(eventView === 'deleted' && isAdmin ? 'Event permanently deleted.' : 'Event moved to Deleted Events.');
      } catch (err: any) {
          toast.error("Error deleting event: " + err.message);
      } finally {
          setIsDeleting(false);
      }
  };

  const handleRestoreEvent = async (e: React.MouseEvent, eventId: number) => {
      if (!isAdmin) return;

      e.stopPropagation();
      const targetEvent = events.find((event) => event.event_id === eventId);
      setIsDeleting(true);
      try {
          const { error } = await supabase
            .from('events')
            .update({
                deleted_at: null,
                deleted_by: null,
                delete_reason: null
            })
            .eq('event_id', eventId)
            .not('deleted_at', 'is', null);

          if (error) throw error;

          logAudit({
              actor: user,
              action: 'Restore',
              entityType: 'Event',
              entityId: eventId,
              entityLabel: targetEvent?.event_name ?? null,
              eventId,
              eventName: targetEvent?.event_name ?? null
          });

          setEvents((prevEvents) => prevEvents.filter((event) => event.event_id !== eventId));
          setOpenActionMenuId(null);
          toast.success('Event restored.');
      } catch (err: any) {
          toast.error("Error restoring event: " + err.message);
      } finally {
          setIsDeleting(false);
      }
  };

  const openShareModal = (e: React.MouseEvent, event: Event) => {
      e.stopPropagation(); // Prevent row click
      setSelectedEvent(event);
      setShowShareModal(true);
      setCopied(false);
  };

  const handleRowClick = (event: Event) => {
      setSelectedEvent(event);
      setShowParticipantsModal(true);
      // fetchEventParticipants is called in useEffect when modal opens
  };

  // Deep link: /events?event=<id> (e.g. from the Dashboard) opens that event's participants view
  useEffect(() => {
      const idParam = new URLSearchParams(location.search).get('event');
      if (!idParam || loading) return;
      const target = events.find((e) => e.event_id === Number(idParam));
      if (target) {
          handleRowClick(target);
      }
      navigate('/events', { replace: true });
  }, [loading, events, location.search]);

  const resetParticipantForm = () => {
      setNewParticipant(createEmptyParticipantForm());
      setEditingParticipantRecord(null);
      setLogAttendanceOnRegister(false);
      setSendQrOnRegister(true);
      setAffiliationType('Office');
      setSelectedProvince('');
      setSelectedCity('');
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedParticipantName(null);
      setSelectedExistingParticipant(null);
      setShowNameChangeConfirm(false);
      setPendingNameChange(null);
  };

  const handleConfirmNameChange = () => {
      if (!pendingNameChange) return;

      setNewParticipant(prev => ({
          ...prev,
          [pendingNameChange.field]: pendingNameChange.value,
          participant_id: null
      }));

      setSelectedExistingParticipant(null);
      setShowNameChangeConfirm(false);
      setPendingNameChange(null);
      setSelectedParticipantName(null);
  };

  const handleCancelNameChange = () => {
      setShowNameChangeConfirm(false);
      setPendingNameChange(null);
  };

  const closeParticipantsModal = () => {
      setShowParticipantsModal(false);
      setParticipantModalView('list');
      setParticipantSearchTerm('');
      setAccommodationFilter('all');
      setPhotoConsentFilter('all');
      setStoreConsentFilter('all');
      setEditingRole(null);
      resetParticipantForm();
  };

  const initiateRemoveParticipant = (participantId: number) => {
      setParticipantToDelete(participantId);
  };

  const confirmRemoveParticipant = async () => {
      if (!selectedEvent || !participantToDelete) return;
      
      const removedRecord = viewingParticipants.find((record) => record.participant_id === participantToDelete) || null;
      setIsDeleting(true);
      try {
          // Attempt to delete. DB constraints might prevent this if attendance logs exist and cascade isn't set.
          // Ideally, we would delete attendance logs first or handle the error.
          const { data: removedAttendance } = await supabase
            .from('attendance_logs')
            .delete()
            .eq('event_id', selectedEvent.event_id)
            .eq('participant_id', participantToDelete)
            .select('attendance_id');

          const { error } = await supabase
            .from('event_participants')
            .delete()
            .eq('event_id', selectedEvent.event_id)
            .eq('participant_id', participantToDelete);

          if (error) throw error;

          logAudit({
              actor: user,
              action: 'Delete',
              entityType: 'EventParticipant',
              entityId: participantToDelete,
              entityLabel: removedRecord?.participants?.full_name ?? null,
              eventId: selectedEvent.event_id,
              eventName: selectedEvent.event_name,
              snapshot: {
                  ...(sanitizeSnapshot(removedRecord) || {}),
                  // Removing a registration also discards that person's scans for
                  // this event; record how many so the loss is visible in the trail.
                  attendance_logs_deleted: removedAttendance?.length ?? 0
              }
          });

          // Refresh happens via realtime subscription or we can force it
          fetchEventParticipants(selectedEvent.event_id);
          setParticipantToDelete(null); // Close modal
      } catch (err: any) {
          toast.error("Error removing participant: " + err.message);
      } finally {
          setIsDeleting(false);
      }
  };

  const handleUpdateRole = async () => {
      if (!editingRole || !selectedEvent) return;

      const previousRecord = viewingParticipants.find((record) => record.participant_id === editingRole.participantId) || null;

      // delegate_type is constrained to Delegate rows, so moving off Delegate must clear it.
      const nextChanges = {
          role: editingRole.role,
          delegate_type: selectedEvent.has_principal_delegates
              ? delegateTypeForRole(editingRole.role, editingRole.delegate_type)
              : null
      };

      try {
          const { error } = await supabase
              .from('event_participants')
              .update(nextChanges)
              .eq('event_id', selectedEvent.event_id)
              .eq('participant_id', editingRole.participantId);

          if (error) throw error;

          logAudit({
              actor: user,
              action: 'Update',
              entityType: 'EventParticipant',
              entityId: editingRole.participantId,
              entityLabel: previousRecord?.participants?.full_name ?? null,
              eventId: selectedEvent.event_id,
              eventName: selectedEvent.event_name,
              changes: diffRecords(previousRecord, nextChanges)
          });

          setEditingRole(null);
          // fetchEventParticipants triggered by subscription
      } catch (err: any) {
          toast.error("Error updating role: " + err.message);
      }
  };

  const handleNameChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'f_name' | 'l_name') => {
    const value = e.target.value;
    const shouldSearchExistingParticipants = participantModalView === 'add';

    if (selectedParticipantName && participantModalView === 'add') {
        const originalValue = selectedParticipantName[field];
        if (value !== originalValue) {
            setPendingNameChange({ field, value });
            setShowNameChangeConfirm(true);
            return;
        }
    }

    setNewParticipant(prev => ({
        ...prev,
        [field]: value,
        participant_id: shouldSearchExistingParticipants ? null : prev.participant_id
    }));

    if (!shouldSearchExistingParticipants) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
    }

    if (value.length >= 2) {
        const { data } = await supabase
            .from('participants')
            .select('*')
            .ilike('full_name', `%${value}%`)
            .limit(5);

        if (data && data.length > 0) {
            setSuggestions(data);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    } else {
        setSuggestions([]);
        setShowSuggestions(false);
    }
  };

  const selectSuggestion = (p: Participant) => {
      let affType: 'Office' | 'LGU' = 'Office';
      let prov = '';
      let city = '';
      let locId = p.location_id || null;

      if (locId && locations.length > 0) {
          const loc = locations.find(l => l.location_id === locId);
          if (loc) {
              affType = 'LGU';
              prov = loc.province_huc;
              city = loc.city_mun || '';
          }
      }

      setAffiliationType(affType);
      setSelectedProvince(prov);
      setSelectedCity(city);

      setNewParticipant(prev => ({
          ...prev,
          f_name: p.f_name || '',
          l_name: p.l_name || '',
          m_initial: p.m_initial || '',
          suffix: p.suffix || '',
          full_name: p.full_name || '',
          email: p.email || '',
          office: p.office || '',
          mobile_no: p.mobile_no || '',
          position: p.position || '',
          gender: p.gender || '',
          age_group: p.age_group || '18-24',
          pwd: p.pwd || 'No',
          indigenous_people: p.indigenous_people || 'No',
          participant_id: p.participant_id
      }));
      setSelectedParticipantName({ f_name: p.f_name || '', l_name: p.l_name || '' });
      setSelectedExistingParticipant(p);
      setSuggestions([]);
      setShowSuggestions(false);
  };
  
  const toProperCase = (str: string) => {
    const lowerStr = str.toLowerCase();
    const parts = lowerStr.split('-');

    // Known Filipino/indigenous particle suffixes that shouldn't be capitalized
    const particles = ['a', 'an', 'om', 'ay', 'in', 'oy', 'on', 'ud'];

    return parts
      .map((part, index) => {
        // First part always capitalize, or if not a known particle
        if (index === 0 || !particles.includes(part)) {
          return part.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
        return part; // Keep known particles lowercase
      })
      .join('-');
  };

  const formatSuffix = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^[ivx]+$/i.test(trimmed)) return trimmed.toUpperCase();
    return toProperCase(trimmed);
  };

  const buildParticipantSubmission = () => {
      if (!selectedEvent) return null;
      const availableAccommodationDates = getSelectedEventAccommodationDates(selectedEvent);

      let finalLocationId = null as number | null;
      let finalOfficeName = newParticipant.office.trim();

      if (affiliationType === 'LGU') {
          if (!selectedProvince) {
              toast.error("Please select a Province/HUC for LGU.");
              return null;
          }
          
          if (selectedCity) {
              const loc = locations.find(l => l.province_huc === selectedProvince && l.city_mun === selectedCity);
              if (loc) {
                  finalLocationId = loc.location_id;
                  finalOfficeName = `LGU ${selectedCity}, ${selectedProvince}`;
              } else {
                  toast.error("Selected location is invalid.");
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
      } else if (!newParticipant.office.trim()) {
          toast.error("Please enter your Office / Agency name.");
          return null;
      }

      if (newParticipant.gender !== 'Male' && newParticipant.gender !== 'Female') {
          toast.error("Please select a gender (Male or Female).");
          return null;
      }

      const trimmedEmail = newParticipant.email.trim();
      if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          toast.error("Please enter a valid email address.");
          return null;
      }

      if (newParticipant.mobile_no && !/^[0-9]{10,11}$/.test(newParticipant.mobile_no)) {
          toast.error("Please enter a valid mobile number (10 or 11 digits).");
          return null;
      }

      const suffixTrimmed = newParticipant.suffix.trim().toLowerCase();
      if (suffixTrimmed && ['none', 'n/a', 'na'].includes(suffixTrimmed)) {
          toast.error("Not a valid Suffix.");
          return null;
      }

      if (selectedEvent.has_accommodation && newParticipant.needs_accommodation && newParticipant.accommodation_pax < 1) {
          toast.error("Please specify at least 1 pax for accommodation.");
          return null;
      }

      const normalizedAccommodationDates = selectedEvent.has_accommodation && newParticipant.needs_accommodation
        ? (() => {
            const selectedDates = (newParticipant.date_accommodation || []).filter((date) => availableAccommodationDates.includes(date));
            if (availableAccommodationDates.length === 1 && selectedDates.length === 0) {
                return [availableAccommodationDates[0]];
            }
            return selectedDates;
          })()
        : [];

      if (selectedEvent.has_accommodation && newParticipant.needs_accommodation && normalizedAccommodationDates.length === 0) {
          toast.error("Please select at least one accommodation date.");
          return null;
      }

      // Giveaways: validate required selections and keep only answers for items this event defines.
      // When giveaway selection is closed, skip required checks — it can no longer be chosen.
      const giveawaysClosed = selectedEvent.giveaways_open === false;
      const eventGiveaways = selectedEvent.giveaways || [];
      const normalizedGiveawaySelections: Record<string, string | boolean> = {};
      for (const item of eventGiveaways) {
          const value = newParticipant.giveaway_selections[item.key];
          if (item.type === 'single-select') {
              if (item.required && !value && !giveawaysClosed) {
                  toast.error(`Please select ${item.label}.`);
                  return null;
              }
              if (value) normalizedGiveawaySelections[item.key] = value;
          } else if (item.type === 'boolean') {
              normalizedGiveawaySelections[item.key] = !!value;
          }
      }

      return {
          participantPayload: {
              f_name: toProperCase(newParticipant.f_name.trim()),
              l_name: toProperCase(newParticipant.l_name.trim()),
              m_initial: newParticipant.m_initial.trim() === '' ? null : newParticipant.m_initial.trim().toUpperCase(),
              suffix: newParticipant.suffix.trim() === '' ? null : formatSuffix(newParticipant.suffix.trim()),
              email: trimmedEmail || null,
              office: finalOfficeName,
              location_id: finalLocationId,
              mobile_no: newParticipant.mobile_no || null,
              position: newParticipant.position.trim() || 'N/A',
              gender: newParticipant.gender,
              age_group: newParticipant.age_group,
              pwd: newParticipant.pwd,
              indigenous_people: newParticipant.indigenous_people
          },
          eventParticipantPayload: {
              role: newParticipant.role,
              delegate_type: selectedEvent.has_principal_delegates
                ? delegateTypeForRole(newParticipant.role, newParticipant.delegate_type)
                : null,
              needs_accommodation: selectedEvent.has_accommodation ? newParticipant.needs_accommodation : false,
              accommodation_pax: selectedEvent.has_accommodation && newParticipant.needs_accommodation ? Math.max(1, newParticipant.accommodation_pax) : 0,
              accept_photo_video: newParticipant.accept_photo_video,
              store_to_db: newParticipant.store_to_db,
              need_ca: newParticipant.need_ca,
              date_accommodation: selectedEvent.has_accommodation && newParticipant.needs_accommodation ? normalizedAccommodationDates : null,
              giveaway_selections: normalizedGiveawaySelections
          }
      };
  };

  const openAddParticipantView = () => {
      resetParticipantForm();
      setEditingRole(null);
      setParticipantModalView('add');
  };

  const openEditParticipantView = (record: ParticipantModalRecord) => {
      const participant = record.participants;
      if (!participant) return;
      const availableAccommodationDates = getSelectedEventAccommodationDates(selectedEvent);
      const normalizedAccommodationDates = (record.date_accommodation || []).filter((date) => availableAccommodationDates.includes(date));
      const defaultAccommodationDates = record.needs_accommodation && availableAccommodationDates.length === 1 && normalizedAccommodationDates.length === 0
        ? [availableAccommodationDates[0]]
        : normalizedAccommodationDates;

      let affType: 'Office' | 'LGU' = 'Office';
      let prov = '';
      let city = '';

      if (participant.location_id && locations.length > 0) {
          const loc = locations.find(l => l.location_id === participant.location_id);
          if (loc) {
              affType = 'LGU';
              prov = loc.province_huc;
              city = loc.city_mun || '';
          }
      }

      setEditingRole(null);
      setEditingParticipantRecord(record);
      setAffiliationType(affType);
      setSelectedProvince(prov);
      setSelectedCity(city);
      setSuggestions([]);
      setShowSuggestions(false);
      setNewParticipant({
          f_name: participant.f_name || '',
          l_name: participant.l_name || '',
          m_initial: participant.m_initial || '',
          suffix: participant.suffix || '',
          full_name: participant.full_name || '',
          email: participant.email || '',
          role: record.role || 'Delegate',
          delegate_type: readDelegateType(record.role, record.delegate_type) || '',
          office: participant.office || '',
          mobile_no: participant.mobile_no || '',
          position: participant.position || '',
          gender: participant.gender || '',
          age_group: participant.age_group || '18-24',
          pwd: participant.pwd || 'No',
          indigenous_people: participant.indigenous_people || 'No',
          needs_accommodation: !!record.needs_accommodation,
          accommodation_pax: record.needs_accommodation ? Math.max(1, record.accommodation_pax || 1) : 0,
          date_accommodation: defaultAccommodationDates,
          participant_id: participant.participant_id,
          accept_photo_video: !!record.accept_photo_video,
          store_to_db: !!record.store_to_db,
          need_ca: !!record.need_ca,
          giveaway_selections: record.giveaway_selections || {}
      });
      setParticipantModalView('edit');
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedEvent) return;
      const submission = buildParticipantSubmission();
      if (!submission) return;

      setIsAddingParticipant(true);
      
      try {
          // 1. Check or Create Participant
          let participantId: number;
          
          if (newParticipant.participant_id) {
             participantId = newParticipant.participant_id;
             // Optional: Update participant details if changed
             const { error: updateError } = await supabase
                .from('participants')
                .update(submission.participantPayload)
                .eq('participant_id', participantId);

             if (updateError) throw updateError;

             logAudit({
                 actor: user,
                 action: 'Update',
                 entityType: 'Participant',
                 entityId: participantId,
                 entityLabel: formatParticipantOfficialName(submission.participantPayload),
                 eventId: selectedEvent.event_id,
                 eventName: selectedEvent.event_name,
                 changes: diffRecords(selectedExistingParticipant, submission.participantPayload)
             });

          } else if (submission.participantPayload.email) {
               // Full row (not just the id) so an update here can be diffed for the audit trail.
               const { data: existingUser } = await supabase
                .from('participants')
                .select('*')
                .eq('email', submission.participantPayload.email)
                .single();

               if (existingUser) {
                   participantId = existingUser.participant_id;
                   // Update details
                   const { error: updateError } = await supabase
                    .from('participants')
                    .update(submission.participantPayload)
                    .eq('participant_id', participantId);

                   if (updateError) throw updateError;

                   logAudit({
                       actor: user,
                       action: 'Update',
                       entityType: 'Participant',
                       entityId: participantId,
                       entityLabel: formatParticipantOfficialName(submission.participantPayload),
                       eventId: selectedEvent.event_id,
                       eventName: selectedEvent.event_name,
                       changes: diffRecords(existingUser, submission.participantPayload)
                   });
               } else {
                   // Create
                    const { data: newUser, error: createError } = await supabase
                    .from('participants')
                    .insert([submission.participantPayload])
                    .select()
                    .single();
                    if(createError) throw createError;
                    participantId = newUser.participant_id;
               }
          } else {
               // Create (No Email provided)
               const { data: newUser, error: createError } = await supabase
                .from('participants')
                .insert([submission.participantPayload])
                .select()
                .single();
                if(createError) throw createError;
                participantId = newUser.participant_id;
          }

          // 2. Register
          const { error: regError } = await supabase
            .from('event_participants')
            .insert({
                event_id: selectedEvent.event_id,
                participant_id: participantId,
                registration_status: 'Registered',
                ...submission.eventParticipantPayload
            });

          if (regError && regError.code !== '23505') throw regError;

          // 3. Optionally auto-log attendance when registering on the day of the event.
          // The logged-in user acts as the "scanner" and the device is recorded as Web.
          if (logAttendanceOnRegister && user && isTodayEventDay(selectedEvent)) {
              try {
                  const session = getRegistrationAttendanceSession(selectedEvent);
                  const attendanceDate = format(new Date(), 'yyyy-MM-dd');

                  const { data: existingLog } = await supabase
                    .from('attendance_logs')
                    .select('attendance_id')
                    .eq('event_id', selectedEvent.event_id)
                    .eq('participant_id', participantId)
                    .eq('attendance_date', attendanceDate)
                    .eq('action_session', session)
                    .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES])
                    .order('attendance_id', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                  if (!existingLog) {
                      const { error: attendanceError } = await supabase
                        .from('attendance_logs')
                        .insert({
                            event_id: selectedEvent.event_id,
                            participant_id: participantId,
                            user_id: user.user_id,
                            attendance_date: attendanceDate,
                            scan_time: new Date().toISOString(),
                            action_session: session,
                            scan_status: 'Valid',
                            remarks: `Auto-logged on registration (${session})`,
                            scanner_device: 'Web'
                        });

                      if (attendanceError) throw attendanceError;
                      toast.success(`${session} attendance logged for today.`);
                  } else {
                      toast.info(`${session} attendance was already logged for today.`);
                  }
              } catch (attendanceErr: any) {
                  // Registration already succeeded; surface attendance issue without failing the whole flow.
                  toast.error('Participant registered, but attendance logging failed: ' + attendanceErr.message);
              }
          }

          // 4. Optionally email the participant their QR code.
          if (sendQrOnRegister && canSendQrEmail) {
              const qrResult = await sendParticipantQrById(
                  participantId,
                  selectedEvent,
                  formatEventDate(selectedEvent.start_date, selectedEvent.end_date)
              );

              if (qrResult.success) {
                  toast.success('QR code emailed to participant.');
              } else if (qrResult.skipped) {
                  toast.info('QR code not emailed — participant has no email address.');
              } else {
                  toast.error('Participant registered, but QR email failed: ' + qrResult.error);
              }
          }

          // Success
          setParticipantModalView('list');
          resetParticipantForm();
          fetchEventParticipants(selectedEvent.event_id);

      } catch (err: any) {
          toast.error("Error adding participant: " + err.message);
      } finally {
          setIsAddingParticipant(false);
      }
  };

  const handleUpdateParticipantDetails = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedEvent || !editingParticipantRecord) return;

      const submission = buildParticipantSubmission();
      if (!submission) return;

      setIsAddingParticipant(true);

      const participantLabel = formatParticipantOfficialName(submission.participantPayload);

      try {
          const { error: participantError } = await supabase
            .from('participants')
            .update(submission.participantPayload)
            .eq('participant_id', editingParticipantRecord.participant_id);

          if (participantError) throw participantError;

          // The participant profile and their registration for this event are
          // separate records, so they get one audit row each — either can be
          // skipped when its own fields did not change.
          logAudit({
              actor: user,
              action: 'Update',
              entityType: 'Participant',
              entityId: editingParticipantRecord.participant_id,
              entityLabel: participantLabel,
              eventId: selectedEvent.event_id,
              eventName: selectedEvent.event_name,
              changes: diffRecords(editingParticipantRecord.participants, submission.participantPayload)
          });

          const { error: registrationError } = await supabase
            .from('event_participants')
            .update(submission.eventParticipantPayload)
            .eq('event_id', selectedEvent.event_id)
            .eq('participant_id', editingParticipantRecord.participant_id);

          if (registrationError) throw registrationError;

          logAudit({
              actor: user,
              action: 'Update',
              entityType: 'EventParticipant',
              entityId: editingParticipantRecord.participant_id,
              entityLabel: participantLabel,
              eventId: selectedEvent.event_id,
              eventName: selectedEvent.event_name,
              changes: diffRecords(editingParticipantRecord, submission.eventParticipantPayload)
          });

          setParticipantModalView('list');
          resetParticipantForm();
          fetchEventParticipants(selectedEvent.event_id);
      } catch (err: any) {
          toast.error("Error updating participant: " + err.message);
      } finally {
          setIsAddingParticipant(false);
      }
  };

  const getRegistrationLink = (eventId: number) => {
      // Determine base URL, assuming the events page is at /events
      const baseUrl = window.location.href.split('/events')[0];
      return `${baseUrl}/register/${eventId}`;
  };

  const copyToClipboard = () => {
      if (!selectedEvent) return;
      navigator.clipboard.writeText(getRegistrationLink(selectedEvent.event_id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const downloadRegistrationBadge = async () => {
      if (!selectedEvent) return;

      const svgElement = qrCodeRef.current?.querySelector('svg');
      if (!svgElement) {
          toast.error('Unable to generate badge. Please try again.');
          return;
      }

      setDownloadingBadge(true);
      try {
          const link = getRegistrationLink(selectedEvent.event_id);
          const eventName = selectedEvent.event_name || 'Event';

          // ── Geometry (CSS px, rendered at `scale` so the A4 page stays ~260dpi) ──
          const scale = 4;
          const W = 468;                 // card width
          const PAD = 44;                // horizontal gutter
          const CONTENT_W = W - PAD * 2; // 380
          const TOP_BAR = 8;             // red rule across the top of the card
          const QR_BOX = 172;            // outer size of the framed QR block
          const QR_FRAME = 2;            // frame stroke
          const QR_PAD = 10;             // quiet space between frame and QR
          const QR_INNER = QR_BOX - (QR_FRAME + QR_PAD) * 2;

          const INK = '#201e1d';
          const RED = '#ec3013';
          const BADGE_BRAND = 'DILG REGION X';
          const MUTED = '#6a6867';
          const SOFT = '#d8d6d5';
          const FONT_STACK = 'Archivo, Inter, "Segoe UI", Arial, sans-serif';
          const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_STACK}`;

          // Archivo is web-loaded; canvas will silently fall back unless it is ready
          if (document.fonts) {
              try {
                  await Promise.all([
                      document.fonts.load(font(500, 14)),
                      document.fonts.load(font(700, 14)),
                      document.fonts.load(font(800, 19)),
                  ]);
              } catch {
                  /* fall back to the rest of the stack */
              }
          }

          // Render the QR SVG into an image at final device resolution so it stays sharp
          const svgClone = svgElement.cloneNode(true) as SVGElement;
          svgClone.setAttribute('width', String(QR_INNER * scale));
          svgClone.setAttribute('height', String(QR_INNER * scale));
          const svgString = new XMLSerializer().serializeToString(svgClone);
          const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const svgUrl = URL.createObjectURL(svgBlob);

          const qrImage = new Image();
          await new Promise<void>((resolve, reject) => {
              qrImage.onload = () => resolve();
              qrImage.onerror = () => reject(new Error('Failed to load QR code image'));
              qrImage.src = svgUrl;
          });

          // DILG seal drawn into the center of the QR (the on-screen logo is an
          // overlay <img>, not part of the SVG, so it must be loaded separately)
          const logoImage = new Image();
          await new Promise<void>((resolve, reject) => {
              logoImage.onload = () => resolve();
              logoImage.onerror = () => reject(new Error('Failed to load logo image'));
              logoImage.src = '/assets/dilg_logo.png';
          });

          const eventDate = formatEventDate(selectedEvent.start_date, selectedEvent.end_date);
          const venue = (selectedEvent.venue || '').trim() || 'To be announced';

          // ── Measurement pass: line breaks decide the card height ──
          const measureCtx = document.createElement('canvas').getContext('2d');
          if (!measureCtx) throw new Error('Canvas not supported');

          const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
              const words = text.split(/\s+/).filter(Boolean);
              const lines: string[] = [];
              let current = '';
              for (const word of words) {
                  const test = current ? `${current} ${word}` : word;
                  if (ctx.measureText(test).width > maxWidth && current) {
                      lines.push(current);
                      current = word;
                  } else {
                      current = test;
                  }
              }
              if (current) lines.push(current);
              return lines.length ? lines : [''];
          };

          // Approximates CSS `text-wrap: balance` — the narrowest width that still
          // wraps into the same number of lines gives evenly filled rows.
          const balanceText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
              const greedy = wrapText(ctx, text, maxWidth);
              if (greedy.length < 2) return greedy;
              let lo = 0;
              let hi = maxWidth;
              let best = greedy;
              for (let i = 0; i < 24; i++) {
                  const mid = (lo + hi) / 2;
                  const candidate = wrapText(ctx, text, mid);
                  if (candidate.length <= greedy.length) {
                      best = candidate;
                      hi = mid;
                  } else {
                      lo = mid;
                  }
              }
              return best;
          };

          const trackedWidth = (ctx: CanvasRenderingContext2D, text: string, tracking: number) => {
              const chars = Array.from(text);
              if (!chars.length) return 0;
              return chars.reduce((w, ch) => w + ctx.measureText(ch).width + tracking, 0) - tracking;
          };

          const VALUE_X = PAD + 74 + 16;                 // label column + gutter
          const VALUE_W = W - PAD - VALUE_X;
          const RIGHT_X = PAD + QR_BOX + 24;             // caption column beside the QR
          const RIGHT_W = W - PAD - RIGHT_X;
          const TITLE_SIZE = 19;
          const TITLE_LH = 21;
          const VALUE_LH = 19;
          const CAPTION_LH = 20;
          const SCAN_COPY = 'Point your phone camera at the code to open your registration form.';

          measureCtx.font = font(800, TITLE_SIZE);
          const titleLines = balanceText(measureCtx, eventName.toUpperCase(), CONTENT_W);
          measureCtx.font = font(500, 14);
          const venueLines = wrapText(measureCtx, venue, VALUE_W);
          measureCtx.font = font(700, 14);
          const dateLines = wrapText(measureCtx, eventDate, VALUE_W);
          measureCtx.font = font(500, 13);
          const scanLines = wrapText(measureCtx, SCAN_COPY, RIGHT_W);

          // ── Vertical rhythm: every offset below is also used when drawing ──
          let y = TOP_BAR + 36;
          const kickerY = y;
          y += 12 + 20;
          const titleY = y;
          y += titleLines.length * TITLE_LH + 22;
          const inkRuleY = y;
          y += 2 + 24;
          const venueRowY = y;
          y += venueLines.length * VALUE_LH + 14;
          const dateRowY = y;
          y += dateLines.length * VALUE_LH + 28;
          const softRuleY = y;
          y += 2 + 28;
          const qrTop = y;
          y += QR_BOX + 22;
          const footRuleY = y;
          y += 2 + 15;
          const footTextY = y;
          const H = y + 14 + 15;

          const canvas = document.createElement('canvas');
          canvas.width = W * scale;
          canvas.height = H * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas not supported');
          ctx.scale(scale, scale);
          ctx.textBaseline = 'top';
          ctx.textAlign = 'left';

          // Letter-spaced runs (canvas has no reliable tracking across browsers)
          const drawTracked = (text: string, x: number, top: number, tracking: number, align: 'left' | 'right' = 'left') => {
              const chars = Array.from(text);
              let cursor = align === 'right' ? x - trackedWidth(ctx, text, tracking) : x;
              for (const ch of chars) {
                  ctx.fillText(ch, cursor, top);
                  cursor += ctx.measureText(ch).width + tracking;
              }
          };

          // Card
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, W, H);

          // Accent rule across the top
          ctx.fillStyle = RED;
          ctx.fillRect(0, 0, W, TOP_BAR);

          // Kicker
          ctx.fillStyle = RED;
          ctx.font = font(800, 12);
          drawTracked('EVENT REGISTRATION', PAD, kickerY, 12 * 0.22);

          // Event name
          ctx.fillStyle = INK;
          ctx.font = font(800, TITLE_SIZE);
          titleLines.forEach((line, i) => ctx.fillText(line, PAD, titleY + i * TITLE_LH));

          // Heavy rule under the name
          ctx.fillRect(PAD, inkRuleY, CONTENT_W, 2);

          // Venue / Date table
          const drawMetaRow = (label: string, lines: string[], top: number, valueWeight: number) => {
              ctx.fillStyle = RED;
              ctx.font = font(800, 11);
              drawTracked(label, PAD, top + 3, 11 * 0.14);
              ctx.fillStyle = INK;
              ctx.font = font(valueWeight, 14);
              lines.forEach((line, i) => ctx.fillText(line, VALUE_X, top + i * VALUE_LH));
          };
          drawMetaRow('VENUE', venueLines, venueRowY, 500);
          drawMetaRow('DATE', dateLines, dateRowY, 700);

          // Hairline above the QR block
          ctx.fillStyle = SOFT;
          ctx.fillRect(PAD, softRuleY, CONTENT_W, 2);

          // Framed QR block
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(PAD, qrTop, QR_BOX, QR_BOX);
          ctx.strokeStyle = INK;
          ctx.lineWidth = QR_FRAME;
          ctx.strokeRect(PAD + QR_FRAME / 2, qrTop + QR_FRAME / 2, QR_BOX - QR_FRAME, QR_BOX - QR_FRAME);

          const qrX = PAD + QR_FRAME + QR_PAD;
          const qrY = qrTop + QR_FRAME + QR_PAD;
          ctx.drawImage(qrImage, qrX, qrY, QR_INNER, QR_INNER);

          // DILG seal in the center, with a thin white circular border (matches UI)
          const logoSize = QR_INNER * 0.25;
          const ringPadding = QR_INNER * 0.018;
          const logoCenterX = qrX + QR_INNER / 2;
          const logoCenterY = qrY + QR_INNER / 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(logoCenterX, logoCenterY, logoSize / 2 + ringPadding, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(logoCenterX, logoCenterY, logoSize / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(logoImage, logoCenterX - logoSize / 2, logoCenterY - logoSize / 2, logoSize, logoSize);
          ctx.restore();

          // Caption column, optically centered against the QR frame
          const captionH = 13 + 8 + scanLines.length * CAPTION_LH;
          const captionY = qrTop + (QR_BOX - captionH) / 2;
          ctx.fillStyle = INK;
          ctx.font = font(800, 12);
          drawTracked('SCAN TO REGISTER', RIGHT_X, captionY, 12 * 0.14);
          ctx.fillStyle = MUTED;
          ctx.font = font(500, 13);
          scanLines.forEach((line, i) => ctx.fillText(line, RIGHT_X, captionY + 21 + i * CAPTION_LH));

          // Footer: registration link on the left, wordmark on the right
          ctx.fillStyle = INK;
          ctx.fillRect(0, footRuleY, W, 2);

          ctx.font = font(800, 11);
          const brandTracking = 11 * 0.14;
          const brandW = trackedWidth(ctx, BADGE_BRAND, brandTracking);
          ctx.fillStyle = RED;
          drawTracked(BADGE_BRAND, W - PAD, footTextY + 1, brandTracking, 'right');

          // The scheme is dropped so the link stays readable next to the wordmark
          ctx.fillStyle = INK;
          ctx.font = font(600, 12);
          let footLink = link.replace(/^https?:\/\//i, '');
          const maxLinkW = CONTENT_W - brandW - 16;
          if (ctx.measureText(footLink).width > maxLinkW) {
              while (footLink.length > 1 && ctx.measureText(`${footLink}…`).width > maxLinkW) {
                  footLink = footLink.slice(0, -1);
              }
              footLink = `${footLink}…`;
          }
          ctx.fillText(footLink, PAD, footTextY);

          URL.revokeObjectURL(svgUrl);

          // A4 portrait, card scaled to the printable area and centered
          const pdfBlob = await canvasToPdfBlob(canvas, { ...PAGE_SIZES.A4, marginPt: 36 });

          // Trigger download
          const safeName = eventName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'event';
          const pdfUrl = URL.createObjectURL(pdfBlob);
          const downloadLink = document.createElement('a');
          downloadLink.href = pdfUrl;
          downloadLink.download = `${safeName}_registration_badge.pdf`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000);

          toast.success('Badge PDF downloaded.');
      } catch (err: any) {
          toast.error('Error generating badge: ' + (err?.message || 'Unknown error'));
      } finally {
          setDownloadingBadge(false);
      }
  };

  const exportParticipantsToExcel = async () => {
      if (!selectedEvent || viewingParticipants.length === 0) return;

      const sorted = [...viewingParticipants].sort((a, b) => {
          const aTime = a.registered_at ? new Date(a.registered_at).getTime() : Number.POSITIVE_INFINITY;
          const bTime = b.registered_at ? new Date(b.registered_at).getTime() : Number.POSITIVE_INFINITY;
          return aTime - bTime;
      });

      const includeAccommodation = !!selectedEvent.has_accommodation;
      const includeDelegateType = !!selectedEvent.has_principal_delegates;
      const giveaways = selectedEvent.giveaways || [];

      const formatGiveawayValue = (item: GiveawayItem, selections: Record<string, string | boolean> | null) => {
          const value = selections?.[item.key];
          if (item.type === 'boolean') return value ? 'Yes' : 'No';
          return (value as string) || '';
      };

      // Excel table column names must be unique — dedupe giveaway labels against fixed headers.
      const usedColumnNames = new Set(['Participant Name', 'Gender', 'Position', 'Office', 'Age Group', 'Mobile Number', 'Email', 'Role', 'Delegate Type', 'Accommodation', 'Photo/Video', 'Data Storage']);
      const giveawayHeaders = giveaways.map((g) => {
          const base = g.label || 'Giveaway';
          let name = base;
          let suffix = 2;
          while (usedColumnNames.has(name)) {
              name = `${base} (${suffix++})`;
          }
          usedColumnNames.add(name);
          return name;
      });

      const rows = sorted.map((record) => [
          record.participants?.full_name || '',
          record.participants?.gender || '',
          record.participants?.position || '',
          record.participants?.office || '',
          record.participants?.age_group || '',
          record.participants?.mobile_no || '',
          record.participants?.email || '',
          record.role || 'Delegate',
          ...(includeDelegateType ? [readDelegateType(record.role, record.delegate_type) || ''] : []),
          ...(includeAccommodation ? [record.needs_accommodation ? 'Yes' : 'No'] : []),
          ...giveaways.map((g) => formatGiveawayValue(g, record.giveaway_selections)),
          record.accept_photo_video ? 'Yes' : 'No',
          record.store_to_db ? 'Yes' : 'No'
      ]);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Participants');

      worksheet.addTable({
          name: 'Participants',
          ref: 'A1',
          headerRow: true,
          totalsRow: false,
          style: {
              theme: 'TableStyleMedium2',
              showRowStripes: true
          },
          columns: [
              { name: 'Participant Name', filterButton: true },
              { name: 'Gender', filterButton: true },
              { name: 'Position', filterButton: true },
              { name: 'Office', filterButton: true },
              { name: 'Age Group', filterButton: true },
              { name: 'Mobile Number', filterButton: true },
              { name: 'Email', filterButton: true },
              { name: 'Role', filterButton: true },
              ...(includeDelegateType ? [{ name: 'Delegate Type', filterButton: true }] : []),
              ...(includeAccommodation ? [{ name: 'Accommodation', filterButton: true }] : []),
              ...giveawayHeaders.map((name) => ({ name, filterButton: true })),
              { name: 'Photo/Video', filterButton: true },
              { name: 'Data Storage', filterButton: true }
          ],
          rows
      });

      [32, 10, 28, 34, 12, 16, 30, 14, ...(includeDelegateType ? [16] : []), ...(includeAccommodation ? [14] : []), ...giveaways.map(() => 16), 14, 14].forEach((w, idx) => {
          worksheet.getColumn(idx + 1).width = w;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const safeName = (selectedEvent.event_name || 'Event').replace(/[\\/:*?"<>|]/g, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `Participants_${safeName}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  // Filtered Participants
  const filteredParticipants = useMemo(() => {
    const lower = participantSearchTerm.trim().toLowerCase();
    let matched = lower
      ? viewingParticipants.filter(p =>
          p.participants?.full_name?.toLowerCase().includes(lower) ||
          p.participants?.email?.toLowerCase().includes(lower) ||
          p.participants?.position?.toLowerCase().includes(lower) ||
          p.participants?.office?.toLowerCase().includes(lower)
        )
      : viewingParticipants;

    if (accommodationFilter === 'with') {
      matched = matched.filter(p => p.needs_accommodation);
    }

    if (photoConsentFilter === 'declined') {
      matched = matched.filter(p => !p.accept_photo_video);
    }

    if (storeConsentFilter === 'declined') {
      matched = matched.filter(p => !p.store_to_db);
    }

    if (delegateTypeFilter !== 'all') {
      matched = matched.filter(p => readDelegateType(p.role, p.delegate_type) === delegateTypeFilter);
    }

    return [...matched].sort((a, b) => {
      const aTime = a.registered_at ? new Date(a.registered_at).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.registered_at ? new Date(b.registered_at).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
  }, [viewingParticipants, participantSearchTerm, accommodationFilter, photoConsentFilter, storeConsentFilter, delegateTypeFilter]);

  // Grouping Logic
  const specialRoles = ['Speaker', 'Secretariat', 'VIP', 'Guest'];
  const specialParticipants = filteredParticipants.filter(p => specialRoles.includes(p.role));
  const delegateParticipants = filteredParticipants.filter(p => p.role === 'Delegate');

  // Stats Logic
  const totalCount = viewingParticipants.length;
  const delegateCount = viewingParticipants.filter(p => p.role === 'Delegate').length;
  const needsAccommodationCount = viewingParticipants.filter(p => p.needs_accommodation).length;
  const noPhotoConsentCount = viewingParticipants.filter(p => !p.accept_photo_video).length;
  const noStoreConsentCount = viewingParticipants.filter(p => !p.store_to_db).length;
  const principalCount = viewingParticipants.filter(p => readDelegateType(p.role, p.delegate_type) === 'Principal').length;
  const representativeCount = viewingParticipants.filter(p => readDelegateType(p.role, p.delegate_type) === 'Representative').length;

  // Participant list segmented filter (single-select)
  const activeParticipantFilter =
    accommodationFilter === 'with' ? 'accommodation'
    : photoConsentFilter === 'declined' ? 'noPhoto'
    : storeConsentFilter === 'declined' ? 'noStore'
    : delegateTypeFilter !== 'all' ? delegateTypeFilter
    : 'all';
  const applyParticipantFilter = (value: string) => {
    setAccommodationFilter(value === 'accommodation' ? 'with' : 'all');
    setPhotoConsentFilter(value === 'noPhoto' ? 'declined' : 'all');
    setStoreConsentFilter(value === 'noStore' ? 'declined' : 'all');
    setDelegateTypeFilter(value === 'Principal' || value === 'Representative' ? value : 'all');
  };
  const secretariatCount = viewingParticipants.filter(p => p.role === 'Secretariat').length;
  const speakerCount = viewingParticipants.filter(p => p.role === 'Speaker').length;
  const guestVipCount = viewingParticipants.filter(p => p.role === 'Guest' || p.role === 'VIP').length;
  const canManageParticipants = hasPermission('MANAGE_PARTICIPANTS');
  const canDeleteEvents = hasPermission('DELETE_EVENTS');
  const canEditEventRecord = (event: Event) =>
    eventView === 'active' && hasPermission('MANAGE_EVENTS');
  const canDeleteEventRecord = (event: Event) =>
    isAdmin || (canDeleteEvents && isEventOwnerOffice(user, event));
  const canAssignAccessForSelectedEvent = canSetEventAccess(selectedAccessEvent);
  const activeAssignedUserIds = new Set(
    eventAccessList
      .filter((access) => access.status === 'Active')
      .map((access) => access.user_id)
  );
  const filteredEventAccessUsers = eventAccessUsers.filter((accessUser) => {
    if (accessUser.user_id === user?.user_id || activeAssignedUserIds.has(accessUser.user_id)) return false;

    const normalizedSearch = accessUserSearch.trim().toLowerCase();
    if (!normalizedSearch) return true;

    return (
      accessUser.full_name.toLowerCase().includes(normalizedSearch) ||
      accessUser.username.toLowerCase().includes(normalizedSearch) ||
      Boolean(accessUser.offices?.code?.toLowerCase().includes(normalizedSearch)) ||
      Boolean(accessUser.offices?.name?.toLowerCase().includes(normalizedSearch))
    );
  });
  const selectedAccessUser = selectedAccessUserId
    ? eventAccessUsers.find((accessUser) => accessUser.user_id === Number(selectedAccessUserId)) || null
    : null;

  // Helper for status badges
  const getStatusBadge = (status: string) => {
    const styles = {
      'Ongoing': 'bg-emerald-50 text-emerald-700 border-emerald-100',
      'Scheduled': 'bg-blue-50 text-blue-700 border-blue-100',
      'Completed': 'bg-stone-100 text-stone-600 border-stone-200',
      'Cancelled': 'bg-red-50 text-red-600 border-red-100',
    };

    // @ts-ignore
    const activeStyle = styles[status] || styles['Completed'];

    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border inline-flex items-center gap-1.5 font-mono ${activeStyle}`}>
         {status === 'Ongoing' && <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-500"></span>}
         {status}
      </span>
    );
  };

  // Participant table pieces shared by the grouped sections
  const renderParticipantSectionHeader = (label: string, count: number) => (
    <div className="flex items-center gap-3 mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs font-mono text-slate-400">{count}</span>
    </div>
  );

  const participantTableHead = (
    <thead className="bg-slate-50/70 text-slate-500 text-xs">
      <tr className="border-b border-slate-100">
        <th className="hidden md:table-cell pl-3 sm:pl-4 pr-1 py-3 font-medium w-8 text-center">#</th>
        <th className="px-3 sm:px-4 py-3 font-medium w-[22%]">Name</th>
        <th className="px-4 py-3 font-medium">Role</th>
        <th className="hidden md:table-cell px-4 py-3 font-medium w-20">Gender</th>
        <th className="hidden md:table-cell px-4 py-3 font-medium w-[20%]">Position</th>
        <th className="hidden md:table-cell px-4 py-3 font-medium w-[24%]">Office</th>
        <th className="hidden lg:table-cell px-4 py-3 font-medium w-28">Registered</th>
        {canManageParticipants && <th className="px-4 sm:px-6 py-3 font-medium text-right">Action</th>}
      </tr>
    </thead>
  );

  const renderParticipantRow = (record: ParticipantModalRecord, index: number) => {
    const isEditing = editingRole?.participantId === record.participant_id;
    const recordDelegateType = selectedEvent?.has_principal_delegates
      ? readDelegateType(record.role, record.delegate_type)
      : null;
    return (
      <tr
        key={record.id}
        className={`hover:bg-slate-50/60 ${recordDelegateType === 'Principal' ? 'border-l-2 border-amber-400 bg-amber-50/40' : ''}`}
      >
        <td className="hidden md:table-cell pl-3 sm:pl-4 pr-1 py-3 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
        <td className="px-3 sm:px-4 py-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-slate-800 truncate">{record.participants?.full_name}</span>
            {record.needs_accommodation && (
              <span
                className="shrink-0 rounded-full bg-purple-100 p-1 text-purple-700"
                title={`Accommodation — ${Math.max(1, record.accommodation_pax || 1)} pax`}
              >
                <Bed size={11} />
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          {isEditing ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <select
                className="min-w-0 text-xs border border-slate-300 rounded p-1 bg-card focus:outline-none focus:border-indigo-500"
                value={editingRole.role}
                onChange={(e) => setEditingRole({ ...editingRole, role: e.target.value })}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="Delegate">Delegate</option>
                <option value="Speaker">Speaker</option>
                <option value="Secretariat">Secretariat</option>
                <option value="Guest">Guest</option>
                <option value="VIP">VIP</option>
              </select>
              {selectedEvent?.has_principal_delegates && editingRole.role === 'Delegate' && (
                <select
                  className="min-w-0 text-xs border border-slate-300 rounded p-1 bg-card focus:outline-none focus:border-amber-500"
                  value={editingRole.delegate_type}
                  onChange={(e) => setEditingRole({ ...editingRole, delegate_type: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  title="Delegate Type"
                >
                  <option value="">Unspecified</option>
                  {DELEGATE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleUpdateRole(); }}
                className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"
                title="Save Role"
              >
                <Save size={16}/>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingRole(null); }}
                className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                title="Cancel Edit"
              >
                <XCircle size={16}/>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getRoleChipClass(record.role)}`}>
                {getRoleChipLabel(record.role)}
              </span>
              {selectedEvent?.has_principal_delegates && recordDelegateType && (
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${DELEGATE_CHIP_CLASS[recordDelegateType]}`}>
                  {recordDelegateType}
                </span>
              )}
              {canManageParticipants && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingRole({ participantId: record.participant_id, role: record.role, delegate_type: recordDelegateType || '' }); }}
                  className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors p-1 rounded"
                  title="Edit Role"
                >
                  <Edit size={12} />
                </button>
              )}
            </div>
          )}
        </td>
        <td className="hidden md:table-cell px-4 py-3 text-slate-600">{record.participants?.gender || '—'}</td>
        <td className="hidden md:table-cell px-4 py-3 text-slate-600">{record.participants?.position || '—'}</td>
        <td className="hidden md:table-cell px-4 py-3 text-slate-600">{record.participants?.office || '—'}</td>
        <td className="hidden lg:table-cell px-4 py-3 text-slate-600 font-mono text-xs">
          {record.registered_at ? format(parseISO(record.registered_at), 'yyyy-MM-dd') : '—'}
        </td>
        {canManageParticipants && (
          <td className="px-4 sm:px-6 py-3 text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => openEditParticipantView(record)}
                className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                title="Edit Participant"
              >
                <Edit size={16} />
              </button>
              <button
                onClick={() => initiateRemoveParticipant(record.participant_id)}
                className="text-slate-400 hover:text-red-600 transition-colors p-1"
                title="Remove Participant"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  };

  // Filtered list for search
  const filteredEvents = useMemo(() => {
    let result = events;
    if (statusFilter !== 'All') {
      result = result.filter(e => e.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(e => 
        e.event_name.toLowerCase().includes(lower) || 
        e.venue.toLowerCase().includes(lower)
      );
    }
    return [...result].sort((a, b) => {
      const statusPriorityDiff =
        (EVENT_STATUS_SORT_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER) -
        (EVENT_STATUS_SORT_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER);

      if (statusPriorityDiff !== 0) {
        return statusPriorityDiff;
      }

      const startDateA = new Date(a.start_date).getTime();
      const startDateB = new Date(b.start_date).getTime();

      if (!Number.isNaN(startDateA) && !Number.isNaN(startDateB) && startDateA !== startDateB) {
        return a.status === 'Completed' ? startDateB - startDateA : startDateA - startDateB;
      }

      return a.event_name.localeCompare(b.event_name);
    });
  }, [events, searchTerm, statusFilter]);

  const eventSummary = useMemo(() => ({
    total: events.length,
    ongoing: events.filter((event) => event.status === 'Ongoing').length,
    scheduled: events.filter((event) => event.status === 'Scheduled').length,
    completed: events.filter((event) => event.status === 'Completed').length,
    cancelled: events.filter((event) => event.status === 'Cancelled').length,
  }), [events]);
  const eventPendingDelete = useMemo(
    () => events.find((event) => event.event_id === eventToDelete) ?? null,
    [events, eventToDelete]
  );
  const actionMenuPlacementClass = actionMenuDirection === 'up'
    ? 'origin-bottom-right'
    : 'origin-top-right';

  const toggleActionMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    eventId: number,
    preferredDirection?: 'up' | 'down'
  ) => {
    e.stopPropagation();

    if (openActionMenuId === eventId) {
      setOpenActionMenuId(null);
      setActionMenuPosition(null);
      return;
    }

    const viewportPadding = 16;
    const activeEvent = events.find((event) => event.event_id === eventId);
    const menuItemCount =
      (activeEvent && canEditEventRecord(activeEvent) ? 1 : 0) +
      (activeEvent && canSetEventAccess(activeEvent) ? 1 : 0) +
      (activeEvent && canDeleteEventRecord(activeEvent) ? 1 : 0);
    const estimatedMenuHeight = (menuItemCount * 44) + 16;
    const estimatedMenuWidth = 208;
    const triggerRect = e.currentTarget.getBoundingClientRect();
    const spaceAbove = triggerRect.top - viewportPadding;
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const direction = preferredDirection || (
      spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove ? 'down' : 'up'
    );
    const top = direction === 'up'
      ? Math.max(viewportPadding, triggerRect.top - estimatedMenuHeight - 8)
      : Math.min(
          window.innerHeight - estimatedMenuHeight - viewportPadding,
          triggerRect.bottom + 8
        );
    const left = Math.min(
      window.innerWidth - estimatedMenuWidth - viewportPadding,
      Math.max(viewportPadding, triggerRect.right - estimatedMenuWidth)
    );

    setActionMenuDirection(direction);
    setActionMenuPosition({ top, left });
    setOpenActionMenuId(eventId);
  };

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const maxPageButtons = useMaxPageButtons();

  // The window slides with the current page rather than paging in fixed blocks, so
  // clicking the last number on screen reveals the pages past it instead of dead-ending.
  const visiblePages = useMemo(() => {
    const count = Math.min(maxPageButtons, totalPages);
    if (count <= 0) return [];
    const firstPage = Math.min(
      Math.max(currentPage - Math.floor((count - 1) / 2), 1),
      Math.max(totalPages - count + 1, 1)
    );
    return Array.from({ length: count }, (_, i) => firstPage + i);
  }, [currentPage, maxPageButtons, totalPages]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(start, start + itemsPerPage);
  }, [filteredEvents, currentPage]);

  // The paginator sits below the fold on a phone, so a page change would otherwise leave the
  // viewport on the *last* cards of the new page. Jump instantly — smooth-scrolling this far
  // just looks like the list is running away.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const lastScrolledPage = useRef(currentPage);
  useEffect(() => {
    if (lastScrolledPage.current === currentPage) return;
    lastScrolledPage.current = currentPage;
    listScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentPage]);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, eventView]);

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // New Event drawer derived state
  const formEventDates = getFormEventDateOptions();
  const mealsDifferAcrossDates = formEventDates.length > 1 && formEventDates.some((date) =>
    (foodInclusionByDate[date] || []).join('|') !== (foodInclusionByDate[formEventDates[0]] || []).join('|')
  );
  const showPerDayMeals = customizeMealsPerDay || mealsDifferAcrossDates;
  const showGiveawayEditor = giveawaysEnabled || ((formData.giveaways as GiveawayItem[]) || []).length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col gap-6">
      {!(showParticipantsModal && selectedEvent) && (
      <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto -m-4 md:-m-6 p-4 md:py-8 md:px-12 lg:px-16 flex flex-col gap-6">
      {/* Page header */}
      <div className="flex justify-end w-full -mb-3">
        <button
            onClick={openCreateModal}
            type="button"
            className="h-9 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md flex items-center gap-1.5 px-3 transition-colors"
        >
            <CalendarPlus size={15} />
            <span className="hidden sm:inline">New Event</span>
        </button>
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-center gap-3 w-full">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100/50 border border-[rgb(var(--ink)/0.05)] rounded-lg">
          {[
            { value: 'All', label: 'All', count: eventSummary.total },
            { value: 'Ongoing', label: 'Ongoing', count: eventSummary.ongoing },
            { value: 'Scheduled', label: 'Upcoming', count: eventSummary.scheduled },
            { value: 'Completed', label: 'Completed', count: eventSummary.completed },
            { value: 'Cancelled', label: 'Cancelled', count: eventSummary.cancelled },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs transition-all ${
                statusFilter === tab.value
                  ? 'bg-white text-[#111110] shadow-sm font-medium border border-black/[0.06]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
              <span className={`hidden sm:inline font-mono text-[10px] leading-none ${
                statusFilter === tab.value
                  ? 'bg-indigo-600/10 text-indigo-600 rounded px-1 py-0.5'
                  : 'text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px] flex-1 lg:flex-none lg:w-[30%] ml-auto">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={14} />
            </div>
            <input
              type="text"
              placeholder="Filter events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-16 h-9 bg-slate-100/50 border border-[rgb(var(--ink)/0.10)] rounded-md text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
              >
                Clear
              </button>
            )}
        </div>
        {isAdmin && (
          <div className="flex shrink-0 gap-1 p-1 bg-slate-100/50 rounded-md border border-[rgb(var(--ink)/0.05)]">
            <button
              type="button"
              onClick={() => {
                setEventView('active');
                setStatusFilter('All');
              }}
              className={`inline-flex h-7 items-center gap-1.5 rounded px-3 text-xs transition-all ${
                eventView === 'active'
                  ? 'bg-white text-[#111110] shadow-sm font-medium border border-black/[0.06]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={12} />
              Active
            </button>
            <button
              type="button"
              onClick={() => {
                setEventView('deleted');
                setStatusFilter('All');
              }}
              className={`inline-flex h-7 items-center gap-1.5 rounded px-3 text-xs transition-all ${
                eventView === 'deleted'
                  ? 'bg-card text-red-600 shadow-sm font-medium border border-[rgb(var(--ink)/0.06)]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trash2 size={12} />
              Deleted
            </button>
          </div>
        )}
      </div>


      <div className="flex flex-col gap-3">
          {eventView === 'deleted' && (
              <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-md flex items-center gap-2 text-sm text-red-700 shrink-0">
                  <Trash2 size={14} />
                  <span>Deleted Events view. Admins can restore events or permanently delete them.</span>
              </div>
          )}
          <div className="hidden md:block">
              {loading ? (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {[...Array(6)].map((_, i) => (
                          <div key={i} className="animate-pulse bg-card border border-[rgb(var(--ink)/0.08)] rounded-lg p-5 space-y-3">
                              <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                              <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                              <div className="h-3 bg-slate-100 rounded w-1/3"></div>
                              <div className="h-8 bg-slate-100 rounded mt-4"></div>
                          </div>
                      ))}
                  </div>
              ) : filteredEvents.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 bg-card border border-[rgb(var(--ink)/0.08)] rounded-lg">
                      <div className="flex flex-col items-center justify-center">
                        {searchTerm ? <Search className="w-12 h-12 text-slate-300 mb-3" /> : eventView === 'deleted' ? <Trash2 className="w-12 h-12 text-slate-300 mb-3" /> : <Calendar className="w-12 h-12 text-slate-300 mb-3" />}
                        <p className="font-medium text-slate-500">
                          {searchTerm ? `No results for "${searchTerm}"` : eventView === 'deleted' ? 'No deleted events found' : 'No events found'}
                        </p>
                        <p className="text-xs mt-1">
                          {searchTerm ? 'Try adjusting your search terms' : eventView === 'deleted' ? 'Deleted events will appear here for Admin recovery.' : 'Create a new event to get started'}
                        </p>
                      </div>
                  </div>
              ) : (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
                      {paginatedEvents.map((event) => {
                          const canEditCurrentEvent = canEditEventRecord(event);
                          const canDeleteCurrentEvent = canDeleteEventRecord(event);
                          const canSetCurrentEventAccess = canSetEventAccess(event);

                          return (
                          <div
                              key={event.event_id}
                              onClick={() => {
                                  if (eventView === 'active') handleRowClick(event);
                              }}
                              title={eventView === 'active' ? 'Click to view participants' : 'Deleted event'}
                              className={`group flex flex-col rounded-lg border transition-all duration-150 ${
                                  eventView === 'active'
                                    ? 'bg-card border-[rgb(var(--ink)/0.08)] hover:border-indigo-600/30 hover:shadow-sm cursor-pointer'
                                    : 'bg-red-50/20 border-red-100'
                              }`}
                          >
                              {/* Card body */}
                              <div className="flex-1 p-5">
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                      <h3 className={`text-sm font-medium text-slate-800 leading-snug flex-1 line-clamp-2 ${
                                          eventView === 'active' ? 'group-hover:text-indigo-600 transition-colors' : ''
                                      }`}>
                                          {event.event_name}
                                      </h3>
                                      <div className="shrink-0">
                                          {eventView === 'deleted' ? (
                                              <span className="inline-flex items-center gap-1 rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 font-mono">
                                                  <Clock size={10} />
                                                  {formatDeletedDate(event.deleted_at)}
                                              </span>
                                          ) : (
                                              getStatusBadge(event.status)
                                          )}
                                      </div>
                                  </div>

                                  {(eventView === 'deleted' || event.has_accommodation || !event.registration_open) && (
                                      <div className="flex flex-wrap gap-1.5 mb-3">
                                          {eventView === 'deleted' && (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-100">
                                                  <Trash2 size={10} className="mr-1" /> Deleted
                                              </span>
                                          )}
                                          {event.has_accommodation && (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                  <Bed size={10} className="mr-1" /> Accommodation
                                              </span>
                                          )}
                                          {!event.registration_open && (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-100">
                                                  <Lock size={10} className="mr-1" /> Closed
                                              </span>
                                          )}
                                      </div>
                                  )}

                                  <div className="space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                          <Calendar size={12} className="shrink-0 text-slate-400" />
                                          <span className="font-mono">{formatEventDate(event.start_date, event.end_date)}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                          <MapPin size={12} className="shrink-0 text-slate-400" />
                                          <span className="truncate">{event.venue}</span>
                                      </div>
                                  </div>
                              </div>

                              {/* Action bar */}
                              <div className="flex items-center gap-1 px-4 py-2.5 border-t border-[rgb(var(--ink)/0.06)] bg-slate-50/40 rounded-b-lg">
                                  {eventView === 'deleted' && isAdmin ? (
                                      <>
                                          <button
                                              onClick={(e) => handleRestoreEvent(e, event.event_id)}
                                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                                              title="Restore"
                                          >
                                              <RotateCcw size={13} />
                                              <span>Restore</span>
                                          </button>
                                          <button
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDelete(e, event.event_id);
                                              }}
                                              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                              title="Permanently delete"
                                          >
                                              <Trash2 size={13} />
                                              <span>Delete Forever</span>
                                          </button>
                                      </>
                                  ) : (
                                      <>
                                          <button
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  openShareModal(e, event);
                                              }}
                                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                                              title="Share"
                                          >
                                              <Share2 size={13} />
                                              <span>Share</span>
                                          </button>
                                          {canEditCurrentEvent && (
                                              <button
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      openEditModal(e, event);
                                                  }}
                                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                                                  title="Edit"
                                              >
                                                  <Edit size={13} />
                                                  <span>Edit</span>
                                              </button>
                                          )}
                                          {canSetCurrentEventAccess && (
                                              <button
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      openEventAccessModal(e, event);
                                                  }}
                                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                                                  title="Access Settings"
                                              >
                                                  <Settings size={13} />
                                                  <span>Access</span>
                                              </button>
                                          )}
                                          {canDeleteCurrentEvent && (
                                              <button
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleDelete(e, event.event_id);
                                                  }}
                                                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                  title="Delete"
                                              >
                                                  <Trash2 size={13} />
                                                  <span>Delete</span>
                                              </button>
                                          )}
                                      </>
                                  )}
                              </div>
                          </div>
                          );
                      })}
                  </div>
              )}
          </div>

          <div className="md:hidden space-y-3">
              {loading ? (
                  [...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse rounded-xl border border-slate-200 p-4 space-y-3">
                          <div className="h-5 bg-slate-200 rounded w-2/3"></div>
                          <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                          <div className="h-4 bg-slate-100 rounded w-1/3"></div>
                          <div className="flex gap-2">
                              <div className="h-8 bg-slate-100 rounded flex-1"></div>
                              <div className="h-8 bg-slate-100 rounded flex-1"></div>
                          </div>
                      </div>
                  ))
              ) : filteredEvents.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
                      <div className="flex flex-col items-center justify-center">
                          {searchTerm ? <Search className="w-12 h-12 text-slate-300 mb-3" /> : eventView === 'deleted' ? <Trash2 className="w-12 h-12 text-slate-300 mb-3" /> : <Calendar className="w-12 h-12 text-slate-300 mb-3" />}
                          <p className="font-medium text-slate-500">
                            {searchTerm ? `No results for "${searchTerm}"` : eventView === 'deleted' ? 'No deleted events found' : 'No events found'}
                          </p>
                          <p className="text-xs mt-1">
                            {searchTerm ? 'Try adjusting your search terms' : eventView === 'deleted' ? 'Deleted events will appear here for Admin recovery.' : 'Create a new event to get started'}
                          </p>
                      </div>
                  </div>
              ) : (
                  paginatedEvents.map((event) => {
                      const canEditCurrentEvent = canEditEventRecord(event);
                      const canDeleteCurrentEvent = canDeleteEventRecord(event);
                      const canSetCurrentEventAccess = canSetEventAccess(event);

                      return (
                      <div
                          key={event.event_id}
                          onClick={() => {
                              if (eventView === 'active') handleRowClick(event);
                          }}
                          className={`rounded-xl border p-4 shadow-sm transition-transform ${
                              eventView === 'active'
                                ? 'border-slate-200 bg-card active:scale-[0.99]'
                                : 'border-red-100 bg-red-50/40'
                          }`}
                      >
                          <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                  <h3 className="text-sm font-semibold text-slate-800 leading-tight">{event.event_name}</h3>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                      {eventView === 'deleted' && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-100">
                                              <Trash2 size={10} className="mr-1" /> Deleted
                                          </span>
                                      )}
                                      {event.has_accommodation && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                              <Bed size={10} className="mr-1" /> Accommodation
                                          </span>
                                      )}
                                      {!event.registration_open && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-100">
                                              <Lock size={10} className="mr-1" /> Closed
                                          </span>
                                      )}
                                  </div>
                              </div>
                              <div className="shrink-0">
                                  {eventView === 'deleted' ? (
                                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                                          <Clock size={12} />
                                          {formatDeletedDate(event.deleted_at)}
                                      </span>
                                  ) : (
                                      getStatusBadge(event.status)
                                  )}
                              </div>
                          </div>

                          <div className="mt-4 space-y-2 text-[13px] text-slate-600">
                              <div className="flex items-start gap-2">
                                  <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                  <span>{event.venue}</span>
                              </div>
                              <div className="flex items-start gap-2">
                                  <Calendar size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                  <span>{formatEventDate(event.start_date, event.end_date)}</span>
                              </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                              {eventView === 'deleted' && isAdmin ? (
                                  <>
                                      <button
                                          onClick={(e) => handleRestoreEvent(e, event.event_id)}
                                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                                          title="Restore"
                                          aria-label="Restore"
                                      >
                                          <RotateCcw size={16} />
                                      </button>
                                      <button
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(e, event.event_id);
                                          }}
                                          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                                          title="Permanently delete"
                                          aria-label="Permanently delete"
                                      >
                                          <Trash2 size={16} />
                                      </button>
                                  </>
                              ) : (
                                  <>
                                      <button
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              openShareModal(e, event);
                                          }}
                                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100"
                                          title="Share"
                                          aria-label="Share"
                                      >
                                          <Share2 size={16} />
                                      </button>
                                      {canEditCurrentEvent && (
                                      <button
                                          onClick={(e) => {
                                              e.stopPropagation();
                                              openEditModal(e, event);
                                          }}
                                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                                          title="Edit"
                                          aria-label="Edit"
                                      >
                                          <Edit size={16} />
                                      </button>
                                      )}
                                      {canSetCurrentEventAccess && (
                                          <button
                                              onClick={(e) => openEventAccessModal(e, event)}
                                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100"
                                              title="Access Settings"
                                              aria-label="Access Settings"
                                          >
                                              <Settings size={16} />
                                          </button>
                                      )}
                                      {canDeleteCurrentEvent && (
                                          <button
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDelete(e, event.event_id);
                                              }}
                                              className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                                              title="Delete"
                                              aria-label="Delete"
                                          >
                                              <Trash2 size={16} />
                                          </button>
                                      )}
                                  </>
                              )}
                          </div>
                      </div>
                      );
                  })
              )}
          </div>
          
          {/* Pagination Controls */}
          {!loading && totalPages > 1 && (
              <div className="pt-1 flex items-center justify-center sm:justify-between shrink-0">
                  {/* Sighted users get the scroll-to-top as confirmation; this is its equivalent. */}
                  <p aria-live="polite" className="sr-only">Page {currentPage} of {totalPages}</p>
                  <div className="hidden sm:block text-sm text-slate-500">
                      Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredEvents.length)}</span> of <span className="font-medium">{filteredEvents.length}</span> results
                  </div>
                  <div className="flex items-center gap-2">
                      <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Previous
                      </button>
                      <div className="flex items-center gap-1">
                          {visiblePages.map(page => (
                              <button
                                  key={page}
                                  onClick={() => setCurrentPage(page)}
                                  className={`w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors
                                      ${currentPage === page
                                          ? 'bg-indigo-600 text-white'
                                          : 'text-slate-700 hover:bg-slate-100'
                                      }`}
                              >
                                  {page}
                              </button>
                          ))}
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
      </div>
      )}

      {/* Share / Registration Modal */}
      {showShareModal && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowShareModal(false)}></div>
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 relative z-10 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800">Event Registration</h3>
                    <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="space-y-6 flex flex-col items-center">
                    {!selectedEvent.registration_open ? (
                        <div className="w-full bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <div className="flex justify-center mb-2">
                                <Lock className="text-red-500" size={32} />
                            </div>
                            <h4 className="font-bold text-red-700 mb-1">Registration is Closed</h4>
                            <p className="text-sm text-red-600">
                                Users cannot register for this event. Enable registration in event settings to share.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div ref={qrCodeRef} className="p-4 border-2 border-indigo-100 rounded-lg bg-indigo-50/50">
                                <div className="relative inline-block">
                                    <QRCode value={getRegistrationLink(selectedEvent.event_id)} size={180} level="H" />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-full p-1">
                                        <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-11 h-11 object-contain rounded-full" />
                                    </div>
                                </div>
                            </div>

                            <div className="w-full">
                                <label className="block text-sm font-medium text-slate-700 mb-2">Registration Link</label>
                                <div className="flex gap-2">
                                    <input
                                        readOnly
                                        value={getRegistrationLink(selectedEvent.event_id)}
                                        className="flex-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 bg-slate-50 focus:outline-none"
                                    />
                                    <button
                                        onClick={copyToClipboard}
                                        className={`px-3 py-2 rounded-lg border flex items-center gap-2 transition-all
                                            ${copied ? 'bg-green-50 border-green-200 text-green-700' : 'bg-card border-slate-300 text-slate-700 hover:bg-slate-50'}
                                        `}
                                    >
                                        {copied ? <Check size={18} /> : <Copy size={18} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={downloadRegistrationBadge}
                                disabled={downloadingBadge}
                                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {downloadingBadge ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                {downloadingBadge ? 'Generating...' : 'Download Badge (PDF)'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Event Details View (in-page, replaces the old participants modal) */}
      {showParticipantsModal && selectedEvent && (
        <div className="flex-1 min-h-0 overflow-y-auto animate-in fade-in duration-150 -m-4 md:-m-6 p-4 md:py-8 md:px-12 lg:px-16">
            {/* Page header */}
            <div className="mb-4">
                <button
                    onClick={closeParticipantsModal}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors w-fit"
                >
                    <ArrowRight size={15} className="rotate-180" />
                    Back
                </button>

                <>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mt-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    {getStatusBadge(selectedEvent.status)}
                                    {selectedEvent.event_serial && (
                                        <span className="text-xs text-slate-400 font-mono">#{selectedEvent.event_serial}</span>
                                    )}
                                </div>
                                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 leading-snug break-words">
                                    {selectedEvent.event_name}
                                </h1>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <MapPin size={14} className="text-slate-400 shrink-0" />
                                        <span className="truncate">{selectedEvent.venue}</span>
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Calendar size={14} className="text-slate-400 shrink-0" />
                                        <span className="font-mono">{formatEventDate(selectedEvent.start_date, selectedEvent.end_date)}</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Participants summary */}
                        <div className="flex flex-wrap items-center gap-2 mt-4">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                                <Users size={15} className="text-slate-500" /> Participants
                            </span>
                            <span className="text-xs font-mono bg-indigo-50 text-indigo-600 border border-indigo-100 rounded px-1.5 py-0.5">{totalCount}</span>
                            {secretariatCount > 0 && (
                                <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
                                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getRoleChipClass('Secretariat')}`}>Secretariat</span>
                                    {secretariatCount}
                                </span>
                            )}
                            {speakerCount > 0 && (
                                <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
                                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getRoleChipClass('Speaker')}`}>Speaker</span>
                                    {speakerCount}
                                </span>
                            )}
                            {guestVipCount > 0 && (
                                <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
                                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getRoleChipClass('Guest')}`}>Guest/VIP</span>
                                    {guestVipCount}
                                </span>
                            )}
                            {delegateCount > 0 && (
                                <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
                                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getRoleChipClass('Delegate')}`}>Delegate</span>
                                    {delegateCount}
                                </span>
                            )}
                        </div>
                </>
            </div>

            <div>

                <div className="mb-4">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                            <div className="mr-auto flex flex-wrap items-center gap-1 p-1 bg-slate-100/50 border border-[rgb(var(--ink)/0.05)] rounded-lg">
                                {[
                                    { value: 'all', label: 'All', count: totalCount, show: true },
                                    { value: 'Principal', label: 'Principal', count: principalCount, show: !!selectedEvent?.has_principal_delegates },
                                    { value: 'Representative', label: 'Representative', count: representativeCount, show: !!selectedEvent?.has_principal_delegates },
                                    { value: 'accommodation', label: 'Accommodation', count: needsAccommodationCount, show: !!selectedEvent?.has_accommodation },
                                    { value: 'noPhoto', label: 'No Photo/Video', count: noPhotoConsentCount, show: true },
                                    { value: 'noStore', label: 'No Data Storage', count: noStoreConsentCount, show: true },
                                ].filter(tab => tab.show).map(tab => (
                                    <button
                                        key={tab.value}
                                        type="button"
                                        onClick={() => applyParticipantFilter(tab.value)}
                                        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs transition-all ${
                                            activeParticipantFilter === tab.value
                                                ? 'bg-white text-[#111110] shadow-sm font-medium border border-black/[0.06]'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        {tab.label}
                                        <span className={`hidden sm:inline font-mono text-[10px] leading-none ${
                                            activeParticipantFilter === tab.value
                                                ? 'bg-indigo-600/10 text-indigo-600 rounded px-1 py-0.5'
                                                : 'text-slate-400'
                                        }`}>
                                            {tab.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className="relative w-full max-w-xs">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Search size={16} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search name, position, office..."
                                    value={participantSearchTerm}
                                    onChange={(e) => setParticipantSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-14 py-2 bg-slate-100/50 border border-[rgb(var(--ink)/0.10)] rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/15 focus:border-indigo-600 transition-all"
                                />
                                {participantSearchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setParticipantSearchTerm('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={exportParticipantsToExcel}
                                disabled={viewingParticipants.length === 0}
                                type="button"
                                aria-label="Export participants"
                                title="Export participants"
                                className="shrink-0 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                <Download size={16} />
                                <span className="hidden sm:inline">Export</span>
                            </button>
                            {canManageParticipants && (
                                <button
                                    onClick={openAddParticipantView}
                                    type="button"
                                    aria-label="Add participant"
                                    title="Add participant"
                                    className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <UserPlus size={16} />
                                    <span className="hidden sm:inline">Add Participant</span>
                                </button>
                            )}
                        </div>
                </div>

                {/* Content */}
                <div>
                    {loadingParticipants ? (
                        <div className="py-16 flex items-center justify-center text-slate-400 gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div> Loading participants...
                        </div>
                    ) : (
                        <>
                            {specialParticipants.length > 0 && (
                                <div className="mb-6">
                                    {renderParticipantSectionHeader('Secretariat · Speaker · Guest / VIP', specialParticipants.length)}
                                    <div className="bg-card border border-[rgb(var(--ink)/0.08)] rounded-lg overflow-hidden">
                                        <table className="w-full text-[13px] text-left">
                                            {participantTableHead}
                                            <tbody className="divide-y divide-slate-100">
                                                {specialParticipants.map(renderParticipantRow)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {delegateParticipants.length > 0 && (
                                <div className="mb-6">
                                    {renderParticipantSectionHeader('Delegates', delegateParticipants.length)}
                                    <div className="bg-card border border-[rgb(var(--ink)/0.08)] rounded-lg overflow-hidden">
                                        <table className="w-full text-[13px] text-left">
                                            {participantTableHead}
                                            <tbody className="divide-y divide-slate-100">
                                                {delegateParticipants.map(renderParticipantRow)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {filteredParticipants.length === 0 && (
                                <div className="bg-card border border-[rgb(var(--ink)/0.08)] rounded-lg py-14 text-center text-slate-400 text-sm">
                                    {participantSearchTerm ? 'No participants found matching your search.' : 'No participants registered yet.'}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Add / Edit Participant side drawer */}
                {(participantModalView === 'add' || participantModalView === 'edit') && (
                <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                        aria-hidden="true"
                        onClick={() => { setParticipantModalView('list'); resetParticipantForm(); }}
                    ></div>
                    <div className="fixed inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-card shadow-2xl animate-in slide-in-from-right duration-200">
                        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <div className="min-w-0">
                                <h3 className="text-lg font-semibold text-slate-900">
                                    {participantModalView === 'edit' ? 'Edit Participant' : 'Add Participant'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5 truncate">{selectedEvent.event_name}</p>
                            </div>
                            <button
                                onClick={() => { setParticipantModalView('list'); resetParticipantForm(); }}
                                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-full transition-all shrink-0"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                            <form onSubmit={participantModalView === 'edit' ? handleUpdateParticipantDetails : handleAddParticipant} className="space-y-10">
                                {/* SECTION: Personal Information */}
                                <div className="space-y-6">
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Personal Information</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                                        <input 
                                            required
                                            type="text"
                                            placeholder="First Name"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            value={newParticipant.f_name}
                                            onChange={(e) => handleNameChange(e, 'f_name')}
                                            onFocus={() => { if(participantModalView === 'add' && newParticipant.f_name.length >= 2 && suggestions.length > 0) setShowSuggestions(true); }}
                                            onBlur={(e) => {
                                                setNewParticipant({ ...newParticipant, f_name: toProperCase(e.target.value) });
                                                setTimeout(() => setShowSuggestions(false), 200);
                                            }}
                                            autoComplete="off"
                                        />
                                        {participantModalView === 'add' && showSuggestions && suggestions.length > 0 && (
                                            <ul className="absolute z-50 w-full bg-card border border-slate-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                                {suggestions.map((p) => (
                                                    <li 
                                                        key={p.participant_id}
                                                        onClick={() => selectSuggestion(p)}
                                                        className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div className="font-medium text-slate-800 group-hover:text-indigo-700">{p.full_name}</div>
                                                            <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Select</span>
                                                        </div>
                                                        <div className="text-xs text-slate-500 mt-0.5">{p.email} • {p.office}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                                        <input 
                                            required
                                            type="text"
                                            placeholder="Last Name"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            value={newParticipant.l_name}
                                            onChange={(e) => handleNameChange(e, 'l_name')}
                                            onBlur={(e) => setNewParticipant({ ...newParticipant, l_name: toProperCase(e.target.value) })}
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                                    <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Middle Initial</label>
                                        <input 
                                            type="text"
                                            maxLength={1}
                                            placeholder="e.g. A"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            value={newParticipant.m_initial}
                                            onChange={e => setNewParticipant({...newParticipant, m_initial: e.target.value.toUpperCase()})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Suffix</label>
                                        <input 
                                            type="text"
                                            placeholder="e.g. Jr"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            value={newParticipant.suffix}
                                            onChange={e => setNewParticipant({...newParticipant, suffix: e.target.value})}
                                            onBlur={e => setNewParticipant({...newParticipant, suffix: formatSuffix(e.target.value)})}
                                        />
                                    </div>
                                    </div>
                                </div>

                                {/* SECTION: Contact & Professional */}
                                <div className="space-y-6">
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Contact & Professional</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                                            <input 
                                                type="email"
                                                placeholder="email@example.com"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                                value={newParticipant.email}
                                                onChange={e => setNewParticipant({...newParticipant, email: e.target.value})}
                                                pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                                                title="Please enter a valid email address"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Mobile No.</label>
                                            <input 
                                                type="tel"
                                                placeholder="09123456789"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                                value={newParticipant.mobile_no}
                                                onChange={e => {
                                                    const val = e.target.value.replace(/\D/g, '');
                                                    if (val.length <= 11) {
                                                        setNewParticipant({...newParticipant, mobile_no: val});
                                                    }
                                                }}
                                                pattern="[0-9]{10,11}"
                                                title="Mobile number must be 10 or 11 digits"
                                            />
                                        </div>
                                    </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Position / Job Title</label>
                                    <input 
                                        type="text"
                                        placeholder="e.g. Regional Director, Administrative Officer"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        value={newParticipant.position}
                                        onChange={e => setNewParticipant({...newParticipant, position: e.target.value})}
                                    />
                                </div>
                                
                                    <div className="pt-1">
                                     <label className="block text-sm font-medium text-slate-700 mb-2">Affiliation Type</label>
                                     <div className="flex gap-4 mb-4">
                                        <label className={`flex-1 cursor-pointer border rounded-lg p-2.5 flex items-center gap-2 transition-all ${affiliationType === 'Office' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                            <input 
                                                type="radio" 
                                                className="hidden" 
                                                checked={affiliationType === 'Office'} 
                                                onChange={() => setAffiliationType('Office')}
                                            />
                                            <Building size={18} />
                                            <span className="font-medium text-sm">NGA / Office</span>
                                        </label>
                                        <label className={`flex-1 cursor-pointer border rounded-lg p-2.5 flex items-center gap-2 transition-all ${affiliationType === 'LGU' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                            <input 
                                                type="radio" 
                                                className="hidden" 
                                                checked={affiliationType === 'LGU'} 
                                                onChange={() => setAffiliationType('LGU')}
                                            />
                                            <Landmark size={18} />
                                            <span className="font-medium text-sm">LGU</span>
                                        </label>
                                     </div>

                                     {affiliationType === 'Office' ? (
                                        <div className="animate-in fade-in zoom-in-95 duration-200">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Office / Agency Name</label>
                                            <input 
                                                required={affiliationType === 'Office'}
                                                type="text"
                                                placeholder="e.g. DILG Regional Office 10"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                                value={newParticipant.office}
                                                onChange={e => setNewParticipant({...newParticipant, office: e.target.value})}
                                            />
                                        </div>
                                     ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Province / HUC</label>
                                                <select 
                                                    required={affiliationType === 'LGU'}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                                    value={selectedProvince}
                                                    onChange={e => {
                                                        setSelectedProvince(e.target.value);
                                                        setSelectedCity('');
                                                        const officeName = e.target.value.toLowerCase().includes('city') ? `LGU ${e.target.value}` : `Provincial Gov't of ${e.target.value}`;
                                                        setNewParticipant({...newParticipant, office: officeName});
                                                    }}
                                                >
                                                    <option value="">Select Province/HUC</option>
                                                    {provinces.map(p => (
                                                        <option key={p} value={p}>{p}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">City / Municipality</label>
                                                <select 
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                                    value={selectedCity}
                                                    onChange={e => {
                                                        setSelectedCity(e.target.value);
                                                        setNewParticipant({...newParticipant, office: `LGU ${e.target.value}, ${selectedProvince}`});
                                                    }}
                                                    disabled={!selectedProvince}
                                                >
                                                    <option value="">-- Select City/Mun --</option>
                                                    {cities.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                     )}
                                </div>
                                </div>

                                {/* SECTION: Event Options & Demographics */}
                                <div className="space-y-6">
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Event & Demographics</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Event Role</label>
                                            <select 
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                                value={newParticipant.role}
                                                onChange={e => setNewParticipant({...newParticipant, role: e.target.value})}
                                            >
                                                <option value="Delegate">Delegate</option>
                                                <option value="Speaker">Speaker</option>
                                                <option value="Secretariat">Secretariat</option>
                                                <option value="Guest">Guest</option>
                                                <option value="VIP">VIP</option>
                                            </select>
                                        </div>
                                        {selectedEvent?.has_principal_delegates && newParticipant.role === 'Delegate' && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Delegate Type</label>
                                                <select
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none bg-card"
                                                    value={newParticipant.delegate_type}
                                                    onChange={e => setNewParticipant({...newParticipant, delegate_type: e.target.value as '' | DelegateType})}
                                                >
                                                    <option value="">Unspecified</option>
                                                    {DELEGATE_TYPES.map((type) => (
                                                        <option key={type} value={type}>{type}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                                            <select 
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                                value={newParticipant.gender}
                                                onChange={e => setNewParticipant({...newParticipant, gender: e.target.value})}
                                            >
                                                <option value="">Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Age Group</label>
                                            <select 
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                                value={newParticipant.age_group}
                                                onChange={e => setNewParticipant({...newParticipant, age_group: e.target.value})}
                                            >
                                                <option value="18-24">18-24</option>
                                                <option value="25-34">25-34</option>
                                                <option value="35-44">35-44</option>
                                                <option value="45-54">45-54</option>
                                                <option value="55-64">55-64</option>
                                                <option value="65+">65+</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">PWD</label>
                                            <select 
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                                value={newParticipant.pwd}
                                                onChange={e => setNewParticipant({...newParticipant, pwd: e.target.value})}
                                            >
                                                <option value="No">No</option>
                                                <option value="Yes">Yes</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Indigenous People</label>
                                        <select 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-card"
                                            value={newParticipant.indigenous_people}
                                            onChange={e => setNewParticipant({...newParticipant, indigenous_people: e.target.value})}
                                        >
                                            <option value="No">No</option>
                                            <option value="Yes">Yes</option>
                                        </select>
                                    </div>
                                </div>

                                {selectedEvent?.has_accommodation && (
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox"
                                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                checked={newParticipant.needs_accommodation}
                                                onChange={e => toggleParticipantAccommodation(e.target.checked)}
                                            />
                                            <span className="text-sm font-medium text-slate-700">Needs Accommodation</span>
                                        </label>
                                        {newParticipant.needs_accommodation && getSelectedEventAccommodationDates(selectedEvent).length === 1 && (
                                            <p className="mt-2 text-xs text-slate-500">
                                                Accommodation date is set automatically to {formatAccommodationDateLabel(getSelectedEventAccommodationDates(selectedEvent)[0])}.
                                            </p>
                                        )}
                                        {newParticipant.needs_accommodation && getSelectedEventAccommodationDates(selectedEvent).length > 1 && (
                                            <div className="mt-3 space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Select Accommodation Dates</p>
                                                <p className="text-xs text-slate-500">
                                                    Selected: {newParticipant.date_accommodation.length} day(s)
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {getSelectedEventAccommodationDates(selectedEvent).map((date) => {
                                                        const isChecked = newParticipant.date_accommodation.includes(date);
                                                        return (
                                                            <label
                                                                key={date}
                                                                className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                                                    isChecked ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-card text-slate-700 hover:border-indigo-300'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => toggleParticipantAccommodationDate(date)}
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

                                {/* Giveaways (Conditional, separate from CA) */}
                                {(selectedEvent?.giveaways && selectedEvent.giveaways.length > 0) && (
                                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 space-y-3">
                                        <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wider flex items-center gap-2">
                                            <Gift size={14}/> Giveaways
                                        </h4>
                                        {selectedEvent.giveaways_open === false && (
                                            <p className="rounded-lg bg-purple-100 px-3 py-2 text-xs font-medium text-purple-800">
                                                Giveaway selection is closed for this event.
                                            </p>
                                        )}
                                        {selectedEvent.giveaways.map((item) => {
                                            const giveawaysClosed = selectedEvent.giveaways_open === false;
                                            return (
                                            <div key={item.key} className={giveawaysClosed ? 'opacity-60' : ''}>
                                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                    {item.label}
                                                    {item.required && item.type === 'single-select' && !giveawaysClosed && <span className="text-red-500"> *</span>}
                                                </label>
                                                {item.type === 'single-select' ? (
                                                    <select
                                                        disabled={giveawaysClosed}
                                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                        value={(newParticipant.giveaway_selections[item.key] as string) || ''}
                                                        onChange={(e) => setNewParticipant({ ...newParticipant, giveaway_selections: { ...newParticipant.giveaway_selections, [item.key]: e.target.value } })}
                                                    >
                                                        <option value="">-- Select --</option>
                                                        {(item.options || []).map((opt) => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <label className={`flex items-center gap-2 ${giveawaysClosed ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                                        <input
                                                            type="checkbox"
                                                            disabled={giveawaysClosed}
                                                            className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 disabled:cursor-not-allowed"
                                                            checked={!!newParticipant.giveaway_selections[item.key]}
                                                            onChange={(e) => setNewParticipant({ ...newParticipant, giveaway_selections: { ...newParticipant.giveaway_selections, [item.key]: e.target.checked } })}
                                                        />
                                                        <span className="text-sm text-slate-700">Yes</span>
                                                    </label>
                                                )}
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Certificate of Appearance */}
                                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                            checked={newParticipant.need_ca}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewParticipant({ ...newParticipant, need_ca: e.target.checked })}
                                        />
                                        <span className="text-sm font-medium text-slate-700">Needs Certificate of Appearance (CA)</span>
                                    </label>
                                </div>

                                {/* Data Privacy Consent */}
                                <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-lg border border-slate-100 mt-4">
                                    <div className="text-xs font-bold text-slate-700 mt-2">Consent:</div>
                                    
                                    <div className="flex items-start gap-3">
                                        <div className="flex items-center h-5">
                                            <input
                                                id="modal-accept-photo-video"
                                                type="checkbox"
                                                checked={newParticipant.accept_photo_video}
                                                onChange={(e) => setNewParticipant({...newParticipant, accept_photo_video: e.target.checked})}
                                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                        <label htmlFor="modal-accept-photo-video" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                            He/She consents to the capture of his/her photo, video, and audio for use in DILG publications.
                                        </label>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="flex items-center h-5">
                                            <input
                                                id="modal-store-to-db"
                                                type="checkbox"
                                                checked={newParticipant.store_to_db}
                                                onChange={(e) => setNewParticipant({...newParticipant, store_to_db: e.target.checked})}
                                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                        <label htmlFor="modal-store-to-db" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                            He/She consents to the storage of his/her data in the organizer’s database for future document processing.
                                        </label>
                                    </div>
                                </div>

                                {participantModalView === 'add' && (
                                    <div className="space-y-2">
                                    <div className="flex items-start gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                                        <div className="flex items-center h-5">
                                            <input
                                                id="modal-send-qr-email"
                                                type="checkbox"
                                                checked={sendQrOnRegister && canSendQrEmail}
                                                disabled={!canSendQrEmail}
                                                onChange={(e) => setSendQrOnRegister(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                                            />
                                        </div>
                                        <label htmlFor="modal-send-qr-email" className={`text-xs leading-relaxed cursor-pointer ${canSendQrEmail ? 'text-slate-600' : 'text-slate-400'}`}>
                                            Send the participant's <span className={`font-semibold ${canSendQrEmail ? 'text-indigo-700' : 'text-slate-400'}`}>QR code</span> to his/her email upon registration.
                                            {!canSendQrEmail && <span className="block text-[11px] text-slate-400 mt-0.5">Requires a valid email address.</span>}
                                        </label>
                                    </div>

                                    {isTodayEventDay(selectedEvent) && (
                                    <div className="flex items-start gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                                        <div className="flex items-center h-5">
                                            <input
                                                id="modal-log-attendance"
                                                type="checkbox"
                                                checked={logAttendanceOnRegister}
                                                onChange={(e) => setLogAttendanceOnRegister(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                        <label htmlFor="modal-log-attendance" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                                            Log <span className="font-semibold text-indigo-700">{getRegistrationAttendanceSession(selectedEvent)}</span> attendance for today ({format(new Date(), 'MMM d, yyyy')}) upon registration.
                                        </label>
                                    </div>
                                    )}
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                                    <button 
                                        type="button"
                                        onClick={() => { setParticipantModalView('list'); resetParticipantForm(); }}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={isAddingParticipant}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
                                    >
                                        {isAddingParticipant ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                                        {participantModalView === 'edit' ? 'Save Changes' : 'Add Participant'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                )}
                
            </div>
        </div>
      )}

      {/* Name Change Confirmation Modal */}
      {showNameChangeConfirm && pendingNameChange && selectedParticipantName && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancelNameChange}></div>
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6 relative z-20 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="bg-red-100 p-3 rounded-full mb-4">
                        <AlertTriangle className="text-red-600" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Change Participant Name?</h3>
                    <p className="text-sm text-slate-500 mb-4">
                        You are editing the name of an existing participant. Changing the participant's name will update it across all attendance records associated with this participant.
                    </p>
                    <div className="w-full mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left space-y-2">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-1">Previous {pendingNameChange.field === 'f_name' ? 'First' : 'Last'} Name</p>
                            <p className="text-sm font-medium text-red-900">{selectedParticipantName[pendingNameChange.field] || '(blank)'}</p>
                        </div>
                        <div className="border-t border-red-200 pt-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-1">New {pendingNameChange.field === 'f_name' ? 'First' : 'Last'} Name</p>
                            <p className="text-sm font-medium text-red-900">{pendingNameChange.value || '(blank)'}</p>
                        </div>
                    </div>
                    <div className="flex gap-3 w-full">
                        <button
                            onClick={handleCancelNameChange}
                            className="flex-1 px-4 py-2.5 bg-card border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Keep Original
                        </button>
                        <button
                            onClick={handleConfirmNameChange}
                            className="flex-1 px-4 py-2.5 bg-indigo-600 dark:bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                        >
                            Change Name
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Participant */}
      {participantToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setParticipantToDelete(null)}></div>
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6 relative z-20 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="bg-red-100 p-3 rounded-full mb-4">
                        <AlertTriangle className="text-red-600" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Remove Participant?</h3>
                    <p className="text-sm text-slate-500 mb-6">
                        Are you sure you want to remove this participant from the event? This action cannot be undone and will delete all attendance records associated with this event.
                    </p>
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={() => setParticipantToDelete(null)}
                            className="flex-1 px-4 py-2.5 bg-card border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmRemoveParticipant}
                            disabled={isDeleting}
                            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                        >
                            {isDeleting ? <Loader2 className="animate-spin" size={18} /> : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Event */}
      {eventToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDeleteEventModal}></div>
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6 relative z-20 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="bg-red-100 p-3 rounded-full mb-4">
                        <AlertTriangle className="text-red-600" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                        {eventView === 'deleted' && isAdmin ? 'Permanently Delete Event?' : 'Move Event to Deleted Events?'}
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                        {eventView === 'deleted' && isAdmin
                            ? 'This action cannot be undone and will delete all participants and attendance logs associated with this event.'
                            : 'This event will be hidden from normal event lists and can be restored later by an Administrator.'}
                    </p>
                    <div className="w-full mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-1">
                            {eventView === 'deleted' && isAdmin ? 'Event to permanently delete' : 'Event to move'}
                        </p>
                        <p className="text-sm font-semibold text-red-700 break-words">
                            {eventPendingDelete?.event_name || 'Selected event'}
                        </p>
                    </div>
                    <div className="w-full mb-6 text-left">
                        <label htmlFor="event-delete-confirmation" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                            Type "delete" to confirm
                        </label>
                        <input
                            id="event-delete-confirmation"
                            type="text"
                            value={eventDeleteConfirmation}
                            onChange={(e) => setEventDeleteConfirmation(e.target.value)}
                            placeholder='Type "delete"'
                            autoComplete="off"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                        />
                    </div>
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={closeDeleteEventModal}
                            className="flex-1 px-4 py-2.5 bg-card border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDeleteEvent}
                            disabled={isDeleting || eventDeleteConfirmation.trim().toLowerCase() !== 'delete'}
                            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600"
                        >
                            {isDeleting ? <Loader2 className="animate-spin" size={18} /> : eventView === 'deleted' && isAdmin ? 'Delete Forever' : 'Move to Deleted'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}


      {/* Event Access Settings Modal */}
      {showEventAccessModal && selectedAccessEvent && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeEventAccessModal}></div>
            <div className="relative z-20 flex h-[85vh] max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-card shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
                            <Settings size={18} className="text-indigo-600" />
                            Event Access Settings
                        </h3>
                        <p className="mt-1 truncate text-sm font-semibold text-indigo-700">{selectedAccessEvent.event_name}</p>
                        <p className="mt-1 text-xs text-slate-500">Only Admins and the owning Office Manager can assign users from another office.</p>
                    </div>
                    <button
                        type="button"
                        onClick={closeEventAccessModal}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close access settings"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
                    {canAssignAccessForSelectedEvent && (
                        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-slate-600">User</label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsAccessUserDropdownOpen((open) => !open)}
                                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-card px-3 py-2 text-left text-sm text-slate-900 transition-colors hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        aria-expanded={isAccessUserDropdownOpen}
                                    >
                                        <span className="min-w-0">
                                            {selectedAccessUser ? (
                                                <>
                                                    <span className="block truncate font-medium">{selectedAccessUser.full_name}</span>
                                                    <span className="block truncate text-xs text-slate-500">
                                                        @{selectedAccessUser.username} - {selectedAccessUser.offices?.code || 'No office'}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-slate-500">Select user</span>
                                            )}
                                        </span>
                                        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isAccessUserDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isAccessUserDropdownOpen && (
                                        <div className="absolute z-[90] mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-card shadow-xl">
                                            <div className="border-b border-slate-100 p-2">
                                                <div className="relative">
                                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        value={accessUserSearch}
                                                        onChange={(e) => setAccessUserSearch(e.target.value)}
                                                        placeholder="Search user or office"
                                                        className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>

                                            <div className="max-h-60 overflow-y-auto py-1">
                                                {filteredEventAccessUsers.length === 0 ? (
                                                    <div className="px-3 py-3 text-sm text-slate-500">No users found.</div>
                                                ) : (
                                                    filteredEventAccessUsers.slice(0, 25).map((accessUser) => {
                                                        const selected = selectedAccessUserId === String(accessUser.user_id);

                                                        return (
                                                            <button
                                                                key={accessUser.user_id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedAccessUserId(String(accessUser.user_id));
                                                                    setAccessUserSearch('');
                                                                    setIsAccessUserDropdownOpen(false);
                                                                }}
                                                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                                                                    selected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                <span className="min-w-0">
                                                                    <span className="block truncate font-medium">{accessUser.full_name}</span>
                                                                    <span className="block truncate text-xs text-slate-500">
                                                                        @{accessUser.username} - {accessUser.offices?.code || 'No office'}
                                                                    </span>
                                                                </span>
                                                                {selected && <Check size={15} className="shrink-0 text-indigo-600" />}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-2">Access</label>
                                <select
                                    value={selectedAccessRole}
                                    onChange={(e) => setSelectedAccessRole(e.target.value as EventAccessRole)}
                                    className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    <option value="ManagerScanner">Manager + Scanner</option>
                                    <option value="Manager">Manager only</option>
                                    <option value="Scanner">Scanner only</option>
                                </select>
                            </div>

                            <div className="flex items-end">
                                <button
                                    type="button"
                                    onClick={handleGrantEventAccess}
                                    disabled={!selectedAccessUserId || savingEventAccess}
                                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 lg:w-auto"
                                >
                                    {savingEventAccess ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                                    Assign
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-card">
                        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-800">Assigned Users</p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                        {loadingEventAccess ? (
                            <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500">
                                <Loader2 size={15} className="animate-spin text-indigo-500" />
                                Loading assigned users...
                            </div>
                        ) : eventAccessList.length === 0 ? (
                            <div className="px-4 py-4 text-sm text-slate-500">No users assigned to this event yet.</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {eventAccessList.map((access) => (
                                    <div key={access.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-800">
                                                {access.users?.full_name || `User #${access.user_id}`}
                                            </p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                <span>@{access.users?.username || 'unknown'}</span>
                                                <span>{access.users?.offices?.code || 'No office'}</span>
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                                access.status === 'Active'
                                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                                            }`}>
                                                {access.status}
                                            </span>
                                            {editingAccessId === access.id ? (
                                                <>
                                                    <select
                                                        value={editingAccessRole}
                                                        onChange={(e) => setEditingAccessRole(e.target.value as EventAccessRole)}
                                                        disabled={updatingAccessId === access.id}
                                                        className="rounded-lg border border-slate-300 bg-card px-2.5 py-1 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    >
                                                        <option value="ManagerScanner">Manager + Scanner</option>
                                                        <option value="Manager">Manager only</option>
                                                        <option value="Scanner">Scanner only</option>
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateEventAccessRole(access)}
                                                        disabled={updatingAccessId === access.id}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {updatingAccessId === access.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelEditEventAccess}
                                                        disabled={updatingAccessId === access.id}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <X size={14} />
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                                                        {access.access_role === 'ManagerScanner' ? 'Manager + Scanner' : access.access_role}
                                                    </span>
                                                    {canAssignAccessForSelectedEvent && access.status === 'Active' && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditEventAccess(access)}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                                                            >
                                                                <Edit size={14} />
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRevokeEventAccess(access)}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                                                            >
                                                                <XCircle size={14} />
                                                                Revoke
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}


      {showEventCodeInfo && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowEventCodeInfo(false)}></div>
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-3xl relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
                <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Info size={18} className="text-indigo-600" />
                        Event Code Reference
                    </h3>
                    <button
                        type="button"
                        onClick={() => setShowEventCodeInfo(false)}
                        className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-5 bg-slate-50">
                    <img
                        src="/assets/Reference_Number_CA_Sample.png"
                        alt="Reference Number CA Sample"
                        className="w-full h-auto rounded-lg border border-slate-200 shadow-sm"
                    />
                </div>
            </div>
        </div>
      )}

      {/* Create/Edit Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">

          {/* Backdrop */}
          <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              aria-hidden="true"
              onClick={() => setShowEventModal(false)}
          ></div>

          {/* Right-side drawer panel */}
          <div className="fixed inset-y-0 right-0 flex w-full max-w-[500px] flex-col bg-card shadow-2xl animate-in slide-in-from-right duration-200">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-slate-900" id="modal-title">
                  {editingEventId ? 'Edit Event' : 'New Event'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Fill in the details below</p>
              </div>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-full transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="flex-1 min-h-0 flex flex-col">

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Event Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Event Name<span className="text-red-500">*</span></label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Type className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    </div>
                    <input
                      required
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all"
                      placeholder="e.g. Trainings on Crisis Management for LGUs (Batch 1)"
                      value={formData.event_name}
                      onChange={e => setFormData({...formData, event_name: e.target.value})}
                    />
                  </div>
                </div>

                {/* Organized By + Event Code */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {user?.role === 'Admin' && (
                      <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">Organized By<span className="text-red-500">*</span></label>
                          <div className="relative group">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Building2 className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                              </div>
                              <select
                                  className="block w-full pl-10 pr-8 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm bg-card transition-all appearance-none"
                                  value={formData.organize_by || ''}
                                  onChange={e => setFormData({...formData, organize_by: e.target.value ? Number(e.target.value) : null})}
                              >
                                  <option value="">-- Select Office --</option>
                                  {offices.map(office => (
                                      <option key={office.office_id} value={office.office_id}>
                                          {office.name} ({office.code})
                                      </option>
                                  ))}
                              </select>
                              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                              </div>
                          </div>
                      </div>
                  )}

                  <div className={user?.role === 'Admin' ? '' : 'sm:col-span-2'}>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
                          Event Code
                          <button
                              type="button"
                              onClick={() => setShowEventCodeInfo(true)}
                              aria-label="View Event Code reference"
                              title="View Event Code reference"
                              className="text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                              <Info size={13} />
                          </button>
                      </label>
                      <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Hash className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                          </div>
                          <input
                              maxLength={12}
                              className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all"
                              placeholder="Example: RGM"
                              value={formData.event_serial || ''}
                              onChange={e => {
                                  setFormData({...formData, event_serial: e.target.value});
                                  setHasEventCode(!!e.target.value.trim());
                              }}
                          />
                      </div>
                  </div>
                </div>

                {/* Venue */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Venue<span className="text-red-500">*</span></label>
                  <div className="relative group">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MapPin className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                      </div>
                      <input
                        required
                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all"
                        placeholder="e.g. Apple Tree Resort and Hotel, Taboc, Opol, Misamis Oriental"
                        value={formData.venue}
                        onChange={e => {
                            setFormData({...formData, venue: e.target.value});
                            setShowVenueSuggestions(e.target.value.trim().length >= 2 && venueSuggestions.length > 0);
                        }}
                        onFocus={() => {
                            venueInputFocusedRef.current = true;
                            if (venueSuggestions.length > 0 || loadingVenueSuggestions) {
                                setShowVenueSuggestions(true);
                            }
                        }}
                        onBlur={() => {
                            venueInputFocusedRef.current = false;
                            window.setTimeout(() => setShowVenueSuggestions(false), 150);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                setShowVenueSuggestions(false);
                            }
                        }}
                        autoComplete="off"
                        aria-autocomplete="list"
                        aria-expanded={showVenueSuggestions}
                        aria-controls="venue-suggestions"
                      />
                    </div>
                    {showVenueSuggestions && (loadingVenueSuggestions || venueSuggestions.length > 0) && (
                      <div
                        id="venue-suggestions"
                        role="listbox"
                        className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-card shadow-xl animate-in fade-in zoom-in-95 duration-100"
                      >
                        {loadingVenueSuggestions && venueSuggestions.length === 0 ? (
                          <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                            <Loader2 size={14} className="animate-spin text-indigo-500" />
                            Searching venues...
                          </div>
                        ) : (
                          venueSuggestions.map((venue) => (
                            <button
                              key={venue}
                              type="button"
                              role="option"
                              onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectVenueSuggestion(venue);
                              }}
                              className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700 focus:bg-indigo-50 focus:text-indigo-700 focus:outline-none"
                            >
                              <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                              <span className="min-w-0 break-words">{venue}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Schedule ── */}
                <div className="flex items-center gap-2 pt-2">
                  <Calendar size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shrink-0">Schedule</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Start Date<span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      required
                      className="block w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all"
                      value={formData.start_date}
                      onChange={e => updateEventDates('start_date', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">End Date<span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      required
                      className="block w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all"
                      value={formData.end_date}
                      onChange={e => updateEventDates('end_date', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Event Session</label>
                  <div className="relative">
                    <select
                        className="block w-full px-3 pr-8 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm bg-card transition-all appearance-none"
                        value={formData.session || 'All_Day'}
                        onChange={e => setFormData({...formData, session: e.target.value as Event['session']})}
                    >
                        <option value="AM">AM Only</option>
                        <option value="PM">PM Only</option>
                        <option value="All_Day">All Day</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* ── Accommodation ── */}
                <div className="flex items-center gap-2 pt-2">
                  <Bed size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shrink-0">Accommodation</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <label className="flex items-center gap-3 cursor-pointer w-fit group">
                  <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${formData.has_accommodation ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                    <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out ${formData.has_accommodation ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </span>
                  <input
                      type="checkbox"
                      className="hidden"
                      checked={formData.has_accommodation || false}
                      onChange={e => toggleFormAccommodation(e.target.checked)}
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">Include accommodation</span>
                </label>

                {formData.has_accommodation && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">Accommodation Dates</p>
                                <p className="text-xs text-slate-500">Select which event dates include accommodation.</p>
                            </div>
                            <span className="text-xs font-semibold text-indigo-700 bg-card border border-indigo-100 px-2 py-1 rounded-full">
                                {(formData.dates_with_accom || []).length} day(s)
                            </span>
                        </div>

                        {formEventDates.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {formEventDates.map((date) => {
                                    const isChecked = (formData.dates_with_accom || []).includes(date);
                                    return (
                                        <label
                                            key={date}
                                            className={`inline-flex w-fit items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                                                isChecked ? 'border-indigo-400 bg-card text-indigo-700' : 'border-slate-200 bg-white/70 text-slate-700 hover:border-indigo-300'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleFormAccommodationDate(date)}
                                                className="h-3.5 w-3.5 flex-shrink-0 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                            />
                                            <span className="whitespace-nowrap text-[13px] font-medium leading-tight">{formatAccommodationDateLabel(date)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Select the event start and end dates first.</p>
                        )}
                    </div>
                )}

                {/* ── Meals Included ── */}
                <div className="flex items-center gap-2 pt-2">
                  <Utensils size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shrink-0">Meals Included</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Select meals provided at this event</p>
                    <button
                        type="button"
                        onClick={selectAllMealsForAllDates}
                        disabled={formEventDates.length === 0}
                        className="text-xs font-medium text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline"
                    >
                        Select all
                    </button>
                  </div>

                  {formEventDates.length === 0 ? (
                      <p className="text-xs text-slate-400">Select the event start and end dates first.</p>
                  ) : showPerDayMeals ? (
                      <div className="space-y-3">
                          {formEventDates.map((date) => {
                              const selectedMeals = foodInclusionByDate[date] || [];
                              return (
                                  <div key={date} className="rounded-xl border border-slate-200 bg-card p-3">
                                      <p className="mb-2.5 text-sm font-semibold text-slate-800">
                                          {formatAccommodationDateLabel(date)}
                                      </p>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                          {FOOD_MEAL_OPTIONS.map((meal) => {
                                              const isChecked = selectedMeals.includes(meal);
                                              return (
                                                  <label
                                                      key={`${date}-${meal}`}
                                                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                                          isChecked
                                                            ? 'border-indigo-300 bg-indigo-50/50 text-slate-800'
                                                            : 'border-slate-200 bg-card text-slate-700 hover:border-slate-300'
                                                      }`}
                                                  >
                                                      <input
                                                          type="checkbox"
                                                          checked={isChecked}
                                                          onChange={() => toggleFoodInclusionMeal(date, meal)}
                                                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                      />
                                                      <span className="text-sm font-medium">{meal}</span>
                                                  </label>
                                              );
                                          })}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {FOOD_MEAL_OPTIONS.map((meal) => {
                              const isChecked = isMealOnAllDates(meal);
                              return (
                                  <label
                                      key={meal}
                                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                                          isChecked
                                            ? 'border-indigo-300 bg-indigo-50/50 text-slate-800'
                                            : 'border-slate-200 bg-card text-slate-700 hover:border-slate-300'
                                      }`}
                                  >
                                      <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => toggleMealForAllDates(meal)}
                                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                      />
                                      <span className="text-sm font-medium">{meal}</span>
                                  </label>
                              );
                          })}
                      </div>
                  )}

                  {formEventDates.length > 1 && !mealsDifferAcrossDates && (
                      <button
                          type="button"
                          onClick={() => setCustomizeMealsPerDay(v => !v)}
                          className="text-xs text-slate-400 hover:text-indigo-600 hover:underline"
                      >
                          {customizeMealsPerDay ? 'Apply the same meals to all days' : 'Customize per day'}
                      </button>
                  )}
                </div>

                {/* ── Giveaways ── */}
                <div className="flex items-center gap-2 pt-2">
                  <Gift size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shrink-0">Giveaways</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <label className="flex items-center gap-3 cursor-pointer w-fit group">
                  <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${showGiveawayEditor ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                    <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out ${showGiveawayEditor ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </span>
                  <input
                      type="checkbox"
                      className="hidden"
                      checked={showGiveawayEditor}
                      onChange={e => {
                          if (e.target.checked) {
                              setGiveawaysEnabled(true);
                          } else {
                              setGiveawaysEnabled(false);
                              setFormData({ ...formData, giveaways: [] });
                          }
                      }}
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">Include giveaways</span>
                </label>

                {showGiveawayEditor && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-500">Items participants can request at registration (e.g. T-shirt size).</p>
                            <button
                                type="button"
                                onClick={addGiveaway}
                                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                            >
                                <UserPlus size={13} /> Add item
                            </button>
                        </div>

                        {((formData.giveaways as GiveawayItem[]) || []).length > 0 && (
                            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-card px-3 py-2.5 cursor-pointer group">
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-slate-800">Giveaway selection {formData.giveaways_open ? 'open' : 'closed'}</span>
                                    <span className="block text-xs text-slate-500">When closed, new registrants can no longer pick sizes / answers — existing choices are kept.</span>
                                </span>
                                <span className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${formData.giveaways_open ? 'bg-green-500' : 'bg-slate-300'}`}>
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out ${formData.giveaways_open ? 'translate-x-4' : 'translate-x-0'}`}
                                    />
                                </span>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={formData.giveaways_open ?? true}
                                    onChange={e => setFormData({ ...formData, giveaways_open: e.target.checked })}
                                />
                            </label>
                        )}

                        {((formData.giveaways as GiveawayItem[]) || []).length === 0 ? (
                            <p className="text-xs text-slate-400">No giveaways configured yet. Click "Add item" to create one.</p>
                        ) : (
                            <div className="space-y-3">
                                {((formData.giveaways as GiveawayItem[]) || []).map((g, idx) => (
                                    <div key={g.key} className="space-y-3 rounded-xl border border-slate-200 bg-card p-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-600 mb-1">Item label</label>
                                                <input
                                                    type="text"
                                                    value={g.label}
                                                    onChange={(e) => updateGiveaway(idx, { label: e.target.value })}
                                                    placeholder="e.g. Event T-shirt"
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-600 mb-1">Response type</label>
                                                <select
                                                    value={g.type}
                                                    onChange={(e) => updateGiveaway(idx, { type: e.target.value as GiveawayItem['type'] })}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                                >
                                                    <option value="single-select">Choose an option (e.g. size)</option>
                                                    <option value="boolean">Yes / No</option>
                                                </select>
                                            </div>
                                        </div>

                                        {g.type === 'single-select' && (
                                            <div>
                                                <label className="block text-xs font-medium text-slate-600 mb-1">Options (comma-separated)</label>
                                                <input
                                                    type="text"
                                                    value={(g.options || []).join(',')}
                                                    onChange={(e) => updateGiveaway(idx, { options: e.target.value.split(',') })}
                                                    placeholder="XS, S, M, L, XL, 2XL"
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                                />
                                            </div>
                                        )}

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex flex-wrap items-center gap-4">
                                            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={g.required || false}
                                                    onChange={(e) => updateGiveaway(idx, { required: e.target.checked })}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                                Required at registration
                                            </label>
                                            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={g.include_in_attendance || false}
                                                    onChange={(e) => updateGiveaway(idx, { include_in_attendance: e.target.checked })}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                                Add to attendance sheet
                                            </label>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeGiveaway(idx)}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 size={14} /> Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Registration ── */}
                <div className="flex items-center gap-2 pt-2">
                  <Users size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shrink-0">Registration</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Registration Status</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formData.registration_open ? 'Participants can register for this event' : 'Registration is closed for this event'}
                    </p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setFormData({...formData, registration_open: !formData.registration_open})}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          formData.registration_open
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                  >
                      <span className={`w-1.5 h-1.5 rounded-full ${formData.registration_open ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {formData.registration_open ? 'Open' : 'Closed'}
                  </button>
                </div>

                <div className={`rounded-xl border px-4 py-3.5 transition-colors ${
                    formData.auto_attendance_on_registration
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-slate-200 bg-slate-50/60'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <label
                        htmlFor="auto-attendance-on-registration"
                        className="block cursor-pointer text-sm font-semibold text-slate-800"
                      >
                        Auto attendance on registration
                      </label>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        When this option is enabled, the attendance time of participants who register on the day of the event will be recorded automatically.
                      </p>
                    </div>
                    <button
                      id="auto-attendance-on-registration"
                      type="button"
                      role="switch"
                      aria-checked={Boolean(formData.auto_attendance_on_registration)}
                      aria-label="Auto attendance on registration"
                      onClick={() => setFormData({
                        ...formData,
                        auto_attendance_on_registration: !formData.auto_attendance_on_registration
                      })}
                      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        formData.auto_attendance_on_registration ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                          formData.auto_attendance_on_registration ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className={`mt-2 text-[11px] font-semibold ${
                    formData.auto_attendance_on_registration ? 'text-emerald-700' : 'text-slate-500'
                  }`}>
                    {formData.auto_attendance_on_registration ? 'Enabled' : 'Off by default'}
                  </p>
                </div>

                <div className={`rounded-xl border px-4 py-3.5 transition-colors ${
                    formData.has_principal_delegates
                      ? 'border-amber-200 bg-amber-50/70'
                      : 'border-slate-200 bg-slate-50/60'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <label
                        htmlFor="has-principal-delegates"
                        className="block cursor-pointer text-sm font-semibold text-slate-800"
                      >
                        Principal / Representative delegates
                      </label>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        When enabled, delegates are registered as either a Principal or a Representative sent in the Principal's place. Principal arrivals are announced to your office when their QR code is scanned.
                      </p>
                    </div>
                    <button
                      id="has-principal-delegates"
                      type="button"
                      role="switch"
                      aria-checked={Boolean(formData.has_principal_delegates)}
                      aria-label="Principal / Representative delegates"
                      onClick={() => setFormData({
                        ...formData,
                        has_principal_delegates: !formData.has_principal_delegates
                      })}
                      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        formData.has_principal_delegates ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                          formData.has_principal_delegates ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className={`mt-2 text-[11px] font-semibold ${
                    formData.has_principal_delegates ? 'text-amber-700' : 'text-slate-500'
                  }`}>
                    {formData.has_principal_delegates ? 'Enabled' : 'Off by default'}
                  </p>
                </div>

              </div>

              {/* Footer actions */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-card">
                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-card border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-all"
                  >
                    {editingEventId ? 'Save Changes' : 'Create Event'}
                  </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsList;
