import { supabase } from './supabase';
import { AuditAction, AuditEntityType, AuditFieldChange, User } from '../types/database';

/**
 * Audit trail writer.
 *
 * Auth is custom (public.users + bcrypt on the client), so Postgres has no
 * `auth.uid()` to derive the actor from — database triggers cannot attribute a
 * change to a user. Every audited mutation therefore calls `logAudit` right
 * after it succeeds, passing the signed-in user explicitly.
 *
 * Failures are swallowed and logged to the console, exactly like
 * `recordLoginActivity` in AuthContext: a broken audit write must never take
 * down the action the user actually asked for.
 */

export interface AuditEntry {
  /** The signed-in user from `useAuth()`. Snapshotted so the trail survives their deletion. */
  actor: User | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: number | null;
  /** Human-readable name of the affected record at the time of the action. */
  entityLabel?: string | null;
  eventId?: number | null;
  eventName?: string | null;
  /** Only the fields that changed. An `Update` with nothing here is not logged. */
  changes?: Record<string, AuditFieldChange> | null;
  /** Full row, kept for deletes so the record is still inspectable afterwards. */
  snapshot?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Never stored, in `changes` or in `snapshot`. */
const SENSITIVE_FIELDS = ['password_hash', 'password'];

const REDACTED_FROM = '(hidden)';
const REDACTED_TO = '(changed)';

/** '' and undefined both mean "no value" across these forms; treat them as NULL. */
const normalizeValue = (value: unknown): unknown => {
  if (value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.map(normalizeValue);
  return value;
};

const isNumericLike = (value: unknown): boolean =>
  typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));

const valuesEqual = (before: unknown, after: unknown): boolean => {
  const a = normalizeValue(before);
  const b = normalizeValue(after);

  if (a === null || b === null) return a === b;

  // `<select>` yields "3" where the DB returns 3; that is not a change.
  if (isNumericLike(a) && isNumericLike(b)) return Number(a) === Number(b);

  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return a === b;
};

/**
 * Compares an update payload against the record as it was, returning only the
 * fields that actually changed — or `null` when nothing did.
 *
 * This matters: the Add Participant modals fire `.update()` on every submit
 * even when the user edited nothing, so logging the raw payload would fill the
 * trail with no-op rows.
 *
 * Only keys present in `after` are considered, so passing an update payload
 * against a full DB row does the right thing.
 */
export const diffRecords = (
  before: Record<string, any> | null | undefined,
  after: Record<string, any>,
  options: { ignore?: string[] } = {}
): Record<string, AuditFieldChange> | null => {
  const ignore = new Set(options.ignore || []);
  const changes: Record<string, AuditFieldChange> = {};

  Object.keys(after).forEach((key) => {
    if (ignore.has(key)) return;

    const beforeValue = before ? before[key] : undefined;
    const afterValue = after[key];

    if (valuesEqual(beforeValue, afterValue)) return;

    if (SENSITIVE_FIELDS.includes(key)) {
      changes[key === 'password_hash' ? 'password' : key] = { from: REDACTED_FROM, to: REDACTED_TO };
      return;
    }

    changes[key] = { from: normalizeValue(beforeValue), to: normalizeValue(afterValue) };
  });

  return Object.keys(changes).length > 0 ? changes : null;
};

/** Copy of a row with sensitive fields removed, safe to persist as a snapshot. */
export const sanitizeSnapshot = (
  row: Record<string, any> | null | undefined
): Record<string, unknown> | null => {
  if (!row) return null;

  const clean: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (SENSITIVE_FIELDS.includes(key)) return;
    if (typeof value === 'function') return;
    clean[key] = value;
  });

  return clean;
};

export const logAudit = async (entry: AuditEntry): Promise<void> => {
  // An Update that changed nothing is not worth a row.
  if (entry.action === 'Update' && !entry.changes) return;

  try {
    const { error } = await supabase.from('audit_logs').insert([{
      actor_user_id: entry.actor?.user_id ?? null,
      actor_name: entry.actor?.full_name ?? null,
      actor_role: entry.actor?.role ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      event_id: entry.eventId ?? null,
      event_name: entry.eventName ?? null,
      changes: entry.changes ?? null,
      snapshot: entry.snapshot ?? null,
      reason: entry.reason ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    }]);

    if (error) console.error('Error writing audit log:', error);
  } catch (err) {
    console.error('Error writing audit log:', err);
  }
};

/** Column names as they should read in the Audit Logs UI. */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  // events
  event_name: 'Event Name',
  venue: 'Venue',
  start_date: 'Start Date',
  end_date: 'End Date',
  event_serial: 'Reference Code',
  status: 'Status',
  session: 'Session',
  organize_by: 'Organizing Office',
  has_accommodation: 'Accommodation',
  days_accommodation: 'Accommodation Days',
  dates_with_accom: 'Accommodation Dates',
  food_inclusion: 'Food Inclusion',
  giveaways: 'Giveaways',
  giveaways_open: 'Giveaway Selection Open',
  registration_open: 'Registration Open',
  auto_attendance_on_registration: 'Auto Attendance on Registration',
  has_principal_delegates: 'Principal / Representative Delegates',
  has_item_borrowing: 'Item Borrowing',
  cop_primary_signatory_id: 'COP Primary Signatory',
  cop_secondary_signatory_id: 'COP Secondary Signatory',
  deleted_at: 'Deleted At',
  deleted_by: 'Deleted By',
  delete_reason: 'Delete Reason',

  // participants
  f_name: 'First Name',
  l_name: 'Last Name',
  m_initial: 'Middle Initial',
  suffix: 'Suffix',
  full_name: 'Full Name',
  email: 'Email',
  mobile_no: 'Mobile No.',
  position: 'Position',
  prc_license_no: 'PRC License No.',
  office: 'Office',
  location_id: 'Location',
  gender: 'Gender',
  age_group: 'Age Group',
  pwd: 'PWD',
  indigenous_people: 'Indigenous People',

  // event_participants
  role: 'Role',
  delegate_type: 'Delegate Type',
  needs_accommodation: 'Needs Accommodation',
  accommodation_pax: 'Accommodation Pax',
  date_accommodation: 'Accommodation Dates',
  accept_photo_video: 'Photo/Video Consent',
  store_to_db: 'Store to Database',
  need_ca: 'Needs Certificate of Appearance',
  giveaway_selections: 'Giveaway Selections',
  registration_status: 'Registration Status',
  attendance_logs_deleted: 'Attendance Records Removed',

  // users
  username: 'Username',
  password: 'Password',
  office_id: 'Office'
};

export const formatAuditFieldLabel = (field: string): string =>
  AUDIT_FIELD_LABELS[field] ||
  field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Renders a stored `changes` value for display. */
export const formatAuditValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value
      .map((item) => (item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);

  const text = String(value);
  return text.trim() === '' ? '—' : text;
};
