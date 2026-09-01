// ============================================================================
// CareLoop Health - Main Application Layout
// ============================================================================

import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { Button } from '@/components/ui/button';
import {
  Heart, Menu, X, ChevronDown, Globe, Wifi, WifiOff,
  Home, Stethoscope, Building2, Users, Activity, FileText,
  Calendar, ClipboardList, MapPin, CreditCard, Bell, Shield,
  Pill, TestTube, Phone, BarChart3, Syringe, UserPlus,
  ScanLine, Package, TrendingUp, Building, Megaphone,
  AlertTriangle, Clock, MessageSquare, BookOpen
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: typeof Heart;
}

const PATIENT_NAV: NavItem[] = [
  { label: 'home', path: '/app', icon: Home },
  { label: 'aiAssistant', path: '/app/ai-triage', icon: Stethoscope },
  { label: 'findFacilities', path: '/app/facilities', icon: MapPin },
  { label: 'myAppointments', path: '/app/appointments', icon: Calendar },
  { label: 'myReferrals', path: '/app/referrals', icon: FileText },
  { label: 'myHealthCard', path: '/app/health-card', icon: CreditCard },
  { label: 'myTimeline', path: '/app/timeline', icon: Clock },
  { label: 'medicines', path: '/app/medicines', icon: Pill },
  { label: 'diagnostics', path: '/app/diagnostics', icon: TestTube },
  { label: 'followUpReminders', path: '/app/followups', icon: Bell },
  { label: 'consentCenter', path: '/app/privacy', icon: Shield },
];

const HW_NAV: NavItem[] = [
  { label: 'dashboard', path: '/hw', icon: Home },
  { label: 'registerPatient', path: '/hw/register', icon: UserPlus },
  { label: 'aiAssistant', path: '/hw/ai-triage', icon: Stethoscope },
  { label: 'createReferral', path: '/hw/create-referral', icon: FileText },
  { label: 'myReferrals', path: '/hw/referrals', icon: ClipboardList },
  { label: 'followUpReminders', path: '/hw/followups', icon: Bell },
  { label: 'offlineCapture', path: '/hw/sync', icon: Wifi },
];

const DOCTOR_NAV: NavItem[] = [
  { label: 'dashboard', path: '/doc', icon: Home },
  { label: 'appointmentQueue', path: '/doc/queue', icon: Calendar },
  { label: 'myReferrals', path: '/doc/referrals', icon: FileText },
  { label: 'followUpReminders', path: '/doc/followups', icon: Bell },
];

const HOSP_ADMIN_NAV: NavItem[] = [
  { label: 'dashboard', path: '/admin', icon: Home },
  { label: 'referralInbox', path: '/admin/referrals', icon: Inbox },
  { label: 'medicineStock', path: '/admin/medicines', icon: Package },
  { label: 'completionAnalytics', path: '/admin/analytics', icon: BarChart3 },
];

const GOV_NAV: NavItem[] = [
  { label: 'dashboard', path: '/gov', icon: Home },
  { label: 'referralFunnel', path: '/gov/funnel', icon: TrendingUp },
  { label: 'villageMap', path: '/gov/villages', icon: MapPin },
  { label: 'insights', path: '/gov/insights', icon: MessageSquare },
  { label: 'facilityCapacity', path: '/gov/facilities', icon: Building2 },
  { label: 'medicineStock', path: '/gov/medicines', icon: Pill },
  { label: 'diagnosticAvail', path: '/gov/diagnostics', icon: TestTube },
];

import { Inbox } from 'lucide-react';

const ROLE_NAV_MAP = {
  patient: PATIENT_NAV,
  health_worker: HW_NAV,
  doctor: DOCTOR_NAV,
  hospital_admin: HOSP_ADMIN_NAV,
  gov_admin: GOV_NAV,
};

const ROLE_LABELS = {
  patient: 'Patient',
  health_worker: 'Health Worker',
  doctor: 'Doctor',
  hospital_admin: 'Hospital Admin',
  gov_admin: 'Gov Admin',
};

const ROLE_PATHS: Record<string, string> = {
  patient: '/app',
  health_worker: '/hw',
  doctor: '/doc',
  hospital_admin: '/admin',
  gov_admin: '/gov',
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentRole, setCurrentRole, language, setLanguage, isOffline, sidebarOpen, setSidebarOpen } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const navItems = ROLE_NAV_MAP[currentRole] || PATIENT_NAV;

  const handleRoleChange = (role: typeof currentRole) => {
    setCurrentRole(role);
    navigate(ROLE_PATHS[role] || '/app');
    setRoleOpen(false);
  };

  return (
    <div className={cn('min-h-screen bg-background', isOffline && 'pt-10')}>
      <OfflineIndicator isOffline={isOffline} />

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-border flex items-center px-4 gap-3">
        {isOffline && <div className="absolute top-0" />}

        {/* Mobile menu toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {/* Logo */}
        <Link to={ROLE_PATHS[currentRole] || '/app'} className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Heart className="h-[1.125rem] w-[1.125rem] text-primary-foreground" fill="currentColor" />
          </div>
          <div className="hidden sm:block">
            <span className="text-base font-bold text-foreground tracking-tight">CareLoop</span>
            <span className="text-base font-bold text-primary tracking-tight ml-0.5">Health</span>
          </div>
        </Link>

        <div className="flex-1" />

        {/* Offline status */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5 text-emerald-500" />}
          <span>{isOffline ? t('offline', language) : t('online', language)}</span>
        </div>

        {/* Role selector */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => { setRoleOpen(!roleOpen); setLangOpen(false); }}
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{ROLE_LABELS[currentRole]}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
          {roleOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setRoleOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white border border-border rounded-xl shadow-lg py-1.5">
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <button
                    key={role}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors',
                      currentRole === role && 'bg-primary/5 text-primary font-medium'
                    )}
                    onClick={() => handleRoleChange(role as typeof currentRole)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Language selector */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => { setLangOpen(!langOpen); setRoleOpen(false); }}
          >
            <Globe className="h-4 w-4" />
          </Button>
          {langOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-36 bg-white border border-border rounded-xl shadow-lg py-1.5">
                {[
                  { code: 'en' as const, label: 'English' },
                  { code: 'ta' as const, label: 'தமிழ்' },
                  { code: 'hi' as const, label: 'हिन्दी' },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors',
                      language === lang.code && 'bg-primary/5 text-primary font-medium'
                    )}
                    onClick={() => { setLanguage(lang.code); setLangOpen(false); }}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Notification bell */}
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
        </Button>
      </header>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex fixed top-14 left-0 bottom-0 z-30 flex-col w-60 bg-white border-r border-border transition-all duration-200',
          !sidebarOpen && 'lg:w-0 lg:overflow-hidden'
        )}
      >
        <nav className="flex-1 overflow-y-auto py-3 px-3 scrollbar-thin">
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path ||
                (item.path !== '/app' && item.path !== '/hw' && item.path !== '/doc' && item.path !== '/admin' && item.path !== '/gov' && location.pathname.startsWith(item.path));

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary/8 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-[1.125rem] w-[1.125rem] flex-shrink-0" />
                  <span>{t(item.label as any, language)}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span>SIH2026 · SIH26133</span>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed top-14 left-0 bottom-0 z-50 w-64 bg-white border-r border-border lg:hidden overflow-y-auto">
            <nav className="p-3 space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path ||
                  (item.path !== '/app' && item.path !== '/hw' && item.path !== '/doc' && item.path !== '/admin' && item.path !== '/gov' && location.pathname.startsWith(item.path));

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary/8 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{t(item.label as any, language)}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      {/* Main content */}
      <main
        className={cn(
          'pt-14 min-h-screen transition-all duration-200',
          sidebarOpen ? 'lg:pl-60' : 'lg:pl-0'
        )}
      >
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
