
export type UserRole = 'Admin' | 'Scanner' | 'EventManager' | 'OfficeManager';

export interface RefLocation {
  location_id: number;
  province_huc: string;
  city_mun: string | null;
}

export interface Office {
  office_id: number;
  code: string;
  name: string;
  created_at?: string;
}

export interface User {
  user_id: number;
  full_name: string;
  email?: string | null;
  password_hash: string;
  username: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  created_at?: string;
  position: string;
  office_id?: number | null;
  img_link?: string | null;
  auth_user_id?: string | null;
  /** Guide id → ISO timestamp of when the user finished or skipped that walkthrough. */
  guides_seen?: Record<string, string> | null;
}

export type EventAccessRole = 'Manager' | 'Scanner' | 'ManagerScanner';

export interface EventUserAccess {
  id: number;
  event_id: number;
  user_id: number;
  access_role: EventAccessRole;
  assigned_by?: number | null;
  assigned_at?: string;
  status: 'Active' | 'Revoked';
}

// A single giveaway/freebie an event offers (e.g. T-shirt with sizes, or a yes/no cap).
// `key` is the stable machine id used to store answers; `label` is the display text.
export type GiveawayType = 'single-select' | 'boolean';

export interface GiveawayItem {
  key: string;
  label: string;
  type: GiveawayType;
  required?: boolean;
  include_in_attendance?: boolean;
  options?: string[]; // used when type === 'single-select'
}

export interface Event {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string; // ISO string (Date)
  end_date: string;   // ISO string (Date)
  event_serial?: string | null;
  status: 'Scheduled' | 'Ongoing' | 'Completed' | 'Cancelled';
  created_at?: string;
  organize_by?: number | null;
  cop_primary_signatory_id?: number | null;
  cop_secondary_signatory_id?: number | null;
  has_accommodation?: boolean | null;
  registration_open: boolean;
  // When enabled, public Event Registration submissions made on an event date
  // create attendance for that date (AM for All Day/AM, PM for PM events).
  auto_attendance_on_registration?: boolean | null;
  session: 'AM' | 'PM' | 'All_Day';
  days_accommodation?: number | null;
  dates_with_accom?: string[] | null;
  food_inclusion?: string[] | null;
  giveaways?: GiveawayItem[] | null;
  // When false, giveaway selection is closed: new registrants can no longer pick
  // sizes / Yes-No answers, though existing selections are kept. Defaults to open.
  giveaways_open?: boolean | null;
  // When enabled, Delegates are further classified as Principal or Representative,
  // and Principal arrivals are announced on scan.
  has_principal_delegates?: boolean | null;
  has_item_borrowing?: boolean | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  delete_reason?: string | null;
}

export interface Participant {
  participant_id: number;
  participant_code: string;
  full_name: string;
  f_name: string;
  l_name: string;
  m_initial?: string | null;
  suffix?: string | null;
  gender?: string | null;
  position?: string | null;
  prc_license_no?: string | null;
  office?: string | null;
  email?: string | null;
  created_at?: string;
  age_group?: string | null;
  pwd?: string | null;
  indigenous_people?: string | null;
  mobile_no?: string | null;
  location_id?: number | null;
}

// Sub-classification of a Delegate on events with `has_principal_delegates`.
// A Principal holds the seat; a Representative attends in the Principal's place.
// NULL means an ordinary delegate claiming neither — what the registration form
// offers as "Attendee" — and is also the value for any role other than
// 'Delegate'. Only these two values are ever persisted.
export type DelegateType = 'Principal' | 'Representative';

export interface EventParticipant {
  id: number;
  event_id: number;
  participant_id: number;
  registration_status: 'Registered' | 'Cancelled';
  registered_at?: string;
  accommodation_pax?: number | null;
  role: 'Delegate' | 'Speaker' | 'Secretariat' | 'Guest' | 'VIP';
  delegate_type?: DelegateType | null;
  needs_accommodation?: boolean | null;
  accept_photo_video?: boolean | null;
  store_to_db?: boolean | null;
  date_accommodation?: string[] | null;
  ca_serial_no?: number | null;
  ca_issued_at?: string | null;
  need_ca?: boolean | null;
  giveaway_selections?: Record<string, string | boolean> | null;
  ca_email_sent_at?: string | null;
  cop_email_sent_at?: string | null;
  qr_email_sent_at?: string | null;
}

export interface AttendanceLog {
  attendance_id: number;
  event_id: number | null;
  participant_id: number | null;
  user_id: number | null;
  attendance_date: string; // YYYY-MM-DD
  scan_time: string; // timestamp with time zone
  scan_status: 'Valid' | 'Duplicate' | 'Invalid' | 'Late';
  scanner_device?: string | null;
  remarks?: string | null;
  action_session: 'AM' | 'PM';
}

// Helper types for joins
export interface ParticipantWithQR extends Participant {
  // Keeping for compatibility, though QR table is removed
}

export interface AttendanceLogWithDetails extends AttendanceLog {
  participants?: {
    full_name: string;
    f_name: string;
    l_name: string;
    m_initial?: string | null;
    suffix?: string | null;
    participant_code: string;
    office?: string | null;
    gender?: string | null;
    position?: string | null;
    email?: string | null;
  };
  events?: {
    event_name: string;
    venue?: string;
    start_date?: string;
    end_date?: string;
  };
  users?: {
    full_name: string;
    email?: string;
  };
}

/** How a Principal delegate's arrival was recorded at the scanner. */
export type PrincipalArrivalSource = 'Scan' | 'Promoted' | 'AutoRegistered';

export interface PrincipalArrivalLog {
  arrival_id: number;
  event_id: number;
  participant_id: number;
  user_id?: number | null;
  arrived_at: string;
  arrival_date: string; // YYYY-MM-DD
  source: PrincipalArrivalSource;
  scanner_device?: string | null;
  remarks?: string | null;
}

// ─── Pre-test / Post-test ────────────────────────────────────────────────────
// A test exists for an event only when an `event_tests` row is present, so there
// is no per-event boolean to keep in sync. See lib/eventTests.ts.

export type EventTestType = 'Pre' | 'Post';

/** One option of a multiple-choice question. `key` is what a submission stores. */
export interface EventTestChoice {
  key: string;
  label: string;
}

export interface EventTest {
  test_id: number;
  event_id: number;
  test_type: EventTestType;
  title: string;
  instructions?: string | null;
  /** Percent benchmark shown in the results report. Never gates a certificate. */
  passing_score?: number | null;
  /** Closed means the QR still resolves but no new submissions are accepted. */
  is_open: boolean;
  /** Whether the participant sees their score on the thank-you screen. */
  show_score: boolean;
  created_at?: string;
}

export interface EventTestQuestion {
  question_id: number;
  test_id: number;
  position: number;
  question_text: string;
  choices: EventTestChoice[];
  correct_key: string;
  points: number;
}

/** A question as handed to the public test page — the answer key is stripped. */
export type EventTestPublicQuestion = Omit<EventTestQuestion, 'test_id' | 'correct_key'>;

/** Shape returned by the `get_event_test` RPC. */
export interface EventTestPublicView {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string;
  end_date: string;
  test_id: number;
  test_type: EventTestType;
  title: string;
  instructions?: string | null;
  is_open: boolean;
  show_score: boolean;
  questions: EventTestPublicQuestion[];
}

/** Shape returned by the `submit_event_test` RPC. */
export interface EventTestSubmitResult {
  already_submitted: boolean;
  score: number;
  max_score: number;
  submitted_at: string;
}

export interface EventTestSubmission {
  submission_id: number;
  test_id: number;
  event_id: number;
  participant_id: number;
  /** Snapshot taken at submit time, so the report survives participant edits. */
  participant_name: string;
  submitted_at: string;
  score: number;
  max_score: number;
  /** question_id → chosen choice key. */
  answers: Record<string, string>;
}

export type AnnouncementType = 'info' | 'warning' | 'success';

export interface FeatureAnnouncement {
  id: number;
  title: string;
  description: string;
  type: AnnouncementType;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementView {
  id: number;
  announcement_id: number;
  user_id: number;
  viewed_at: string;
}

export type AuditAction = 'Create' | 'Update' | 'Delete' | 'PermanentDelete' | 'Restore';

export type AuditEntityType = 'Event' | 'EventParticipant' | 'Participant' | 'User';

/** One field that changed, as stored in `audit_logs.changes`. */
export interface AuditFieldChange {
  from: unknown;
  to: unknown;
}

export interface AuditLog {
  audit_id: number;
  /** NULL once the acting user is deleted — actor_name/actor_role keep the trail readable. */
  actor_user_id?: number | null;
  actor_name?: string | null;
  actor_role?: string | null;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id?: number | null;
  entity_label?: string | null;
  event_id?: number | null;
  event_name?: string | null;
  changes?: Record<string, AuditFieldChange> | null;
  snapshot?: Record<string, unknown> | null;
  reason?: string | null;
  user_agent?: string | null;
  created_at: string;
}

// ─── Item Borrowing / Lending ────────────────────────────────────────────────
// Track borrowing of items (tablets, equipment) during events.
// Participants scan QR codes to borrow and return items.

export type BorrowableItemStatus = 'Available' | 'Damaged' | 'Archived';

/** Master inventory of borrowable items */
export interface BorrowableItem {
  item_id: number;
  item_code: string;  // QR code content
  item_name: string;
  item_description?: string | null;
  item_category?: string | null;
  status: BorrowableItemStatus;
  created_at?: string;
}

/** Transaction log of borrow/return events */
export interface BorrowedItem {
  borrow_id: number;
  event_id: number;
  participant_id: number;
  item_id: number;
  borrowed_at: string;
  returned_at?: string | null;
  returned_by_participant_id?: number | null;
  scanner_device?: string | null;
  notes?: string | null;
  created_at?: string;
}

/** Active (unreturned) borrow for display */
export interface ActiveBorrow {
  borrow_id: number;
  item_id: number;
  item_name: string;
  item_code: string;
  borrowed_at: string;
}

/** Borrow history for reports */
export interface BorrowHistory {
  borrow_id: number;
  participant_id: number;
  participant_name: string;
  item_id: number;
  item_name: string;
  borrowed_at: string;
  returned_at?: string | null;
  duration_minutes: number;
  status: 'Unreturned' | 'Returned';
}
