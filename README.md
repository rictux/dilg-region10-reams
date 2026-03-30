# Event Management Portal

A full-stack event and attendance platform for government or institutional workflows. The system supports event administration, participant registration, QR-based attendance, reporting, certificate generation, and office-based signatory configuration.

## Overview

The portal is designed to help teams manage the full event lifecycle:

- Create and maintain events
- Accept public registrations
- Track attendance with QR scanning
- Generate official reports and certificates
- Manage users, offices, and system settings

## Main Menu

- `Overview`: summary cards, event status snapshots, and quick system monitoring
- `Events`: event creation, editing, registration controls, and event-level management
- `Attendance`: attendance records and participant-related event monitoring
- `Name Lookup`: search participant attendance and event history
- `Reports`: attendance sheets, scan logs, and certificate workflows
- `Scan Mode`: QR attendance scanning with offline queue support
- `Users`: system account administration
- `System > About`: in-app system guide and overview
- `System > Settings`: certificate signatory, signature image, and template configuration per office

## Key Features

### Event Management

- Create, update, and manage events with venue, schedules, registration status, and accommodation settings
- Support single-day and multi-day events
- Manage event visibility and registration readiness from the admin interface
- Monitor current activity through the `Overview` dashboard page

### Registration and Participant Data

- Public event registration page for participants
- QR code generation per participant
- Capture office, position, contact details, demographics, and accommodation needs
- Match and reuse existing participant records when appropriate

### Attendance Tracking

- Mobile-friendly QR scanning interface
- AM and PM attendance session support
- Duplicate scan prevention
- Offline queue with sync when connection returns
- Manual fallback workflows when scanning is not available

### Reports and Certificates

- Attendance sheet printing
- Scan log printing
- Certificate of Appearance generation and printing
- Certificate preview workflows with configurable template variants
- Office-based signatory name, position, and e-signature configuration

### Administration

- Role-based access control for `Admin`, `EventManager`, and `Scanner`
- User account management
- Office reference management
- Certificate signatory and template settings per office

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- React Router v7

### Backend and Database

- Supabase
- PostgreSQL
- Supabase Storage
- Supabase Realtime

### Key Libraries

- `html5-qrcode`
- `react-qr-code`
- `lucide-react`
- `date-fns`
- `bcryptjs`
- `html-to-image`

## Installation

1. Clone the repository

```bash
git clone <repository-url>
cd event-management-portal
```

2. Install dependencies

```bash
npm install
```

3. Create environment variables

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the development server

```bash
npm run dev
```

## Storage Buckets

The current frontend expects these buckets to exist in Supabase Storage:

- `img`: user profile images
- `esig`: certificate signatory e-signatures

Make sure the correct storage policies are in place for uploads and reads.

## Core Tables

- `users`
- `events`
- `participants`
- `event_participants`
- `attendance_logs`
- `offices`
- `tbl_signatory`
- `ref_locations`

## Offline Scanning Flow

1. Open `Scan Mode`
2. Select the event and session
3. Continue scanning even when offline
4. The app stores pending scans locally
5. Once connectivity returns, queued scans are synced to Supabase

## Notes

- Certificate signatories are configured per office in `Settings`
- Certificate templates currently support serial-visible and serial-hidden variants
- The About page includes an in-app feature summary and user guide

## License

This project is available for internal adaptation and further development.
