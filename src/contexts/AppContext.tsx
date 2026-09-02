// ============================================================================
// AarogyaLink - Application Context Provider with Auth
// Supports Convex Auth (real email OTP) + Demo login fallback for SIH prototype
// ============================================================================

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Role } from '@/types';
import type { Language } from '@/lib/i18n';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  facilityId?: string;
  phone?: string;
}

// Demo accounts for SIH prototype
const DEMO_ACCOUNTS: Record<Role, AuthUser> = {
  patient: { id: 'u1', name: 'Lakshmi Devi', email: 'lakshmi@demo.aarogyalink.in', role: 'patient', phone: '9876543210' },
  health_worker: { id: 'uhw1', name: 'Suganthi M', email: 'suganthi@demo.aarogyalink.in', role: 'health_worker', facilityId: 'f1', phone: '9850100001' },
  doctor: { id: 'ud1', name: 'Dr. Senthil Kumar', email: 'senthil@demo.aarogyalink.in', role: 'doctor', facilityId: 'f1', phone: '9840100001' },
  hospital_admin: { id: 'uha1', name: 'Admin Rajan', email: 'rajan@demo.aarogyalink.in', role: 'hospital_admin', facilityId: 'f3' },
  gov_admin: { id: 'uga1', name: 'District Collector', email: 'collector@demo.aarogyalink.in', role: 'gov_admin' },
};

interface AppState {
  // Auth
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => boolean;
  logout: () => void;

  // App state
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
  const [isOffline, setIsOffline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const isAuthenticated = currentUser !== null;

  const login = useCallback((email: string) => {
    // Demo login: any email logs in with the selected role
    setCurrentUser(DEMO_ACCOUNTS[currentRole]);
    return true;
  }, [currentRole]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    try { sessionStorage.clear(); } catch { /* ok */ }
  }, []);

  const handleSetRole = useCallback((role: Role) => {
    setCurrentRole(role);
  }, []);

  const value: AppState = {
    currentUser, isAuthenticated, login, logout,
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
