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
import "./index.css";

// Lazy load route components
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Patient pages
const PatientHome = lazy(() => import("./pages/patient/Home.tsx"));
const AITriage = lazy(() => import("./pages/patient/AITriage.tsx"));
const Facilities = lazy(() => import("./pages/patient/Facilities.tsx"));
const Appointments = lazy(() => import("./pages/patient/Appointments.tsx"));
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

// Government Admin pages
const GovDashboard = lazy(() => import("./pages/govadmin/Dashboard.tsx"));

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
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<AuthPage redirectAfterAuth="/app" />} />

                {/* Patient App Routes */}
                <Route path="/app" element={<RequireAuth><App><PatientHome /></App></RequireAuth>} />
                <Route path="/app/ai-triage" element={<RequireAuth><App><AITriage /></App></RequireAuth>} />
                <Route path="/app/facilities" element={<RequireAuth><App><Facilities /></App></RequireAuth>} />
                <Route path="/app/appointments" element={<RequireAuth><App><Appointments /></App></RequireAuth>} />
                <Route path="/app/referrals" element={<RequireAuth><App><Referrals /></App></RequireAuth>} />
                <Route path="/app/referrals/:id" element={<RequireAuth><App><Referrals /></App></RequireAuth>} />
                <Route path="/app/health-card" element={<RequireAuth><App><HealthCard /></App></RequireAuth>} />
                <Route path="/app/timeline" element={<RequireAuth><App><Timeline /></App></RequireAuth>} />
                <Route path="/app/medicines" element={<RequireAuth><App><Medicines /></App></RequireAuth>} />
                <Route path="/app/diagnostics" element={<RequireAuth><App><DiagnosticsPage /></App></RequireAuth>} />
                <Route path="/app/followups" element={<RequireAuth><App><Followups /></App></RequireAuth>} />
                <Route path="/app/privacy" element={<RequireAuth><App><Privacy /></App></RequireAuth>} />
                <Route path="/app/emergency" element={<RequireAuth><App><Emergency /></App></RequireAuth>} />

                {/* Health Worker Routes */}
                <Route path="/hw" element={<RequireAuth><App><HWDashboard /></App></RequireAuth>} />
                <Route path="/hw/register" element={<RequireAuth><App><HWRegisterPatient /></App></RequireAuth>} />
                <Route path="/hw/*" element={<RequireAuth><App><HWDashboard /></App></RequireAuth>} />

                {/* Doctor Routes */}
                <Route path="/doc" element={<RequireAuth><App><DoctorDashboard /></App></RequireAuth>} />
                <Route path="/doc/*" element={<RequireAuth><App><DoctorDashboard /></App></RequireAuth>} />

                {/* Hospital Admin Routes */}
                <Route path="/admin" element={<RequireAuth><App><HospitalAdminDashboard /></App></RequireAuth>} />
                <Route path="/admin/*" element={<RequireAuth><App><HospitalAdminDashboard /></App></RequireAuth>} />

                {/* Government Admin Routes */}
                <Route path="/gov" element={<RequireAuth><App><GovDashboard /></App></RequireAuth>} />
                <Route path="/gov/*" element={<RequireAuth><App><GovDashboard /></App></RequireAuth>} />

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
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
