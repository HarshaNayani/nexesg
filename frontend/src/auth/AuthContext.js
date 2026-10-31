import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { LOGOUT_EVENT, tokens } from '../api';

const AuthContext = createContext(null);

export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ANALYST: 'ANALYST',
  AUDITOR: 'AUDITOR',
  DEMO: 'DEMO',
  PENDING: 'PENDING',
};

export const ROLE_LABELS = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  ANALYST: 'Analyst',
  AUDITOR: 'Auditor',
  DEMO: 'Demo',
  PENDING: 'Pending',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True until we know whether a saved session is still valid.
  const [loading, setLoading] = useState(Boolean(tokens.access() || tokens.refresh()));

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me/');
    setUser(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    if (!tokens.access() && !tokens.refresh()) return;
    refreshUser()
      .catch(() => tokens.clear())
      .finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const res = await api.post('/auth/google/', { id_token: credential });
    tokens.set({ access: res.data.access, refresh: res.data.refresh });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user,
      loading,
      loginWithGoogle,
      logout,
      refreshUser,
      isAdmin: role === ROLES.ADMIN,
      canUpload: role === ROLES.ADMIN || role === ROLES.ANALYST || role === ROLES.DEMO,
      canReview: role === ROLES.ADMIN || role === ROLES.MANAGER || role === ROLES.DEMO,
    };
  }, [user, loading, loginWithGoogle, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
