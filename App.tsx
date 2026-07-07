
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './features/auth/Login';
import Signup from './features/auth/Signup';
import Layout from './components/Layout';
import AnnouncementModal from './components/AnnouncementModal';
import Dashboard from './features/dashboard/Dashboard';
import EventsList from './features/events/EventsList';
import EventRegistration from './features/events/EventRegistration';
import ParticipantsList from './features/participants/ParticipantsList';
import BadgePrint from './features/participants/BadgePrint';
import Scanner from './features/scanner/Scanner';
import Reports from './features/reports/Reports';
import AttendanceSheetPrint from './features/participants/AttendanceSheetPrint';
import ScanLogsPrint from './features/reports/ScanLogsPrint';
import GiveawayClaimLogsPrint from './features/reports/GiveawayClaimLogsPrint';
import CertificateOfAppearancePrint from './features/reports/CertificateOfAppearancePrint';
import CertificateOfParticipation from './features/reports/CertificateOfParticipation';
import UserManagement from './features/users/UserManagement';
import Settings from './features/settings/Settings';
import NameLookup from './features/lookup/NameLookup';
import About from './features/about/About';
import { Permission } from './config/permissions';

const ProtectedRoute = ({ children, requiredPermission }: React.PropsWithChildren<{ requiredPermission?: Permission }>) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/" />;

  if (requiredPermission && !hasPermission(requiredPermission)) {
    if (hasPermission('SCAN_QR') && !hasPermission('VIEW_DASHBOARD')) {
        return <Navigate to="/scan" />;
    }
    return <Navigate to="/dashboard" />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AnnouncementModal />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
          {/* Public Routes */}
          <Route path="/register/:eventId" element={<EventRegistration />} />
          <Route path="/lookup" element={<NameLookup />} />
          
          {/* Internal Name Lookup - Wrapped in Layout */}
          <Route path="/admin/lookup" element={
            <ProtectedRoute>
              <Layout><NameLookup isInternal={true} /></Layout>
            </ProtectedRoute>
          } />

          {/* Dashboard - Requires VIEW_DASHBOARD */}
          <Route path="/dashboard" element={
            <ProtectedRoute requiredPermission="VIEW_DASHBOARD">
              <Layout><Dashboard /></Layout>
            </ProtectedRoute>
          } />
          
          {/* Events - Requires MANAGE_EVENTS */}
          <Route path="/events" element={
            <ProtectedRoute requiredPermission="MANAGE_EVENTS">
              <Layout><EventsList /></Layout>
            </ProtectedRoute>
          } />
          
          {/* Attendance - Requires VIEW_PARTICIPANTS */}
          <Route path="/attendance" element={
            <ProtectedRoute requiredPermission="VIEW_PARTICIPANTS">
              <Layout><ParticipantsList /></Layout>
            </ProtectedRoute>
          } />

          {/* Reports - Requires VIEW_REPORTS */}
          <Route path="/reports" element={
            <ProtectedRoute requiredPermission="VIEW_REPORTS">
              <Layout><Reports /></Layout>
            </ProtectedRoute>
          } />
          
          {/* Users - Requires MANAGE_USERS */}
          <Route path="/users" element={
            <ProtectedRoute requiredPermission="MANAGE_USERS">
              <Layout><UserManagement /></Layout>
            </ProtectedRoute>
          } />

          {/* Badge View - (Printable) - Requires VIEW_PARTICIPANTS */}
          <Route path="/badges/:id" element={
            <ProtectedRoute requiredPermission="VIEW_PARTICIPANTS">
              <BadgePrint />
            </ProtectedRoute>
          } />

          {/* Attendance Sheet View - (Printable) - Requires VIEW_REPORTS */}
          <Route path="/print-attendance/:eventId" element={
            <ProtectedRoute requiredPermission="VIEW_REPORTS">
              <AttendanceSheetPrint />
            </ProtectedRoute>
          } />

          {/* Scan Logs Print View - (Printable) - Requires VIEW_REPORTS */}
          <Route path="/print-scan-logs/:eventId?" element={
            <ProtectedRoute requiredPermission="VIEW_REPORTS">
              <ScanLogsPrint />
            </ProtectedRoute>
          } />

          {/* Giveaway Claim Logs Print View - (Printable) - Requires VIEW_REPORTS */}
          <Route path="/print-giveaway-claims/:eventId" element={
            <ProtectedRoute requiredPermission="VIEW_REPORTS">
              <GiveawayClaimLogsPrint />
            </ProtectedRoute>
          } />

          {/* Certificate of Appearance Print View - (Printable) - Requires VIEW_REPORTS */}
          <Route path="/print-certificate/:eventId" element={
            <ProtectedRoute requiredPermission="VIEW_REPORTS">
              <CertificateOfAppearancePrint />
            </ProtectedRoute>
          } />

          {/* Certificate of Participation - Requires VIEW_REPORTS */}
          <Route path="/print-cop/:eventId" element={
            <ProtectedRoute requiredPermission="VIEW_REPORTS">
              <CertificateOfParticipation />
            </ProtectedRoute>
          } />

          {/* Scanner Route - Requires SCAN_QR */}
          <Route path="/scan" element={
            <ProtectedRoute requiredPermission="SCAN_QR">
              <Layout><Scanner /></Layout>
            </ProtectedRoute>
          } />

          {/* Settings Route — open to all signed-in users; restricted views are gated inside Settings */}
          <Route path="/settings" element={
            <ProtectedRoute>
              <Layout><Settings /></Layout>
            </ProtectedRoute>
          } />

          {/* About Route */}
          <Route path="/about" element={
            <ProtectedRoute>
              <Layout><About /></Layout>
            </ProtectedRoute>
          } />

          {/* Catch all - Redirect to Dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
