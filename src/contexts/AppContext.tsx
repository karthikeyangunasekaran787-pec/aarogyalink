// ============================================================================
// AarogyaLink - Application Context Provider with Auth
// ============================================================================

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Role } from '@/types';
import type { Language } from '@/lib/i18n';

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
  const [currentRole, setCurrentRole] = useState<Role>('patient');
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
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const isAuthenticated = currentUser !== null;

  const login = useCallback((email: string) => {
    const account = DEMO_ACCOUNTS[currentRole];
    if (account) {
      setCurrentUser(account);
      return true;
    }
    setCurrentUser({
      id: `u-${currentRole}`,
      name: currentRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      email,
      role: currentRole,
    });
    return true;
  }, [currentRole]);

  const loginPatient = useCallback((email: string, patientId: string, healthCardId: string, name: string) => {
    setCurrentUser({
      id: `u-${patientId}`,
      name,
      email,
      role: 'patient',
      patientId,
      healthCardId,
    });
  }, []);

  const loginStaff = useCallback((staffUser: { id: string; name: string; email: string; role: Role; facilityId?: string; facilityName?: string; departmentName?: string; departmentId?: string }) => {
    setCurrentUser({
      id: staffUser.id,
      name: staffUser.name,
      email: staffUser.email,
      role: staffUser.role,
      facilityId: staffUser.facilityId,
      facilityName: staffUser.facilityName,
      departmentName: staffUser.departmentName,
    });
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    try { sessionStorage.clear(); } catch { /* ok */ }
  }, []);

  const handleSetRole = useCallback((role: Role) => {
    setCurrentRole(role);
  }, []);

  const value: AppState = {
    currentUser, isAuthenticated, login, loginPatient, loginStaff, logout,
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
