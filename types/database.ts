
export type UserRole = 'Admin' | 'Scanner' | 'EventManager';

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
  email: string;
  password_hash: string;
  username: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  created_at?: string;
  position: string;
  office_id?: number | null;
}

export interface Event {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string; // ISO string (Date)
  end_date: string;   // ISO string (Date)
  status: 'Scheduled' | 'Ongoing' | 'Completed' | 'Cancelled';
  created_at?: string;
  organize_by?: number | null;
  has_accommodation?: boolean | null;
  registraion_open: boolean;
}

export interface Participant {
  participant_id: number;
  participant_code: string;
  full_name: string;
  gender?: string | null;
  position?: string | null;
  office?: string | null;
  email?: string | null;
  created_at?: string;
  age_group?: string | null;
  pwd?: string | null;
  indigenous_people?: string | null;
  mobile_no?: string | null;
  agency?: string | null;
  location_id?: number | null;
}

export interface EventParticipant {
  id: number;
  event_id: number;
  participant_id: number;
  registration_status: 'Registered' | 'Cancelled';
  registered_at?: string;
  accommodation_pax?: number | null;
  role: 'Delegate' | 'Speaker' | 'Secretariat' | 'Guest' | 'VIP';
  needs_accommodation?: boolean | null;
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
