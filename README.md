# Event Management Portal

A full-stack event and attendance platform for government or institutional workflows. The system supports event administration, participant registration, QR-based attendance, pre-test/post-test assessments, analytics, reporting, certificate generation, and office-based signatory configuration.

## Overview

The portal is designed to help teams manage the full event lifecycle:

- Create and maintain events
- Accept public registrations
- Track attendance with QR scanning
- Run pre-tests and post-tests and review the results
- Generate official reports and certificates
- Email certificates and QR passes to participants
- Review analytics and a record-level audit trail
- Manage users, offices, announcements, and system settings

## Main Menu

- `Overview`: summary cards, today's events, principal arrivals, upcoming events, and recent activity
- `Analytics`: per-event attendance charts and participant demographics
- `Events`: event creation, editing, registration controls, test builder, event access, and event-level management
- `Attendance`: attendance records and participant-related event monitoring
- `Name Lookup`: search participant attendance and event history
- `Reports`: attendance sheets, scan logs, certificates, giveaway logs, and test results
  - `Attendance Sheet`
  - `Scan Logs`
  - `Certificate of Appearance`
  - `Certificate of Participation`
  - `Giveaway Logs`
  - `Pre-test / Post-test`
- `Scan Mode`: QR attendance scanning with offline queue support
- `Users`: system account administration
  - `System`: portal user accounts
  - `Participant`: participant record administration (Admin)
- `System > Logs`: record-level audit trail (Admin)
- `System > About`: in-app system guide and overview
- `System > Settings`
  - `Signatories`: certificate signatory, signature image, and template configuration per office
  - `Partner Agency Signatories`: signatories for partner-agency certificates
  - `Announcements`: author and publish in-app feature announcements (Admin)
  - `Appearance`: UI theme templates (available to every user)

## Key Features

### Event Management

- Create, update, and manage events with venue, schedules, registration status, and accommodation settings
- Support single-day and multi-day events
- Per-day meal inclusion (Breakfast, AM Snacks, Lunch, PM Snacks, Dinner)
- Optional auto-attendance on registration, so registering also records the participant as present
- Optional principal/representative delegate mode per event
- Shareable public registration link and QR code per event
- Soft delete with a restorable deleted-events view
- Per-event user access assignments (`Manager`, `Scanner`, `ManagerScanner`) alongside office-level scoping
- Excel export of event and participant data
- Monitor current activity through the `Overview` dashboard page

### Registration and Participant Data

- Public event registration page for participants
- QR code generation per participant
- Capture office, position, contact details, demographics, and accommodation needs
- Delegate selection (`Principal`, `Representative`, or plain attendee) on events that enable it
- Match and reuse existing participant records when appropriate
- Staff-side participant creation with an opt-in "email the QR pass" step, plus re-send from the participant list
- Printable participant badges
- Participant search, filtering, and deletion with confirmation

### Attendance Tracking

- Mobile-friendly QR scanning interface
- AM and PM attendance session support
- Duplicate scan prevention
- Offline queue with sync when connection returns
- Manual fallback workflows when scanning is not available
- Giveaway claim scanning with its own claim log

### Principal Arrival Alerts

- Announces a `Principal` delegate's arrival the moment they are scanned
- Four stacked signals so at least one lands: in-app toast, chime, OS notification while the tab is hidden, and a flashing document title
- Broadcast over Supabase Realtime on a channel keyed by the organizing office, so every open tab in that office hears it
- Arrivals are persisted to `principal_arrival_logs` and surfaced on the dashboard

### Pre-test and Post-test

- Build multiple-choice pre-tests and post-tests per event, with 2–6 choices per question
- Public test links (`/test/:eventId/pre`, `/test/:eventId/post`) participants can take without an account
- Automatic scoring and stored submissions
- `Reports > Pre-test / Post-test` for per-event results

### Analytics

- Searchable event picker limited to events that already have attendance logs
- Daily attendance, check-in time distribution, age groups, gender split, participants by role, and top offices by attendee count
- Charts follow the active UI theme

### Reports and Certificates

- Attendance sheet printing
- Scan log printing
- Giveaway claim log printing
- Certificate of Appearance generation and printing
- Certificate of Participation generation, with a guided in-app walkthrough for first-time users
- Certificate preview workflows with configurable template variants
- Office-based signatory name, position, and e-signature configuration
- Automatic background removal on scanned e-signatures so they sit cleanly on themed certificates
- Certificates rendered client-side and exported as PDF without a PDF dependency

### Email Delivery

- Email a Certificate of Appearance or Certificate of Participation straight to the participant, individually or in bulk with a progress modal
- Email the QR pass and badge to a participant
- Sends are recorded on `event_participants` (`ca_email_sent_at`, `cop_email_sent_at`) so re-sends are visible
- Delivered through Supabase Edge Functions (`send-certificate`, `send-qr`); `server.js` provides the same endpoints locally over Express + Nodemailer

### Administration

- Role-based access control for `Admin`, `OfficeManager`, `EventManager`, and `Scanner`
- User account management and login activity tracking
- Participant record administration
- Office reference management
- Certificate signatory and template settings per office, including partner agencies
- In-app feature announcements: authored in `Settings`, shown once per user and tracked in `announcement_views`
- Record-level audit trail covering create, update, delete, permanent delete, and restore, filterable by record type and action (Admin)

### Appearance

- Six UI theme templates: EventFlow, Ocean, Forest, Sage, Paper, and Graphite
- Applied as a runtime `[data-theme]` swap and remembered per browser
- Collapsible sidebar and a permission-aware command palette (`Ctrl+K`) for page search

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
- Supabase Edge Functions (Deno) for certificate and QR email
- Express + Nodemailer (`server.js`) for local email development

### Key Libraries

- `html5-qrcode`
- `react-qr-code`
- `qrcode`
- `lucide-react`
- `date-fns`
- `bcryptjs`
- `html-to-image`
- `recharts`
- `sonner`
- `xlsx`
- `exceljs`

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

5. (Optional) Run the local email server

Only needed when testing email delivery without deploying the Edge Functions. Add the mail credentials to `.env`:

```env
EMAIL_USER=your_gmail_address
EMAIL_PASSWORD=your_gmail_app_password
PORT=3001
```

```bash
node server.js
```

For deployed environments, set the same `EMAIL_USER` and `EMAIL_PASSWORD` as Edge Function secrets and deploy `supabase/functions/send-certificate` and `supabase/functions/send-qr`. See `EMAIL_SETUP_GUIDE.md` for details.

## Database Setup

- `schema.sql` creates the base tables
- `supabase/migrations/` holds the incremental migrations (auto-attendance, audit logs, principal delegates, arrival logs, event tests, and later additions) — apply these after the base schema

## Storage Buckets

The current frontend expects these buckets to exist in Supabase Storage:

- `img`: user profile images
- `esig`: certificate signatory e-signatures

Make sure the correct storage policies are in place for uploads and reads.

## Core Tables

- `users`
- `user_login_activity`
- `events`
- `event_user_access`
- `participants`
- `event_participants`
- `attendance_logs`
- `giveaway_claim_logs`
- `principal_arrival_logs`
- `event_tests`
- `event_test_questions`
- `event_test_submissions`
- `feature_announcements`
- `announcement_views`
- `audit_logs`
- `offices`
- `tbl_signatory`
- `ref_locations`

## Offline Scanning Flow

1. Open `Scan Mode`
2. Select the event and session
3. Continue scanning even when offline
4. The app stores pending scans locally
5. Once connectivity returns, queued scans are synced to Supabase

## Deployment

- `vercel.json` rewrites every path to `/` so client-side routing works on a static host
- `npm run build` outputs to `dist/`

## Notes

- Certificate signatories are configured per office in `Settings`, with a separate list for partner agencies
- Certificate templates currently support serial-visible and serial-hidden variants
- Principal arrival alerts are page-level: there is no service worker, so they reach open tabs only
- The About page includes an in-app feature summary and user guide

## License

This project is available for internal adaptation and further development.
