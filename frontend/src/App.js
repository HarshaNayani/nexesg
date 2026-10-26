import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, ROLES, useAuth } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { Spinner } from './components/ui';
import Layout from './components/Layout';
import Login, { GOOGLE_CLIENT_ID } from './pages/Login';
import Pending from './pages/Pending';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Users from './pages/Users';

// The server enforces every permission; this only hides pages a role cannot use.
function RequireAccess({ allowed, children }) {
  return allowed ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user, loading, canUpload, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!user) return <Login />;
  if (user.role === ROLES.PENDING) return <Pending />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route
          path="upload"
          element={
            <RequireAccess allowed={canUpload}>
              <Upload />
            </RequireAccess>
          }
        />
        <Route
          path="users"
          element={
            <RequireAccess allowed={isAdmin}>
              <Users />
            </RequireAccess>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  // HashRouter keeps deep links working on static hosts without rewrite rules.
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || 'not-configured'}>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </GoogleOAuthProvider>
  );
}
