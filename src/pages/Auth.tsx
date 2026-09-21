// ============================================================================
// AarogyaLink - Authentication Page
// Overall Admin : master email + emailed one-time code
// Patients      : login via registered email lookup
// Staff (Doctor, Health Worker, Hospital Admin, District Admin): username/password
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@/convex/_generated/api';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import {
  clearPendingLogin,
  rememberPendingLogin,
  isAnonymousSignInInFlight,
  setAnonymousAuthSuspended,
  writeBackendToken,
} from '@/lib/backend-session';
import type { Role } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Mail, LogIn, AlertCircle, CheckCircle2, User, Lock, KeyRound, ShieldCheck } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  patient: 'Patient',
  health_worker: 'Health Worker',
  doctor: 'Doctor',
  hospital_admin: 'Hospital Administrator',
  gov_admin: 'District Administrator',
  overall_admin: 'Overall Administrator',
};

const ROLE_ROUTES: Record<string, string> = {
  patient: '/patient/dashboard',
  health_worker: '/health-worker/dashboard',
  doctor: '/doctor/dashboard',
  hospital_admin: '/hospital-admin/dashboard',
  gov_admin: '/district-admin/dashboard',
  overall_admin: '/master-admin/dashboard',
};

/** Identity resolved for a staff login (server-verified when reachable). */
interface StaffIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
  facilityId?: string;
  districtId?: string;
  districtName?: string;
  departmentId?: string;
  mustChangePassword?: boolean;
}

export default function AuthPage() {
  const { currentRole, loginPatient, loginStaff, currentUser, isAuthenticated, isAuthLoading } = useApp();
  const { getPatientByEmail, staffUsers, facilities, hospitals, updateStaffUser } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  // Server-side session binding (see src/convex/appSession.ts). The backend
  // verifies credentials against STORED data and returns the role/hospital it
  // finds there — the client never declares its own authorization.
  const loginStaffSession = useMutation(api.appSession.loginStaffSession);
  const loginPatientSession = useMutation(api.appSession.loginPatientSession);
  const loginOverallSession = useMutation(api.appSession.loginOverallSession);
  const { signIn, signOut } = useAuthActions();

  // Overall Administrator: the master email is verified by an emailed one-time
  // code, and only THEN does the server open the master binding.
  const [masterStage, setMasterStage] = useState<'email' | 'code'>('email');
  const [masterEmail, setMasterEmail] = useState('');
  const [masterCode, setMasterCode] = useState('');
  const [masterInfo, setMasterInfo] = useState('');

  // Set once a login happens on this page so the auto-redirect below never
  // overrides the intended return path after an explicit sign-in.
  const justLoggedInRef = useRef<boolean>(false);

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
  const isOverallAdmin = currentRole === 'overall_admin';

  // ── Already signed in: return to the correct dashboard ──────────
  // Keeps a restored session usable (e.g. reopening /auth after a refresh)
  // instead of showing the login form to an authenticated user.
  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated || !currentUser) return;
    if (justLoggedInRef.current || pendingPasswordChange) return;
    navigate(ROLE_ROUTES[currentUser.role] || '/', { replace: true });
  }, [isAuthLoading, isAuthenticated, currentUser, pendingPasswordChange, navigate]);

  // ── Overall Administrator: master email + emailed one-time code ──
  // Step 1 sends the code to the address the operator typed; the backend never
  // learns about it until step 2, and it only opens the master binding when the
  // authenticated identity actually IS the configured master address.
  const handleMasterRequestCode = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMasterInfo('');
    if (!masterEmail.includes('@')) {
      setError('Enter the master administrator email address.');
      return;
    }
    setLoading(true);
    try {
      await signIn('email-otp', { email: masterEmail.trim() });
      setMasterStage('code');
      setMasterCode('');
      setMasterInfo(`A one-time verification code was sent to ${masterEmail.trim()}. Each code works once and expires in 15 minutes, so enter the newest one.`);
    } catch {
      setError('Could not send the verification code. Check the address and your connection, then retry.');
    }
    setLoading(false);
  }, [masterEmail, signIn]);

  /**
   * Ask for a fresh code without leaving the code step. A code is single-use,
   * so this is the path to take whenever a previous attempt was rejected.
   */
  const handleMasterResendCode = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await signIn('email-otp', { email: masterEmail.trim() });
      setMasterCode('');
      setMasterInfo(`A new code was sent to ${masterEmail.trim()}. Use only the newest code.`);
    } catch {
      setError('Could not send a new code. Check your connection and try again.');
    }
    setLoading(false);
  }, [masterEmail, signIn]);

  // Step 2 verifies the code and asks the server to open the master binding.
  const handleMasterVerify = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (masterCode.trim().length < 4) {
      setError('Enter the verification code from the email.');
      return;
    }
    setLoading(true);
    // While this real sign-in runs, the app must NOT create its usual anonymous
    // transport session: that would replace the freshly verified session and
    // leave the backend looking at a caller with no email address.
    setAnonymousAuthSuspended(true);
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    try {
      // Let any anonymous sign-in that was already running finish first: if one
      // completed after the verified sign-in it would write its tokens over the
      // session and the backend would see a caller with no email address.
      for (let i = 0; i < 10 && isAnonymousSignInInFlight(); i++) await sleep(150);

      // Start from a signed-OUT client.
      //
      // Convex Auth only asks the Convex client to re-read its token when the
      // authenticated state FLIPS. Swapping the app's anonymous transport
      // session for the emailed one keeps that state `true`, so the app would
      // carry on sending the ANONYMOUS token — the backend would then see a
      // caller with no email address. Signing out first makes the flip
      // explicit, and the verified session is picked up straight away.
      try { await signOut(); } catch { /* already signed out */ }
      // Give React a moment to commit the signed-out state, so the Convex client
      // really does drop the old token before the new one arrives.
      await sleep(250);

      // Step 1 — verify the emailed code. Convex Auth checks the code against
      // the one that was mailed, so this is the only place a bad or already
      // used code can be reported: say exactly what happened rather than
      // failing generically.
      try {
        await signIn('email-otp', { email: masterEmail.trim(), code: masterCode.trim() });
      } catch (signInError) {
        const raw = signInError instanceof Error ? signInError.message : String(signInError);
        setLoading(false);
        setError(/too many|rate/i.test(raw)
          ? 'Too many verification attempts for this address. Wait a few minutes, then request a new code.'
          : /expire|invalid|verify code/i.test(raw)
            ? 'That code has expired or was already used. Request a new code and enter the newest one.'
            : `Could not verify the code (${raw.slice(0, 120)}). Request a new code and try again.`);
        return;
      }

      // Step 2 — open the master binding. The verified session has to reach the
      // Convex client's socket before this can see the email, so retry: a
      // `Not authenticated`/`no_verified_email` answer here means the token is
      // still propagating, not that the code was wrong.
      await sleep(300);
      let observed = '';
      let bound: { token?: string; user?: { id: string; name?: string; email?: string } } | null = null;
      let lastError = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const result = await loginOverallSession({});
          if (result?.ok && result.token) { bound = result; break; }
          observed = (result as { observedEmail?: string | null })?.observedEmail ?? '';
          if (observed) break; // a real answer: this address is not the master
        } catch (bindError) {
          lastError = bindError instanceof Error ? bindError.message : String(bindError);
        }
        await sleep(500);
      }

      if (!bound?.token) {
        // A wrong address leaves a real (unbound) session behind: drop it so
        // the app falls back to its normal transport session.
        if (observed) { try { await signOut(); } catch { /* ok */ } }
        setLoading(false);
        setError(observed
          ? `Signed in as ${observed}, but the Overall Administrator of AarogyaLink is another address.`
          : lastError
            ? `Signed in, but the backend could not confirm the session (${lastError.slice(0, 120)}). Try again.`
            : 'Signed in, but the browser was still holding its background session, so the verified email was not attached. Reload the page, request a new code and verify again.');
        return;
      }
      writeBackendToken(bound.token);
      clearPendingLogin();
      justLoggedInRef.current = true;
      loginStaff({
        id: bound.user?.id ?? 'overall-admin',
        name: bound.user?.name || 'Overall Administrator',
        email: bound.user?.email || masterEmail.trim(),
        role: 'overall_admin',
      });
      setLoading(false);
      navigate(ROLE_ROUTES.overall_admin, { replace: true });
    } catch (error) {
      setLoading(false);
      setError(error instanceof Error
        ? `Sign-in failed: ${error.message.slice(0, 140)}`
        : 'Sign-in failed. Please try again.');
    } finally {
      // Release the anonymous transport session once this flow is over: on a
      // failure the app must be able to fall back to its usual transport
      // session, and on success the master session is already live.
      setAnonymousAuthSuspended(false);
    }
  }, [masterEmail, masterCode, signIn, signOut, loginOverallSession, loginStaff, navigate]);

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

    // Look the patient up on the server first: this is what lets a patient
    // registered on ANOTHER device sign in here, and it binds the backend
    // session to the stored patient record.
    let identity: { patientId: string; healthCardId: string; name: string } | null = null;
    try {
      const result = await loginPatientSession({ email: emailValue });
      if (result?.ok && result.user && 'patientId' in result.user && result.user.patientId) {
        if ('token' in result && result.token) {
          writeBackendToken(result.token as string);
          clearPendingLogin();
        }
        identity = {
          patientId: result.user.patientId as string,
          healthCardId: (result.user.healthCardId as string) || '',
          name: (result.user.name as string) || '',
        };
      }
    } catch {
      /* backend unreachable — fall back to this device's cached records */
    }

    if (!identity) {
      const patient = getPatientByEmail(emailValue);
      if (!patient) {
        setLoading(false);
        setError('Patient not registered. Please contact your Health Worker to register your account first.');
        return;
      }
      // Keep the credentials in memory so the backend binding can be created
      // once the patient record is reachable, without a reload.
      const fallback = { patientId: patient.id, name: patient.name };
      rememberPendingLogin({ kind: 'patient', email: emailValue, healthCardId: patient.healthCardId, fallback });
      identity = { patientId: patient.id, healthCardId: patient.healthCardId, name: patient.name };
      // Bind now if the deployment simply has no stored patient records yet
      // (brand-new deployment) — otherwise this stays pending.
      try {
        const retry = await loginPatientSession({
          email: emailValue,
          healthCardId: patient.healthCardId,
          fallback,
        });
        if (retry?.ok && 'token' in retry && retry.token) {
          writeBackendToken(retry.token as string);
          clearPendingLogin();
        }
      } catch {
        /* still offline — the binding stays pending */
      }
    }

    setLoading(false);
    setFoundPatient({ name: identity.name, healthCardId: identity.healthCardId });
    justLoggedInRef.current = true;
    loginPatient(emailValue, identity.patientId, identity.healthCardId, identity.name);

    setTimeout(() => {
      navigate(returnTo, { replace: true });
    }, 800);
  }, [emailValue, getPatientByEmail, loginPatient, loginPatientSession, navigate, returnTo]);

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

    // 1) Ask the backend to verify the credentials against STORED staff data.
    //    On success the server also creates the session binding that authorizes
    //    this device, and returns the role/hospital it found in the database.
    let identity: StaffIdentity | null = null;
    let disabled = false;
    try {
      const result = await loginStaffSession({ username: username.trim(), password });
      if (result?.ok && result.user && result.user.id) {
        if ('token' in result && result.token) {
          writeBackendToken(result.token as string);
          clearPendingLogin();
        }
        identity = {
          id: result.user.id,
          name: result.user.name || '',
          email: result.user.email || '',
          role: (result.user.role || '') as Role,
          facilityId: result.user.facilityId ?? undefined,
          districtId: result.user.districtId ?? undefined,
          districtName: result.user.districtName ?? undefined,
          departmentId: result.user.departmentId ?? undefined,
          mustChangePassword: result.user.mustChangePassword,
        };
      } else if (result?.reason === 'disabled') {
        disabled = true;
      }
      // reason === 'invalid' falls through to the local check below: the
      // account may have been created on this device while offline and not
      // reached the cloud yet.
    } catch {
      /* backend unreachable — verify against this device's cached records */
    }

    // 2) Local fallback (offline-first): accounts this device knows about.
    //
    // DEMO/PROTOTYPE ONLY. This compares against the cached demo credentials so
    // field devices keep working without connectivity. It is NOT a security
    // boundary: it grants routing access only, and every protected backend
    // operation still requires the server-issued session binding created by
    // loginStaffSession. TODO(production): move staff accounts into Convex Auth
    // with hashed passwords and delete this branch.
    if (!identity && !disabled) {
      const staffUser = staffUsers.find(u => u.username === username.trim());
      const passwordOk = !!staffUser && (!staffUser.password || staffUser.password === password);
      if (staffUser && passwordOk && staffUser.status !== 'disabled') {
        identity = {
          id: staffUser.id,
          name: staffUser.name,
          email: staffUser.email,
          role: staffUser.role,
          facilityId: staffUser.facilityId,
          districtId: staffUser.districtId,
          districtName: staffUser.districtName,
          departmentId: staffUser.departmentId,
          mustChangePassword: staffUser.mustChangePassword,
        };
        const fallback = {
          role: staffUser.role,
          facilityId: staffUser.facilityId,
          districtId: staffUser.districtId,
          districtName: staffUser.districtName,
          staffUserId: staffUser.id,
          name: staffUser.name,
          email: staffUser.email,
          departmentId: staffUser.departmentId,
        };
        rememberPendingLogin({ kind: 'staff', username: username.trim(), password, fallback });
        // Bind now when the deployment stores no staff records yet (brand-new
        // deployment); otherwise the pending login is bound once reachable.
        try {
          const retry = await loginStaffSession({ username: username.trim(), password, fallback });
          if (retry?.ok && 'token' in retry && retry.token) {
            writeBackendToken(retry.token as string);
            clearPendingLogin();
          }
        } catch {
          /* still offline — the binding stays pending */
        }
      } else if (staffUser?.status === 'disabled') {
        disabled = true;
      }
    }

    if (disabled) {
      setLoading(false);
      setError('Your account has been disabled. Please contact your Hospital Administrator.');
      return;
    }

    if (!identity) {
      setLoading(false);
      setError('Invalid username or password. Please check your credentials or contact your Hospital Administrator.');
      return;
    }

    if (identity.role !== currentRole) {
      setLoading(false);
      setError(`This account is registered as ${ROLE_LABELS[identity.role]}, not ${ROLE_LABELS[currentRole]}.`);
      return;
    }

    // Check if user must change password on first login
    if (identity.mustChangePassword) {
      setPendingPasswordChange({ userId: identity.id, newPassword: '', confirmPassword: '' });
      setLoading(false);
      return;
    }

    // Login with the verified identity (server-derived whenever reachable)
    justLoggedInRef.current = true;
    // Look up facility name — check both facilities and hospitals (District Admin may have registered new hospitals)
    const staffFacility = identity.facilityId
      ? (facilities.find(f => f.id === identity.facilityId) || hospitals.find(h => h.id === identity.facilityId))
      : undefined;
    loginStaff({
      id: identity.id,
      name: identity.name,
      email: identity.email,
      role: identity.role,
      facilityId: identity.facilityId,
      facilityName: staffFacility?.name,
      districtId: identity.districtId,
      districtName: identity.districtName,
      departmentName: identity.departmentId,
      departmentId: identity.departmentId,
    });
    setLoading(false);

    navigate(returnTo, { replace: true });
  }, [username, password, currentRole, staffUsers, loginStaff, loginStaffSession, navigate, returnTo, facilities, hospitals]);

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
      justLoggedInRef.current = true;
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
        facilityName: staffFacility?.name,
        districtId: updatedUser.districtId,
        districtName: updatedUser.districtName,
        departmentName: updatedUser.departmentId,
        departmentId: updatedUser.departmentId,
      });
      navigate(returnTo, { replace: true });
    } else {
      // The record exists in the cloud but has not been adopted on this device
      // yet (just bound, first load). Ask for a retry instead of failing softly.
      setPwError('Your account data is still loading — please try again in a moment.');
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
                : isOverallAdmin
                  ? 'Verify the master email with the one-time code we send you'
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

          {/* ── Overall Administrator (master) login ─────── */}
          {isOverallAdmin && (
            <form onSubmit={masterStage === 'email' ? handleMasterRequestCode : handleMasterVerify} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Master Administrator Email</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={masterEmail}
                    onChange={(e) => { setMasterEmail(e.target.value); setError(''); setMasterInfo(''); setMasterStage('email'); }}
                    placeholder="master-email@example.com"
                    className="pl-9 h-11"
                    autoFocus
                    required
                    disabled={masterStage === 'code'}
                  />
                </div>
              </div>

              {masterStage === 'code' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">One-Time Verification Code</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      inputMode="numeric"
                      value={masterCode}
                      onChange={(e) => { setMasterCode(e.target.value.replace(/\D/g, '').slice(0, 8)); setError(''); }}
                      placeholder="6-digit code"
                      className="pl-9 h-11 tracking-[0.3em]"
                      autoFocus
                      required
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {masterInfo && !error && (
                <div className="flex items-start gap-2 text-sm text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                  <Mail className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{masterInfo}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    {masterStage === 'email' ? 'Sending code...' : 'Verifying...'}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    {masterStage === 'email' ? 'Send Verification Code' : 'Verify & Open Overall Administration'}
                  </span>
                )}
              </Button>

              {masterStage === 'code' && (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    disabled={loading}
                    onClick={() => { void handleMasterResendCode(); }}
                  >
                    Send a new code
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setMasterStage('email'); setMasterCode(''); setMasterInfo(''); setError(''); }}
                  >
                    ← Use a different email
                  </button>
                </div>
              )}

              <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
                <p className="font-medium text-foreground">Master account</p>
                <p>The Overall Administrator is the platform owner. Access is verified by a one-time code sent to the registered master email; only this account can create districts and District Administrators.</p>
              </div>
            </form>
          )}

          {/* ── Staff Login (Doctor, Health Worker, Hospital/District Admin) ── */}
          {!isPatient && !isOverallAdmin && (
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    placeholder={
                      currentRole === 'doctor'
                        ? 'e.g. arun.pdk001'
                        : currentRole === 'health_worker'
                          ? 'e.g. suganthi.pdk001'
                          : currentRole === 'gov_admin'
                            ? 'e.g. distadmin_pdk'
                            : 'e.g. rajesh.pdk001'
                    }
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
                <p>
                  {currentRole === 'gov_admin'
                    ? 'District Administrator accounts are created by the Overall Administrator and are scoped to a single district.'
                    : 'Your account was created by your Hospital Administrator. Contact them if you need access.'}
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
