import '@vly-ai/integrations';
import { Toaster } from '@/components/ui/sonner';
import { RequireAuth } from '@/components/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import React, { StrictMode, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { AppProvider } from '@/contexts/AppContext';
import { DataProvider } from '@/contexts/DataContext';
import './index.css';

// The entry gateway is imported EAGERLY (not `lazy`): `/` must paint the
// roleselection page straight from the entry chunk instead of flashing a
// loading fallback while a second request resolves.
import RoleSelect from './pages/RoleSelect.tsx';

// The preview toolbar (element picker + screenshots) drags in a screenshot
// library and is not needed to render the app, so it loads after first paint
// instead of holding up the entry. It keeps its own error boundary.
const VlyToolbar = lazy(() =>
  import('../vly-toolbar-readonly.tsx').then(module => ({ default: module.VlyToolbar })),
);

// Route components — everything behind the gate stays lazy so it costs
// nothing until it is visited.
const Landing = lazy(() => import('./pages/Landing.tsx'));
const AuthPage = lazy(() => import('./pages/Auth.tsx'));
const NotFound = lazy(() => import('./pages/NotFound.tsx'));

// Patient pages
const PatientHome = lazy(() => import('./pages/patient/Home.tsx'));
const Facilities = lazy(() => import('./pages/patient/Facilities.tsx'));
const Appointments = lazy(() => import('./pages/patient/Appointments.tsx'));
const BookAppointment = lazy(() => import('./pages/patient/BookAppointment.tsx'));
const Referrals = lazy(() => import('./pages/patient/Referrals.tsx'));
const HealthCard = lazy(() => import('./pages/patient/HealthCard.tsx'));
const PatientProfile = lazy(() => import('./pages/patient/Profile.tsx'));
const PatientReports = lazy(() => import('./pages/patient/Reports.tsx'));
const Timeline = lazy(() => import('./pages/patient/Timeline.tsx'));
const Medicines = lazy(() => import('./pages/patient/Medicines.tsx'));
const DiagnosticsPage = lazy(() => import('./pages/patient/Diagnostics.tsx'));
const Followups = lazy(() => import('./pages/patient/Followups.tsx'));
const Privacy = lazy(() => import('./pages/patient/Privacy.tsx'));
const Emergency = lazy(() => import('./pages/patient/Emergency.tsx'));

// Health Worker pages
const HWDashboard = lazy(() => import('./pages/healthworker/Dashboard.tsx'));
const HWRegisterPatient = lazy(() => import('./pages/healthworker/RegisterPatient.tsx'));

// Doctor pages
const DoctorDashboard = lazy(() => import('./pages/doctor/Dashboard.tsx'));
const ScanHealthCard = lazy(() => import('./pages/doctor/ScanHealthCard.tsx'));

// Hospital Admin pages
const HospitalAdminDashboard = lazy(() => import('./pages/hospitaladmin/Dashboard.tsx'));
const StaffManagement = lazy(() => import('./pages/hospitaladmin/StaffManagement.tsx'));

// Government Admin pages
const GovDashboard = lazy(() => import('./pages/govadmin/Dashboard.tsx'));
const HospitalManagement = lazy(() => import('./pages/govadmin/HospitalManagement.tsx'));

// Overall (master) Administrator pages
const MasterAdminDashboard = lazy(() => import('./pages/masteradmin/Dashboard.tsx'));

// Loading fallback
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </div>
  );
}

/** Silent error boundary for VlyToolbar */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn('[VlyToolbar] Caught error:', err.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

class NonFatalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; warns: Array<{ err: Error; ts: number }> }
> {
  state = { hasError: false, warns: [] };
  static getDerivedStateFromError(error: Error) {
    // Only fatal React errors reach the root fallback. Non-fatal warnings
    // during startup are captured here so the console still has them.
    const warns = (this as unknown as NonFatalErrorBoundary).state.warns ?? [];
    return { hasError: false, warns: [...warns, { err: error, ts: performance.now() }] };
  }
  render() {
    if (this.state.hasError) {
      return <RootFallback hasError={this.state.hasError} error={null} />;
    }
    return this.props.children;
  }
}

interface RootFallbackProps {
  hasError: boolean;
  error: Error | string | null;
}

/** Minimal screen shown only when React crashes during startup. */
function RootFallback({ hasError, error }: RootFallbackProps) {
  if (!hasError) return null;

  const message =
    (error instanceof Error ? error.message : typeof error === 'string' ? error : null) ??
    'The preview failed to load. Please refresh or reload the page to try again.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-lg text-center">
        <p className="text-sm font-semibold">Preview runtime error</p>
        <p className="mt-2 text-xs text-muted-foreground break-words">{message}</p>
        <button
          type="button"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => { window.location.reload(); }}
        >
          Reload page
        </button>
      </div>
    </div>
  );
}

/** Root error boundary */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | string | null }
> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(err: Error) {
    console.error('[Preview] Root crash:', err);
    this.setState(state => ({ error: err }));
  }
  render() {
    if (this.state.hasError) {
      return <RootFallback hasError={this.state.hasError} error={this.state.error} />;
    }
    return this.props.children;
  }
}

function App({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

// `VITE_CONVEX_URL` is published by the platform's Convex dev process, so a
// cold start can serve the page before the value exists. `ConvexReactClient`
// throws when it receives `undefined`, and because this runs at module scope
// that would abort the entry module — React never mounts and the page stays
// blank until the env file lands and the browser reloads. Fall back to a
// reserved, non-resolvable host instead (RFC 2606 `.invalid`) so the app always
// boots and renders from its offline cache; cloud calls simply stay
// unavailable until the real URL is present.
const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
if (!convexUrl) {
  console.warn(
    '[convex] VITE_CONVEX_URL is not set yet — starting on the local cache. ' +
      'Cloud sync resumes automatically once Convex dev publishes the URL.',
  );
}
const convex = new ConvexReactClient(convexUrl || 'https://convex-unconfigured.invalid');

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage({ type: 'iframe-route-change', path: location.pathname }, '*');
  }, [location.pathname]);
  return null;
}

// Visible to the browser before React mounts, so a white crash during the
// transition has something readable to fall back to.
if (typeof document !== 'undefined') {
  (window as unknown as Record<string, unknown>).__AL_rootFallbackHTML = `
    <div id="al-root-fallback" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#f6f9fa;text-align:center;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
      <p style="font-size:14px;font-weight:600;color:#0f172a;margin:0">The preview failed to load.</p>
      <p style="font-size:12px;color:#64748b;margin:0;max-width:34rem">If this keeps happening, try reloading the page or reopening the editor to start over.</p>
    </div>
  `;
}

// Visible to tests and the console: the environment the entry detected.
export const rootIsInBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <NonFatalErrorBoundary>
        <Suspense fallback={null}>
          <VlyToolbar />
        </Suspense>
      </NonFatalErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <AppProvider>
            <DataProvider>
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                {/* Public Routes */}
                {/* `/` IS the redesigned role-selection gateway — entering the
                    app shows it immediately, with no route-level fallback. */}
                <Route path="/" element={<RoleSelect />} />
                <Route path="/role-select" element={<RoleSelect />} />
                <Route path="/home" element={<Landing />} />
                <Route path="/auth" element={<AuthPage />} />

                  {/* Patient Routes */}
                  <Route path="/patient/dashboard" element={<RequireAuth allowedRoles={['patient']}><App><PatientHome /></App></RequireAuth>} />
                  <Route path="/patient/facilities" element={<RequireAuth allowedRoles={['patient']}><App><Facilities /></App></RequireAuth>} />
                  <Route path="/patient/appointments" element={<RequireAuth allowedRoles={['patient']}><App><Appointments /></App></RequireAuth>} />
                  <Route path="/patient/book-appointment" element={<RequireAuth allowedRoles={['patient']}><App><BookAppointment /></App></RequireAuth>} />
                  <Route path="/patient/referrals" element={<RequireAuth allowedRoles={['patient']}><App><Referrals /></App></RequireAuth>} />
                  <Route path="/patient/referrals/:id" element={<RequireAuth allowedRoles={['patient']}><App><Referrals /></App></RequireAuth>} />
                  <Route path="/patient/health-card" element={<RequireAuth allowedRoles={['patient']}><App><HealthCard /></App></RequireAuth>} />
                  <Route path="/patient/profile" element={<RequireAuth allowedRoles={['patient']}><App><PatientProfile /></App></RequireAuth>} />
                  <Route path="/patient/reports" element={<RequireAuth allowedRoles={['patient']}><App><PatientReports /></App></RequireAuth>} />
                  <Route path="/patient/timeline" element={<RequireAuth allowedRoles={['patient']}><App><Timeline /></App></RequireAuth>} />
                  <Route path="/patient/medicines" element={<RequireAuth allowedRoles={['patient']}><App><Medicines /></App></RequireAuth>} />
                  <Route path="/patient/diagnostics" element={<RequireAuth allowedRoles={['patient']}><App><DiagnosticsPage /></App></RequireAuth>} />
                  <Route path="/patient/followups" element={<RequireAuth allowedRoles={['patient']}><App><Followups /></App></RequireAuth>} />
                  <Route path="/patient/privacy" element={<RequireAuth allowedRoles={['patient']}><App><Privacy /></App></RequireAuth>} />
                  <Route path="/patient/emergency" element={<RequireAuth allowedRoles={['patient']}><App><Emergency /></App></RequireAuth>} />

                  {/* Health Worker Routes */}
                  <Route path="/health-worker/dashboard" element={<RequireAuth allowedRoles={['health_worker']}><App><HWDashboard /></App></RequireAuth>} />
                  <Route path="/health-worker/register" element={<RequireAuth allowedRoles={['health_worker']}><App><HWRegisterPatient /></App></RequireAuth>} />
                  <Route path="/health-worker/referrals" element={<RequireAuth allowedRoles={['health_worker']}><App><HWDashboard /></App></RequireAuth>} />
                  <Route path="/health-worker/followups" element={<RequireAuth allowedRoles={['health_worker']}><App><HWDashboard /></App></RequireAuth>} />

                  {/* Doctor Routes */}
                  <Route path="/doctor/dashboard" element={<RequireAuth allowedRoles={['doctor']}><App><DoctorDashboard /></App></RequireAuth>} />
                  {/* Health Card / walk-in access is an INDEPENDENT path into a
                      patient record — it never depends on the appointment list. */}
                  <Route path="/doctor/scan" element={<RequireAuth allowedRoles={['doctor']}><App><ScanHealthCard /></App></RequireAuth>} />
                  <Route path="/doctor/appointments" element={<RequireAuth allowedRoles={['doctor']}><App><DoctorDashboard /></App></RequireAuth>} />
                  <Route path="/doctor/referrals" element={<RequireAuth allowedRoles={['doctor']}><App><DoctorDashboard /></App></RequireAuth>} />
                  <Route path="/doctor/followups" element={<RequireAuth allowedRoles={['doctor']}><App><DoctorDashboard /></App></RequireAuth>} />

                  {/* Hospital Admin Routes */}
                  <Route path="/hospital-admin/dashboard" element={<RequireAuth allowedRoles={['hospital_admin']}><App><HospitalAdminDashboard /></App></RequireAuth>} />
                  <Route path="/hospital-admin/referrals" element={<RequireAuth allowedRoles={['hospital_admin']}><App><HospitalAdminDashboard /></App></RequireAuth>} />
                  <Route path="/hospital-admin/medicines" element={<RequireAuth allowedRoles={['hospital_admin']}><App><HospitalAdminDashboard /></App></RequireAuth>} />
                  <Route path="/hospital-admin/analytics" element={<RequireAuth allowedRoles={['hospital_admin']}><App><HospitalAdminDashboard /></App></RequireAuth>} />
                  <Route path="/hospital-admin/staff" element={<RequireAuth allowedRoles={['hospital_admin']}><App><StaffManagement /></App></RequireAuth>} />

                  {/* District Admin Routes */}
                  <Route path="/district-admin/dashboard" element={<RequireAuth allowedRoles={['gov_admin']}><App><GovDashboard /></App></RequireAuth>} />
                  <Route path="/district-admin/analytics" element={<RequireAuth allowedRoles={['gov_admin']}><App><GovDashboard /></App></RequireAuth>} />
                  <Route path="/district-admin/hospitals" element={<RequireAuth allowedRoles={['gov_admin']}><App><HospitalManagement /></App></RequireAuth>} />
                  <Route path="/district-admin/facilities" element={<RequireAuth allowedRoles={['gov_admin']}><App><GovDashboard /></App></RequireAuth>} />

                  {/* Overall Administrator Routes */}
                  <Route path="/master-admin/dashboard" element={<RequireAuth allowedRoles={['overall_admin']}><App><MasterAdminDashboard /></App></RequireAuth>} />
                  <Route path="/master-admin/districts" element={<RequireAuth allowedRoles={['overall_admin']}><App><MasterAdminDashboard /></App></RequireAuth>} />
                  <Route path="/master-admin/admins" element={<RequireAuth allowedRoles={['overall_admin']}><App><MasterAdminDashboard /></App></RequireAuth>} />

                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </DataProvider>
          </AppProvider>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
