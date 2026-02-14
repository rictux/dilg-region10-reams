
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './features/auth/Login';
import Layout from './components/Layout';
import Dashboard from './features/dashboard/Dashboard';
import EventsList from './features/events/EventsList';
import EventRegistration from './features/events/EventRegistration';
import ParticipantsList from './features/participants/ParticipantsList';
import BadgePrint from './features/participants/BadgePrint';
import Scanner from './features/scanner/Scanner';
import Reports from './features/reports/Reports';
import AttendanceSheetPrint from './features/participants/AttendanceSheetPrint';
import ScanLogsPrint from './features/reports/ScanLogsPrint';
import UserManagement from './features/users/UserManagement';
import NameLookup from './features/lookup/NameLookup';
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
        <Routes>
          <Route path="/" element={<Login />} />
          
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

          {/* Scanner Route - Requires SCAN_QR */}
          <Route path="/scan" element={
            <ProtectedRoute requiredPermission="SCAN_QR">
              <Layout><Scanner /></Layout>
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
