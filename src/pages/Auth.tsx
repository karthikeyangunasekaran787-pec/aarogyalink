// ============================================================================
// AarogyaLink - Authentication Page
// Patients: must be registered by Health Worker first, login via email lookup
// Other roles: demo login with role-specific accounts
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Mail, LogIn, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  patient: 'Patient',
  health_worker: 'Health Worker',
  doctor: 'Doctor',
  hospital_admin: 'Hospital Administrator',
  gov_admin: 'District Administrator',
};

const ROLE_ROUTES: Record<string, string> = {
  patient: '/patient/dashboard',
  health_worker: '/health-worker/dashboard',
  doctor: '/doctor/dashboard',
  hospital_admin: '/hospital-admin/dashboard',
  gov_admin: '/district-admin/dashboard',
};

export default function AuthPage() {
  const { currentRole, login, loginPatient } = useApp();
  const { getPatientByEmail, patients } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  const [emailValue, setEmailValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundPatient, setFoundPatient] = useState<{ name: string; healthCardId: string } | null>(null);

  const returnTo = (location.state as { from?: { pathname: string } })?.from?.pathname || ROLE_ROUTES[currentRole] || '/patient/dashboard';

  const isPatient = currentRole === 'patient';

  // ── Patient Login: look up by email ───────────────────────────
  const handlePatientLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFoundPatient(null);

    if (!emailValue || !emailValue.includes('@')) {
      setError('Please enter the email address used during registration.');
      return;
    }

    setLoading(true);
    // Simulate a brief lookup delay
    await new Promise(resolve => setTimeout(resolve, 300));

    const patient = getPatientByEmail(emailValue);
    setLoading(false);

    if (!patient) {
      setError('No patient found with this email. Please ask a Health Worker to register you first.');
      return;
    }

    setFoundPatient({ name: patient.name, healthCardId: patient.healthCardId });

    // Login with patient's record
    loginPatient(emailValue, patient.id, patient.healthCardId, patient.name);

    // Navigate after a brief moment to show the success state
    setTimeout(() => {
      navigate(returnTo, { replace: true });
    }, 800);
  }, [emailValue, getPatientByEmail, loginPatient, navigate, returnTo]);

  // ── Non-patient Login (Health Worker, Doctor, Admin) ──────────
  const handleNonPatientLogin = useCallback(() => {
    login(emailValue || `demo-${currentRole}@aarogyalink.in`);
    navigate(returnTo, { replace: true });
  }, [login, emailValue, currentRole, navigate, returnTo]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Back to role selection */}
      <Link to="/role-select" className="text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        ← Change Role
      </Link>

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
          <Heart className="h-5 w-5 text-primary-foreground" fill="currentColor" />
        </div>
        <div>
          <span className="text-lg font-bold text-foreground tracking-tight">Aarogya</span>
          <span className="text-lg font-bold text-primary tracking-tight ml-0">Link</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Connecting Rural Patients to the Right Care — Until Recovery.
      </p>

      {/* Login Card */}
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Login as {ROLE_LABELS[currentRole]}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {isPatient
                ? 'Enter the email registered by your Health Worker'
                : 'Sign in to access your dashboard'
              }
            </p>
          </div>

          {/* ── Patient Login ──────────────────────────────── */}
          {isPatient && (
            <form onSubmit={handlePatientLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Registered Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={emailValue}
                    onChange={(e) => { setEmailValue(e.target.value); setError(''); setFoundPatient(null); }}
                    placeholder="your-email@example.com"
                    className="pl-9 h-11"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {foundPatient && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Welcome, {foundPatient.name}</p>
                    <p className="text-xs text-emerald-500">Health Card: {foundPatient.healthCardId}</p>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading || !!foundPatient}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Looking up your record...
                  </span>
                ) : foundPatient ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </span>
                )}
              </Button>

              <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
                <p className="font-medium text-foreground">How to get access</p>
                <p>Ask your local Health Worker to register you on AarogyaLink. They will create your account with your email address. You can then log in here.</p>
              </div>
            </form>
          )}

          {/* ── Non-patient Login ──────────────────────────── */}
          {!isPatient && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    placeholder={`you@demo.aarogyalink.in`}
                    className="pl-9 h-11"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="button"
                className="w-full h-11"
                onClick={handleNonPatientLogin}
              >
                <span className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign in as {ROLE_LABELS[currentRole]}
                </span>
              </Button>

              <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3">
                <p className="font-medium text-foreground">Demo Account</p>
                <p>Click "Sign in" to access the {ROLE_LABELS[currentRole]} dashboard with demo data.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
