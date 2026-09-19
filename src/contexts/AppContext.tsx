// ============================================================================
// AarogyaLink - Application Context Provider with Auth
// ============================================================================

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useConvexAuth } from 'convex/react';
import type { Role } from '@/types';
import type { Language } from '@/lib/i18n';
// Persisted application session (kept separate from temporary React state, so a
// browser refresh restores the signed-in user instead of dropping them back to
// role selection). localStorage is intentional: offline-first rural use.
import { readStoredSession, writeStoredSession } from '@/lib/session';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  facilityId?: string;
  facilityName?: string;
  departmentName?: string;
  phone?: string;
  patientId?: string;
  healthCardId?: string;
}

// District Admin auto-login account (no credentials needed for prototype)
const DEMO_ACCOUNTS: Record<string, AuthUser> = {
  gov_admin: { id: 'uga1', name: 'District Collector', email: 'district@demo.com', role: 'gov_admin' },
};

interface AppState {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  /** True while the persisted session / Convex auth state is still resolving. */
  isAuthLoading: boolean;
  login: (email: string) => boolean;
  loginPatient: (email: string, patientId: string, healthCardId: string, name: string) => void;
  loginStaff: (staffUser: { id: string; name: string; email: string; role: Role; facilityId?: string; facilityName?: string; departmentName?: string; departmentId?: string }) => void;
  logout: () => void;
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Restore the session synchronously so a refresh keeps the user signed in.
  const [restored] = useState(() => readStoredSession<AuthUser>());
  const [currentRole, setCurrentRole] = useState<Role>(() => (restored?.role as Role) ?? 'patient');
  const [language, setLanguage] = useState<Language>('en');
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  // Auto-detect online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => restored?.user ?? null);

  // Convex Auth is the transport-level session used by the backend functions.
  // It is deliberately NOT the only proof of authentication: the demo login
  // creates the app session, which is restored from storage on refresh.
  const { isLoading: convexAuthLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();

  // Safety valve: never keep the app stuck on a loading screen if the auth
  // handshake cannot complete (offline demo, unreachable deployment).
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAuthTimedOut(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const isAuthenticated = currentUser !== null;
  // Only block rendering while auth is resolving AND we have no restored
  // session — a restored session should render immediately.
  const isAuthLoading = !authTimedOut && convexAuthLoading && !isAuthenticated && !convexAuthenticated;

  const persist = useCallback((user: AuthUser | null) => {
    writeStoredSession<AuthUser>(user ? { user, role: user.role } : null);
  }, []);

  const login = useCallback((email: string) => {
    const account = DEMO_ACCOUNTS[currentRole];
    const user: AuthUser = account ?? {
      id: `u-${currentRole}`,
      name: currentRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      email,
      role: currentRole,
    };
    setCurrentUser(user);
    setCurrentRole(user.role);
    persist(user);
    return true;
  }, [currentRole, persist]);

  const loginPatient = useCallback((email: string, patientId: string, healthCardId: string, name: string) => {
    const user: AuthUser = {
      id: `u-${patientId}`,
      name,
      email,
      role: 'patient',
      patientId,
      healthCardId,
    };
    setCurrentUser(user);
    setCurrentRole('patient');
    persist(user);
  }, [persist]);

  const loginStaff = useCallback((staffUser: { id: string; name: string; email: string; role: Role; facilityId?: string; facilityName?: string; departmentName?: string; departmentId?: string }) => {
    const user: AuthUser = {
      id: staffUser.id,
      name: staffUser.name,
      email: staffUser.email,
      role: staffUser.role,
      facilityId: staffUser.facilityId,
      facilityName: staffUser.facilityName,
      departmentName: staffUser.departmentName,
    };
    setCurrentUser(user);
    setCurrentRole(user.role);
    persist(user);
  }, [persist]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    persist(null);
    try { sessionStorage.clear(); } catch { /* ok */ }
  }, [persist]);

  const handleSetRole = useCallback((role: Role) => {
    setCurrentRole(role);
  }, []);

  const value: AppState = {
    currentUser, isAuthenticated, isAuthLoading, login, loginPatient, loginStaff, logout,
    currentRole, setCurrentRole: handleSetRole,
    language, setLanguage,
    isOffline, setIsOffline,
    sidebarOpen, setSidebarOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
