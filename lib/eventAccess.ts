import { supabase } from './supabase';
import { Event, EventAccessRole, User } from '../types/database';

export const MANAGE_EVENT_ACCESS_ROLES: EventAccessRole[] = ['Manager', 'ManagerScanner'];
export const SCAN_EVENT_ACCESS_ROLES: EventAccessRole[] = ['Scanner', 'ManagerScanner'];
/** Any assignment at all — used when access role doesn't narrow the result. */
export const ALL_EVENT_ACCESS_ROLES: EventAccessRole[] = ['Manager', 'Scanner', 'ManagerScanner'];

type DeletedView = 'active' | 'deleted' | 'all';

interface FetchAccessibleEventsOptions {
  accessRoles?: EventAccessRole[];
  statuses?: Event['status'][];
  deletedView?: DeletedView;
  dateContains?: string;
  startsAfter?: string;
  excludeCancelled?: boolean;
  orderBy?: 'start_date' | 'deleted_at' | 'event_name';
  ascending?: boolean;
}

const applyEventFilters = (query: any, options: FetchAccessibleEventsOptions) => {
  let nextQuery = query;

  if (options.statuses?.length) {
    nextQuery = nextQuery.in('status', options.statuses);
  }

  if (options.deletedView === 'deleted') {
    nextQuery = nextQuery.not('deleted_at', 'is', null);
  } else if (options.deletedView !== 'all') {
    nextQuery = nextQuery.is('deleted_at', null);
  }

  if (options.dateContains) {
    nextQuery = nextQuery
      .lte('start_date', options.dateContains)
      .gte('end_date', options.dateContains);
  }

  if (options.startsAfter) {
    nextQuery = nextQuery.gt('start_date', options.startsAfter);
  }

  if (options.excludeCancelled) {
    nextQuery = nextQuery.neq('status', 'Cancelled');
  }

  if (options.orderBy) {
    nextQuery = nextQuery.order(options.orderBy, { ascending: options.ascending ?? false });
  }

  return nextQuery;
};

const sortEvents = (events: Event[], options: FetchAccessibleEventsOptions) => {
  const direction = options.ascending ? 1 : -1;
  const key = options.orderBy;
  if (!key) return events;

  return [...events].sort((a, b) => {
    const aValue = a[key] ?? '';
    const bValue = b[key] ?? '';

    if (key === 'event_name') {
      return String(aValue).localeCompare(String(bValue)) * direction;
    }

    const aTime = aValue ? new Date(String(aValue)).getTime() : 0;
    const bTime = bValue ? new Date(String(bValue)).getTime() : 0;
    return (aTime - bTime) * direction;
  });
};

export const fetchAccessibleEvents = async (
  user: User | null | undefined,
  options: FetchAccessibleEventsOptions = {}
): Promise<Event[]> => {
  if (!user) return [];

  const normalizedOptions: FetchAccessibleEventsOptions = {
    deletedView: 'active',
    accessRoles: MANAGE_EVENT_ACCESS_ROLES,
    ...options
  };

  const eventMap = new Map<number, Event>();

  if (user.role === 'Admin') {
    const { data, error } = await applyEventFilters(
      supabase.from('events').select('*'),
      normalizedOptions
    );

    if (error) throw error;
    return sortEvents((data || []) as Event[], normalizedOptions);
  }

  if (user.office_id) {
    const { data, error } = await applyEventFilters(
      supabase.from('events').select('*').eq('organize_by', user.office_id),
      normalizedOptions
    );

    if (error) throw error;
    ((data || []) as Event[]).forEach((event) => eventMap.set(event.event_id, event));
  }

  const { data: accessRows, error: accessError } = await supabase
    .from('event_user_access')
    .select('event_id')
    .eq('user_id', user.user_id)
    .eq('status', 'Active')
    .in('access_role', normalizedOptions.accessRoles || MANAGE_EVENT_ACCESS_ROLES);

  if (accessError) throw accessError;

  const assignedEventIds = Array.from(
    new Set((accessRows || []).map((row: any) => Number(row.event_id)).filter(Boolean))
  );

  if (assignedEventIds.length > 0) {
    const { data, error } = await applyEventFilters(
      supabase.from('events').select('*').in('event_id', assignedEventIds),
      normalizedOptions
    );

    if (error) throw error;
    ((data || []) as Event[]).forEach((event) => eventMap.set(event.event_id, event));
  }

  return sortEvents(Array.from(eventMap.values()), normalizedOptions);
};

export const isEventOwnerOffice = (user: User | null | undefined, event: Pick<Event, 'organize_by'>) => {
  return Boolean(user?.office_id && event.organize_by === user.office_id);
};

const isValidEventId = (eventId: number) => Number.isSafeInteger(eventId) && eventId > 0;

export const canAccessEvent = async (
  user: User | null | undefined,
  eventId: number,
  accessRoles: EventAccessRole[] = MANAGE_EVENT_ACCESS_ROLES
): Promise<boolean> => {
  if (!user || !isValidEventId(eventId)) return false;

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('event_id, organize_by')
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) return false;
  if (user.role === 'Admin') return true;
  if (user.office_id && event.organize_by === user.office_id) return true;

  const { data: access, error: accessError } = await supabase
    .from('event_user_access')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', user.user_id)
    .eq('status', 'Active')
    .in('access_role', accessRoles)
    .limit(1)
    .maybeSingle();

  if (accessError) throw accessError;
  return Boolean(access);
};

export const fetchAccessibleEventIds = async (
  user: User | null | undefined,
  accessRoles: EventAccessRole[] = MANAGE_EVENT_ACCESS_ROLES
): Promise<number[]> => {
  if (!user) return [];

  if (user.role === 'Admin') {
    const { data, error } = await supabase
      .from('events')
      .select('event_id')
      .is('deleted_at', null);

    if (error) throw error;
    return (data || []).map((event: any) => Number(event.event_id)).filter(isValidEventId);
  }

  const eventIds = new Set<number>();

  if (user.office_id) {
    const { data, error } = await supabase
      .from('events')
      .select('event_id')
      .eq('organize_by', user.office_id)
      .is('deleted_at', null);

    if (error) throw error;
    (data || []).forEach((event: any) => {
      const id = Number(event.event_id);
      if (isValidEventId(id)) eventIds.add(id);
    });
  }

  const { data: accessRows, error: accessError } = await supabase
    .from('event_user_access')
    .select('event_id')
    .eq('user_id', user.user_id)
    .eq('status', 'Active')
    .in('access_role', accessRoles);

  if (accessError) throw accessError;

  const assignedEventIds = Array.from(new Set(
    (accessRows || [])
      .map((row: any) => Number(row.event_id))
      .filter(isValidEventId)
  ));

  if (assignedEventIds.length > 0) {
    const { data, error } = await supabase
      .from('events')
      .select('event_id')
      .in('event_id', assignedEventIds)
      .is('deleted_at', null);

    if (error) throw error;
    (data || []).forEach((event: any) => {
      const id = Number(event.event_id);
      if (isValidEventId(id)) eventIds.add(id);
    });
  }

  return Array.from(eventIds);
};
