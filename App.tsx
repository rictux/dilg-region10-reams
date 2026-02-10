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

const ProtectedRoute = ({ children, allowedRoles }: React.PropsWithChildren<{ allowedRoles?: string[] }>) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/" />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If scanner tries to access dashboard, send to scan
    if (user.role === 'Scanner') return <Navigate to="/scan" />;
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
          
          {/* Public Registration Route */}
          <Route path="/register/:eventId" element={<EventRegistration />} />
          
          {/* Admin Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['Admin', 'EventManager']}>
              <Layout><Dashboard /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/events" element={
            <ProtectedRoute allowedRoles={['Admin', 'EventManager']}>
              <Layout><EventsList /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/attendance" element={
            <ProtectedRoute allowedRoles={['Admin', 'EventManager']}>
              <Layout><ParticipantsList /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/reports" element={
            <ProtectedRoute allowedRoles={['Admin', 'EventManager']}>
              <Layout><Reports /></Layout>
            </ProtectedRoute>
          } />

          {/* Badge View - (Printable, no layout) */}
          <Route path="/badges/:id" element={
            <ProtectedRoute allowedRoles={['Admin', 'EventManager']}>
              <BadgePrint />
            </ProtectedRoute>
          } />

          {/* Attendance Sheet View - (Printable, no layout) */}
          <Route path="/print-attendance/:eventId" element={
            <ProtectedRoute allowedRoles={['Admin', 'EventManager']}>
              <AttendanceSheetPrint />
            </ProtectedRoute>
          } />

          {/* Scanner Route */}
          <Route path="/scan" element={
            <ProtectedRoute allowedRoles={['Admin', 'Scanner', 'EventManager']}>
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