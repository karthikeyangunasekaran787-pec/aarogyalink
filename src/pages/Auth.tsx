// ============================================================================
// AarogyaLink - Authentication Page
// District Admin: auto-login (no credentials needed for prototype)
// Patients: login via registered email lookup
// Staff (Doctor, HW, Hospital Admin): login via username/password
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Mail, LogIn, AlertCircle, CheckCircle2, User, Lock, KeyRound } from 'lucide-react';

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

// Demo account for District Admin (auto-login, no credentials required)
const DISTRICT_ADMIN_DEMO = {
  id: 'uga1',
  name: 'District Collector',
  email: 'district@demo.com',
  role: 'gov_admin' as const,
};

export default function AuthPage() {
  const { currentRole, login, loginPatient, loginStaff } = useApp();
  const { getPatientByEmail, staffUsers, facilities, hospitals, updateStaffUser } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  const [emailValue, setEmailValue] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundPatient, setFoundPatient] = useState<{ name: string; healthCardId: string } | null>(null);
  const [pendingPasswordChange, setPendingPasswordChange] = useState<{
    userId: string;
    newPassword: string;
    confirmPassword: string;
  } | null>(null);
  const [pwError, setPwError] = useState('');

  const returnTo = (location.state as { from?: { pathname: string } })?.from?.pathname || ROLE_ROUTES[currentRole] || '/patient/dashboard';
  const isPatient = currentRole === 'patient';
  const isDistrictAdmin = currentRole === 'gov_admin';

  // ── District Admin: auto-login — no credentials needed ──────────
  useEffect(() => {
    if (isDistrictAdmin) {
      login(DISTRICT_ADMIN_DEMO.email);
      navigate(ROLE_ROUTES.gov_admin, { replace: true });
    }
  }, [isDistrictAdmin, login, navigate]);

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
    await new Promise(resolve => setTimeout(resolve, 300));

    const patient = getPatientByEmail(emailValue);
    setLoading(false);

    if (!patient) {
      setError('Patient not registered. Please contact your Health Worker to register your account first.');
      return;
    }

    setFoundPatient({ name: patient.name, healthCardId: patient.healthCardId });
    loginPatient(emailValue, patient.id, patient.healthCardId, patient.name);

    setTimeout(() => {
      navigate(returnTo, { replace: true });
    }, 800);
  }, [emailValue, getPatientByEmail, loginPatient, navigate, returnTo]);

  // ── Staff Login: validate username against staffUsers ─────────
  const handleStaffLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter your username.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Find staff user by username (includes accounts created by District Admin / Hospital Admin)
    const staffUser = staffUsers.find(u => u.username === username.trim());

    if (!staffUser) {
      setLoading(false);
      setError('Invalid username or password. Please check your credentials or contact your Hospital Administrator.');
      return;
    }

    // Validate password (demo mode — in production this would check password_hash)
    if (staffUser.password && staffUser.password !== password) {
      setLoading(false);
      setError('Invalid username or password. Please try again.');
      return;
    }

    if (staffUser.status === 'disabled') {
      setLoading(false);
      setError('Your account has been disabled. Please contact your Hospital Administrator.');
      return;
    }

    if (staffUser.role !== currentRole) {
      setLoading(false);
      setError(`This account is registered as ${ROLE_LABELS[staffUser.role]}, not ${ROLE_LABELS[currentRole]}.`);
      return;
    }

    // Check if user must change password on first login
    if (staffUser.mustChangePassword) {
      setPendingPasswordChange({ userId: staffUser.id, newPassword: '', confirmPassword: '' });
      setLoading(false);
      return;
    }

    // Login with the actual staff user data from the database
    // Look up facility name — check both facilities and hospitals (District Admin may have registered new hospitals)
    const staffFacility = staffUser.facilityId
      ? (facilities.find(f => f.id === staffUser.facilityId) || hospitals.find(h => h.id === staffUser.facilityId))
      : undefined;
    loginStaff({
      id: staffUser.id,
      name: staffUser.name,
      email: staffUser.email,
      role: staffUser.role,
      facilityId: staffUser.facilityId,
      facilityName: staffFacility?.name || 'Unknown Facility',
      departmentName: staffUser.departmentId,
      departmentId: staffUser.departmentId,
    });
    setLoading(false);

    navigate(returnTo, { replace: true });
  }, [username, password, currentRole, staffUsers, loginStaff, navigate, returnTo, facilities, hospitals]);

  // Handle force password change submission
  const handlePasswordChange = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (!pendingPasswordChange) return;
    if (pendingPasswordChange.newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    if (pendingPasswordChange.newPassword !== pendingPasswordChange.confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    // Update the user's password and mustChangePassword flag
    const updatedUser = staffUsers.find(u => u.id === pendingPasswordChange.userId);
    if (updatedUser) {
      updateStaffUser(updatedUser.id, {
        password: pendingPasswordChange.newPassword,
        mustChangePassword: false,
      });
      // Now login
      const staffFacility = updatedUser.facilityId
        ? (facilities.find(f => f.id === updatedUser.facilityId) || hospitals.find(h => h.id === updatedUser.facilityId))
        : undefined;
      loginStaff({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        facilityId: updatedUser.facilityId,
        facilityName: staffFacility?.name || 'Unknown Facility',
        departmentName: updatedUser.departmentId,
        departmentId: updatedUser.departmentId,
      });
      navigate(returnTo, { replace: true });
    }
  }, [pendingPasswordChange, staffUsers, updateStaffUser, facilities, hospitals, loginStaff, navigate, returnTo]);

  // ── Force Password Change Screen ──
  if (pendingPasswordChange) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8">
        <Link to="/role-select" className="text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          ← Change Role
        </Link>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Heart className="h-5 w-5 text-primary-foreground" fill="currentColor" />
          </div>
          <div>
            <span className="text-lg font-bold text-foreground tracking-tight">Aarogya</span>
            <span className="text-lg font-bold text-primary tracking-tight ml-0">Link</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6">Connecting Rural Patients to the Right Care — Until Recovery.</p>

        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-5">
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                <KeyRound className="h-6 w-6 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Change Your Password</h1>
              <p className="text-xs text-muted-foreground mt-1">This is your first login. Please set a new password to continue.</p>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={pendingPasswordChange.newPassword}
                    onChange={(e) => { setPendingPasswordChange(p => p ? { ...p, newPassword: e.target.value } : null); setPwError(''); }}
                    placeholder="Enter new password (min 6 characters)"
                    className="pl-9 h-11"
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={pendingPasswordChange.confirmPassword}
                    onChange={(e) => { setPendingPasswordChange(p => p ? { ...p, confirmPassword: e.target.value } : null); setPwError(''); }}
                    placeholder="Confirm new password"
                    className="pl-9 h-11"
                    required
                  />
                </div>
              </div>

              {pwError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {pwError}
                </div>
              )}

              <Button type="submit" className="w-full h-11">
                <span className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Set New Password & Continue
                </span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8">
      <Link to="/role-select" className="text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        ← Change Role
      </Link>

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

      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Login as {ROLE_LABELS[currentRole]}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {isPatient
                ? 'Enter the email registered by your Health Worker'
                : 'Enter your assigned username and password'
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
                    Verifying...
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

          {/* ── Staff Login (Doctor, Health Worker, Admin) ── */}
          {!isPatient && (
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    placeholder={currentRole === 'doctor' ? 'e.g. senthil.gm' : currentRole === 'health_worker' ? 'e.g. suganthi.hw' : 'e.g. rajan.admin'}
                    className="pl-9 h-11"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 h-11"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </span>
                )}
              </Button>

              <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3">
                <p className="font-medium text-foreground">Staff Account</p>
                <p>Your account was created by your Hospital Administrator. Contact them if you need access.</p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
