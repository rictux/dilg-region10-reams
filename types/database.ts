export type UserRole = 'Admin' | 'Scanner' | 'EventManager';

export interface User {
  user_id: number;
  full_name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  username: string;
  password_hash: string;
  created_at?: string;
  position?: string;
}

export interface Event {
  event_id: number;
  event_name: string;
  venue: string;
  start_date: string; // ISO string (Date)
  end_date: string;   // ISO string (Date)
  status: 'Scheduled' | 'Ongoing' | 'Completed' | 'Cancelled';
  created_at?: string;
}

export interface Participant {
  participant_id: number;
  participant_code: string;
  full_name: string;
  gender: string;
  position: string;
  office: string;
  email: string;
  created_at?: string;
}

export interface ParticipantQR {
  qr_id: number;
  participant_id: number;
  qr_token: string;
  generated_at?: string;
}

export interface EventParticipant {
  id: number;
  event_id: number;
  participant_id: number;
  registration_status: 'Registered' | 'Cancelled';
  registered_at?: string;
}

export interface AttendanceLog {
  attendance_id: number;
  event_id: number;
  participant_id: number;
  user_id: number | null;
  scan_status: 'Valid' | 'Duplicate' | 'Invalid' | 'Late';
  scan_time: string;
  attendance_date: string; // YYYY-MM-DD
  action_session: 'AM' | 'PM';
  remarks?: string;
  scanner_device?: string;
}

// Helper types for joins
export interface ParticipantWithQR extends Participant {
  qr_token?: string;
}

export interface AttendanceLogWithDetails extends AttendanceLog {
  participants?: {
    full_name: string;
    participant_code: string;
    office: string;
  };
  events?: {
    event_name: string;
  };
}
