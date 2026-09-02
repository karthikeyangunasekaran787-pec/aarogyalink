import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { AppProvider } from "@/contexts/AppContext";
import { DataProvider } from "@/contexts/DataContext";
import "./index.css";

// Lazy load route components
const Landing = lazy(() => import("./pages/Landing.tsx"));
const RoleSelect = lazy(() => import("./pages/RoleSelect.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Patient pages
const PatientHome = lazy(() => import("./pages/patient/Home.tsx"));
const AITriage = lazy(() => import("./pages/patient/AITriage.tsx"));
const Facilities = lazy(() => import("./pages/patient/Facilities.tsx"));
const Appointments = lazy(() => import("./pages/patient/Appointments.tsx"));
const BookAppointment = lazy(() => import("./pages/patient/BookAppointment.tsx"));
const Referrals = lazy(() => import("./pages/patient/Referrals.tsx"));
const HealthCard = lazy(() => import("./pages/patient/HealthCard.tsx"));
const Timeline = lazy(() => import("./pages/patient/Timeline.tsx"));
const Medicines = lazy(() => import("./pages/patient/Medicines.tsx"));
const DiagnosticsPage = lazy(() => import("./pages/patient/Diagnostics.tsx"));
const Followups = lazy(() => import("./pages/patient/Followups.tsx"));
const Privacy = lazy(() => import("./pages/patient/Privacy.tsx"));
const Emergency = lazy(() => import("./pages/patient/Emergency.tsx"));

// Health Worker pages
const HWDashboard = lazy(() => import("./pages/healthworker/Dashboard.tsx"));
const HWRegisterPatient = lazy(() => import("./pages/healthworker/RegisterPatient.tsx"));

// Doctor pages
const DoctorDashboard = lazy(() => import("./pages/doctor/Dashboard.tsx"));

// Hospital Admin pages
const HospitalAdminDashboard = lazy(() => import("./pages/hospitaladmin/Dashboard.tsx"));
const StaffManagement = lazy(() => import("./pages/hospitaladmin/StaffManagement.tsx"));

// Government Admin pages
const GovDashboard = lazy(() => import("./pages/govadmin/Dashboard.tsx"));
const HospitalManagement = lazy(() => import("./pages/govadmin/HospitalManagement.tsx"));

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
  componentDidCatch(err: Error) { console.warn("[VlyToolbar] Caught error:", err.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

/** Root error boundary */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Unknown error", stack: error.stack || "" };
  }
  componentDidCatch(err: Error) { console.error("[Preview] Root crash:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage({ type: "iframe-route-change", path: location.pathname }, "*");
  }, [location.pathname]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <AppProvider>
            <DataProvider>
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/role-select" element={<RoleSelect />} />
                  <Route path="/auth" element={<AuthPage />} />

                  {/* Patient Routes */}
                  <Route path="/patient/dashboard" element={<RequireAuth allowedRoles={['patient']}><App><PatientHome /></App></RequireAuth>} />
                  <Route path="/patient/ai-triage" element={<RequireAuth allowedRoles={['patient']}><App><AITriage /></App></RequireAuth>} />
                  <Route path="/patient/facilities" element={<RequireAuth allowedRoles={['patient']}><App><Facilities /></App></RequireAuth>} />
                  <Route path="/patient/appointments" element={<RequireAuth allowedRoles={['patient']}><App><Appointments /></App></RequireAuth>} />
                  <Route path="/patient/book-appointment" element={<RequireAuth allowedRoles={['patient']}><App><BookAppointment /></App></RequireAuth>} />
                  <Route path="/patient/referrals" element={<RequireAuth allowedRoles={['patient']}><App><Referrals /></App></RequireAuth>} />
                  <Route path="/patient/referrals/:id" element={<RequireAuth allowedRoles={['patient']}><App><Referrals /></App></RequireAuth>} />
                  <Route path="/patient/health-card" element={<RequireAuth allowedRoles={['patient']}><App><HealthCard /></App></RequireAuth>} />
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
                  <Route path="/district-admin/reports" element={<RequireAuth allowedRoles={['gov_admin']}><App><GovDashboard /></App></RequireAuth>} />

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

// Simple wrapper that adds AppLayout
import { AppLayout } from "@/components/layout/AppLayout";
function App({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
