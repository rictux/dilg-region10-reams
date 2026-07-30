import { UserRole } from '../types/database';

export type Permission = 
  | 'VIEW_DASHBOARD'
  | 'MANAGE_EVENTS'       // Create, Edit events
  | 'DELETE_EVENTS'       // Delete events
  | 'VIEW_PARTICIPANTS'   // View lists
  | 'MANAGE_PARTICIPANTS' // Add, Edit manual logs
  | 'SCAN_QR'             // Access Scanner
  | 'VIEW_REPORTS'        // Access Reports
  | 'MANAGE_USERS'        // Manage users
  | 'MANAGE_CERTIFICATE_SETTINGS' // Manage certificate signatory/template settings
  | 'VIEW_AUDIT_LOGS';    // Read the record-level audit trail

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD' as Permission,
  MANAGE_EVENTS: 'MANAGE_EVENTS' as Permission,
  DELETE_EVENTS: 'DELETE_EVENTS' as Permission,
  VIEW_PARTICIPANTS: 'VIEW_PARTICIPANTS' as Permission,
  MANAGE_PARTICIPANTS: 'MANAGE_PARTICIPANTS' as Permission,
  SCAN_QR: 'SCAN_QR' as Permission,
  VIEW_REPORTS: 'VIEW_REPORTS' as Permission,
  MANAGE_USERS: 'MANAGE_USERS' as Permission,
  MANAGE_CERTIFICATE_SETTINGS: 'MANAGE_CERTIFICATE_SETTINGS' as Permission,
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS' as Permission,
};

// Default configuration. In a full backend implementation, this could be stored in the DB.
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  'Admin': [
    'VIEW_DASHBOARD',
    'MANAGE_EVENTS',
    'DELETE_EVENTS',
    'VIEW_PARTICIPANTS',
    'MANAGE_PARTICIPANTS',
    'SCAN_QR',
    'VIEW_REPORTS',
    'MANAGE_USERS',
    'MANAGE_CERTIFICATE_SETTINGS',
    'VIEW_AUDIT_LOGS' // Admin only — the audit trail covers every office
  ],
  'EventManager': [
    'VIEW_DASHBOARD',
    'MANAGE_EVENTS',
    // Note: No DELETE_EVENTS by default for EventManager
    'VIEW_PARTICIPANTS',
    'MANAGE_PARTICIPANTS',
    'VIEW_REPORTS',
    'SCAN_QR' // Managers can often scan too
  ],
  'Scanner': [
    'SCAN_QR'
    // Scanner has no dashboard access by default
  ],
  'OfficeManager': [
    'VIEW_DASHBOARD',
    'MANAGE_EVENTS',
    'DELETE_EVENTS',
    'VIEW_PARTICIPANTS',
    'MANAGE_PARTICIPANTS',
    'VIEW_REPORTS',
    'SCAN_QR',
    'MANAGE_USERS',
    'MANAGE_CERTIFICATE_SETTINGS'
  ]
};
