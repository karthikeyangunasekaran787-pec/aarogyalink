// ============================================================================
// CareLoop Health - Application Context Provider
// ============================================================================

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Role } from '@/types';
import type { Language } from '@/lib/i18n';

interface AppState {
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

  const handleSetRole = useCallback((role: Role) => {
    setCurrentRole(role);
  }, []);

  const value: AppState = {
    currentRole,
    setCurrentRole: handleSetRole,
    language,
    setLanguage,
    isOffline,
    setIsOffline,
    sidebarOpen,
    setSidebarOpen,
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
