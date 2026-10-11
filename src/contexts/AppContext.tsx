// ============================================================================
// AarogyaLink - Application Context Provider with Auth
// ============================================================================

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import type { Role } from '@/types';
import type { Language } from '@/lib/i18n';
// Persisted application session (kept separate from temporary React state, so a
// browser refresh restores the signed-in user instead of dropping them back to
// role selection). localStorage is intentional: offline-first rural use.
import { readStoredSession, writeStoredSession } from '@/lib/session';
// The selected language lives in one app-wide store (see language-store.ts) so
// that every screen, nested route and shared component reads the same value and
// re-renders together. It is exposed here as `language` / `setLanguage` for the
// components that already consume it through useApp().
import { useLanguage } from '@/hooks/use-translation';
import { applyLanguage } from '@/lib/language-store';
import { rememberPendingLogin, writeBackendToken } from '@/lib/backend-session';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  facilityId?: string;
  facilityName?: string;
  districtId?: string;
  districtName?: string;
  departmentName?: string;
  phone?: string;
  patientId?: string;
  healthCardId?: string;
}

interface AppState {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  /** True while the persisted session / Convex auth state is still resolving. */
  isAuthLoading: boolean;
  loginPatient: (email: string, patientId: string, healthCardId: string, name: string) => void;
  loginStaff: (staffUser: { id: string; name: string; email: string; role: Role; facilityId?: string; facilityName?: string; districtId?: string; districtName?: string; departmentName?: string; departmentId?: string; phone?: string; patientId?: string; healthCardId?: string }) => void;
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
  const { signOut: signOutAuth } = useAuthActions();
  // Restore the session synchronously so a refresh keeps the user signed in.
  const [restored] = useState(() => readStoredSession<AuthUser>());
  const [currentRole, setCurrentRole] = useState<Role>(() => (restored?.role as Role) ?? 'patient');
  // The saved language is restored by the store itself before the first paint,
  // so this is already the chosen language on mount. The preference is stored
  // separately from the session and is never touched by login, logout,
  // navigation, a modal, or offline sync.
  const language = useLanguage();
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

  const loginStaff = useCallback((staffUser: { id: string; name: string; email: string; role: Role; facilityId?: string; facilityName?: string; districtId?: string; districtName?: string; departmentName?: string; departmentId?: string; phone?: string; patientId?: string; healthCardId?: string }) => {
    const user: AuthUser = {
      id: staffUser.id,
      name: staffUser.name,
      email: staffUser.email,
      role: staffUser.role,
      facilityId: staffUser.facilityId,
      facilityName: staffUser.facilityName,
      districtId: staffUser.districtId,
      districtName: staffUser.districtName,
      departmentName: staffUser.departmentName,
      phone: staffUser.phone,
      patientId: staffUser.patientId,
      healthCardId: staffUser.healthCardId,
    };
    setCurrentUser(user);
    setCurrentRole(user.role);
    persist(user);
  }, [persist]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    persist(null);
    // End the Convex Auth session as well, so logging out really destroys the
    // session (a master sign-in leaves a real email session behind otherwise).
    // The anonymous transport session is re-established automatically.
    void signOutAuth().catch(() => { /* offline or already signed out */ });
    // Drop the backend session token too: the next sign-in binds its own
    // server-verified role instead of resuming this one.
    writeBackendToken(null);
    rememberPendingLogin(null);
    try { sessionStorage.clear(); } catch { /* ok */ }
  }, [persist, signOutAuth]);

  const handleSetRole = useCallback((role: Role) => {
    setCurrentRole(role);
  }, []);

  // The ONLY way the language changes is this call from the language selector.
  // It notifies every subscriber at once (so all consumers re-render
  // immediately, with no refresh), persists the choice for the next visit, and
  // keeps <html lang> in step for Tamil/Devanagari fonts and line breaking.
  const setLanguage = useCallback((lang: Language) => {
    applyLanguage(lang);
  }, []);

  const value: AppState = {
    currentUser, isAuthenticated, isAuthLoading, loginPatient, loginStaff, logout,
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
