// ============================================================================
// AarogyaLink — Main Application Layout
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useAuthActions } from '@convex-dev/auth/react';
import { useData } from '@/contexts/DataContext';
import { LANGUAGES, type TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/hooks/use-translation';
import { PATIENT_NAV, PATIENT_MORE_NAV } from '@/lib/patient-nav';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/button';
import {
  Heart, Menu, X, Globe, Wifi, WifiOff, LogOut,
  Home, FileText,
  Calendar, ClipboardList, MapPin, Bell,
  BarChart3, UserPlus, ScanLine,
  Package, TrendingUp, Inbox, Users, Building2
} from 'lucide-react';

interface NavItem {
  /** A translation key, NOT English text: navigation follows the language. */
  label: TranslationKey;
  path: string;
  icon: typeof Heart;
}

const HW_NAV: NavItem[] = [
  { label: 'dashboard', path: '/health-worker/dashboard', icon: Home },
  { label: 'registerPatient', path: '/health-worker/register', icon: UserPlus },
  { label: 'myReferrals', path: '/health-worker/referrals', icon: ClipboardList },
  { label: 'followUpReminders', path: '/health-worker/followups', icon: Bell },
];

/** Role labels for the signed-in user line in the header. */
const ROLE_LABEL_KEY: Record<string, TranslationKey> = {
  patient: 'rolePatient',
  health_worker: 'roleHealthWorker',
  doctor: 'roleDoctor',
  hospital_admin: 'roleHospitalAdmin',
  gov_admin: 'roleDistrictAdmin',
  overall_admin: 'roleOverallAdmin',
};

const DOCTOR_NAV: NavItem[] = [
  { label: 'dashboard', path: '/doctor/dashboard', icon: Home },
  { label: 'scanHealthCard', path: '/doctor/scan', icon: ScanLine },
  { label: 'appointmentQueue', path: '/doctor/appointments', icon: Calendar },
  { label: 'myReferrals', path: '/doctor/referrals', icon: FileText },
  { label: 'followUpReminders', path: '/doctor/followups', icon: Bell },
];

const HOSP_ADMIN_NAV: NavItem[] = [
  { label: 'dashboard', path: '/hospital-admin/dashboard', icon: Home },
  { label: 'referralInbox', path: '/hospital-admin/referrals', icon: Inbox },
  { label: 'medicineStock', path: '/hospital-admin/medicines', icon: Package },
  { label: 'completionAnalytics', path: '/hospital-admin/analytics', icon: BarChart3 },
  { label: 'staffManagement', path: '/hospital-admin/staff', icon: Users },
];

const GOV_NAV: NavItem[] = [
  { label: 'dashboard', path: '/district-admin/dashboard', icon: Home },
  { label: 'hospitalManagement', path: '/district-admin/hospitals', icon: Building2 },
  { label: 'referralFunnel', path: '/district-admin/analytics', icon: TrendingUp },
  { label: 'villageMap', path: '/district-admin/facilities', icon: MapPin },
];

const OVERALL_NAV: NavItem[] = [
  { label: 'overallAdministration', path: '/master-admin/dashboard', icon: Home },
  { label: 'districts', path: '/master-admin/districts', icon: MapPin },
  { label: 'districtAdmins', path: '/master-admin/admins', icon: Users },
];

const ROLE_NAV_MAP: Record<string, NavItem[]> = {
  patient: PATIENT_NAV,
  health_worker: HW_NAV,
  doctor: DOCTOR_NAV,
  hospital_admin: HOSP_ADMIN_NAV,
  gov_admin: GOV_NAV,
  overall_admin: OVERALL_NAV,
};

const ROLE_PATH_MAP: Record<string, string> = {
  patient: '/patient/dashboard',
  health_worker: '/health-worker/dashboard',
  doctor: '/doctor/dashboard',
  hospital_admin: '/hospital-admin/dashboard',
  gov_admin: '/district-admin/dashboard',
  overall_admin: '/master-admin/dashboard',
};

// Click-outside hook
function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent | TouchEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    }
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

function Dropdown({ open, onOpenChange, trigger, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => onOpenChange(false));

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => onOpenChange(!open)}>
        {trigger}
      </div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-lg py-1.5 min-w-[180px]">
          {children}
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentRole, setLanguage, isOffline, sidebarOpen, currentUser, logout } = useApp();
  // `t` is bound to the app's selected language, so every label below follows
  // the language selector without any component keeping its own copy.
  const { t, language } = useTranslation();
  const { signOut } = useAuthActions();
  const { getNotificationsForUser } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const navItems = ROLE_NAV_MAP[currentRole] || PATIENT_NAV;
  const moreItems = currentRole === 'patient' ? PATIENT_MORE_NAV : [];
  const userNotifications = currentUser ? getNotificationsForUser(currentUser.id) : [];
  const unreadCount = userNotifications.filter(n => !n.read).length;

  const handleLogout = useCallback(() => {
    logout();
    try { signOut(); } catch { /* ok — may not be signed in via Convex */ }
    navigate('/role-select', { replace: true });
  }, [logout, navigate, signOut]);

  return (
    <div className={cn('min-h-screen bg-background', isOffline && 'pt-10')}>
      <OfflineIndicator isOffline={isOffline} />

      {/* ── Top Bar ──────────────────────────────────────────────── */}
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

        {/* Brand: the AarogyaLink emblem (no tagline in the app header). */}
        <Link to={ROLE_PATH_MAP[currentRole] || '/patient/dashboard'} className="flex items-center gap-2.5">
          <BrandLogo size={32} />
          <span className="text-base font-bold tracking-tight text-foreground">
            Aarogya<span className="text-primary">Link</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Offline status */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5 text-emerald-500" />}
          <span>{isOffline ? t('offline') : t('online')}</span>
        </div>

        {/* Language selector — the ONLY control that changes the language. */}
        <Dropdown open={langOpen} onOpenChange={setLangOpen}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer gap-1.5 px-2 sm:w-auto"
              aria-label={t('selectLanguage')}
              aria-haspopup="menu"
              aria-expanded={langOpen}
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline text-xs font-medium">
                {LANGUAGES.find(l => l.code === language)?.nativeLabel}
              </span>
            </Button>
          }
        >
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('selectLanguage')}
          </p>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              role="menuitemradio"
              aria-checked={language === lang.code}
              aria-label={lang.englishLabel}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer',
                language === lang.code && 'bg-primary/5 text-primary font-medium'
              )}
              onClick={() => { setLanguage(lang.code); setLangOpen(false); }}
            >
              {lang.nativeLabel}
            </button>
          ))}
        </Dropdown>

        {/* Notification bell */}
        <Dropdown open={notifOpen} onOpenChange={setNotifOpen}
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8 relative cursor-pointer">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
              )}
            </Button>
          }
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-sm font-semibold text-foreground">{t('notifications')}</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {userNotifications.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t('noNotifications')}</div>
            ) : (
              userNotifications.slice(0, 5).map((n) => (
                <div key={n.id} className="px-3 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0">
                  <div className="flex items-start gap-2">
                    <span className={cn('h-2 w-2 rounded-full mt-1.5 flex-shrink-0',
                      n.type === 'alert' ? 'bg-red-500' : n.type === 'warning' ? 'bg-amber-500' : n.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                    )} />
                    <div>
                      <p className="text-xs font-medium text-foreground">{n.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Dropdown>

        {/* User + Logout */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs font-medium text-foreground leading-tight">{currentUser?.name || t('user')}</p>
            <p className="text-[10px] text-muted-foreground">
              {currentUser?.departmentName && currentUser?.facilityName
                ? `${currentUser.departmentName} • ${currentUser.facilityName}`
                : currentUser?.facilityName
                ? currentUser.facilityName
                : t(ROLE_LABEL_KEY[currentRole] ?? 'rolePatient')
              }
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-red-600"
            onClick={handleLogout}
            aria-label={t('logout')}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Desktop Sidebar ──────────────────────────────────────── */}
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
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

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
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{t(item.label)}</span>
                </Link>
              );
            })}

            {moreItems.length > 0 && (
              <div className="pt-3 mt-3 border-t border-border/70">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('more')}
                </p>
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                        isActive
                          ? 'bg-primary/8 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span>{t(item.label)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all w-full cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar ───────────────────────────────────────── */}
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
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

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
                    <span>{t(item.label)}</span>
                  </Link>
                );
              })}

              {moreItems.length > 0 && (
                <div className="pt-3 mt-3 border-t border-border/70">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('more')}
                  </p>
                  {moreItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      location.pathname === item.path || location.pathname.startsWith(item.path + '/');
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
                        <span>{t(item.label)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </nav>
            <div className="p-3 border-t border-border">
              <button
                onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all w-full cursor-pointer"
              >
                <LogOut className="h-5 w-5" />
                <span>{t('logout')}</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── Main Content ─────────────────────────────────────────── */}
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
