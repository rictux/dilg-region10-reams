
# Event Management Portal

A comprehensive, full-stack web application designed for managing corporate or government events, streamlining participant registration, and tracking attendance via QR codes with offline support.

## 🚀 Key Features

### 📅 Event Management
*   **CRUD Operations:** Create, update, and manage events with details like venue, date ranges, and status (Scheduled, Ongoing, Completed).
*   **Registration Controls:** Toggle registration availability and accommodation options.
*   **Dashboard:** Real-time overview of active events, total participants, and visual calendar view.

### 👥 Participant & Registration
*   **Public Registration:** Public-facing page (`/register/:id`) for attendees to self-register.
*   **Digital ID:** Auto-generation of unique QR Codes for every participant.
*   **Badge Printing:** Generate and download printable event badges with QR codes.
*   **Role Management:** Assign roles (Delegate, Speaker, Secretariat, VIP) to participants.
*   **Demographics:** Capture extensive data including office/LGU origin, gender, age group, and special needs (PWD/Indigenous People).

### 📱 Attendance Tracking (QR Scanner)
*   **Mobile-First Scanner:** Built-in QR scanner optimized for mobile devices.
*   **Offline Mode:** Fully functional offline scanning queue. data syncs automatically when the connection is restored.
*   **Session Tracking:** Support for AM and PM attendance sessions.
*   **Duplicate Prevention:** Prevents double scanning for the same session.
*   **Manual Entry:** Fallback option to manually log attendance if QR scanning fails.

### 📊 Reports & Analytics
*   **Real-time Stats:** Live counts of registered vs. present participants.
*   **Printable Reports:** 
    *   **Attendance Sheets:** Formatted specifically for government compliance (DILG format).
    *   **Scan Logs:** Detailed audit trail of every scan timestamp and device.
*   **Name Lookup:** Public and internal search tools to verify attendance history.

### 🛡️ Administration
*   **Role-Based Access Control (RBAC):**
    *   **Admin:** Full system access, manage users, and offices.
    *   **Event Manager:** Manage events, participants, and reports.
    *   **Scanner:** Restricted access focused solely on the QR scanning interface.
*   **User Management:** Create and manage system accounts.
*   **Office Management:** Assign users to specific offices/agencies.

## 🛠️ Technology Stack

### Frontend
*   **Framework:** [React 19](https://react.dev/)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **Build Tool:** [Vite](https://vitejs.dev/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **Routing:** [React Router v7](https://reactrouter.com/)

### Backend & Database
*   **BaaS:** [Supabase](https://supabase.com/) (PostgreSQL)
*   **Real-time:** Supabase Realtime (for live dashboard and attendance updates)

### Key Libraries
*   **Scanning:** `html5-qrcode`
*   **QR Generation:** `react-qr-code`
*   **Icons:** `lucide-react`
*   **Date Handling:** `date-fns`
*   **Security:** `bcryptjs` (Client-side hashing)
*   **Export:** `html-to-image`

## ⚙️ Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd event-management-portal
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory (or use the existing configuration in `lib/supabase.ts` for testing):
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Run the development server**
    ```bash
    npm run dev
    ```

## 🗄️ Database Schema Overview

The application requires the following Supabase tables:

*   `users`: System administrators and scanners.
*   `events`: Event details.
*   `participants`: Global list of people.
*   `event_participants`: Junction table linking people to specific events with roles.
*   `attendance_logs`: Time-stamped logs of scans.
*   `offices`: Organization reference.
*   `ref_locations`: Geography reference (Provinces/Cities).

## 📱 Offline Scanning Workflow

1.  Navigate to the **Scan Mode** page.
2.  If the device loses internet connection, the UI switches to "Offline Mode".
3.  Scanned data is stored in the browser's `localStorage`.
4.  When the internet connection is restored, the app detects the queue and automatically pushes the data to Supabase.

## 📄 License

This project is open-source and available for modification.
