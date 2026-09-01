// ============================================================================
// AarogyaLink - Authentication Page (Convex Auth Email OTP)
// ============================================================================

import { useState, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Mail, KeyRound, ArrowLeft, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

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

type AuthStep = 'email' | 'code';

export default function AuthPage() {
  const { currentRole } = useApp();
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const returnTo = (location.state as { from?: { pathname: string } })?.from?.pathname || ROLE_ROUTES[currentRole] || '/patient/dashboard';

  const handleSendCode = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await signIn('email-otp', { email });
      setCodeSent(true);
      setStep('code');
      setCode(['', '', '', '', '', '']);
    } catch (err) {
      console.error('Send code error:', err);
      setError('Failed to send verification code. Please check your email and try again.');
    } finally {
      setLoading(false);
    }
  }, [email, signIn]);

  const handleVerifyCode = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const enteredCode = code.join('');
    if (enteredCode.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      await signIn('email-otp', { email, code: enteredCode });
      // If signIn succeeds, Convex Auth will update the auth state
      // Navigate after a brief delay to allow auth state to propagate
      setTimeout(() => {
        navigate(returnTo, { replace: true });
      }, 300);
    } catch (err) {
      console.error('Verify code error:', err);
      setError('Invalid or expired verification code. Please try again.');
      setLoading(false);
    }
  }, [code, email, signIn, navigate, returnTo]);

  const handleResendCode = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await signIn('email-otp', { email });
      setCode(['', '', '', '', '', '']);
    } catch (err) {
      console.error('Resend code error:', err);
      setError('Failed to resend verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, signIn]);

  const handleCodeInput = (index: number, value: string) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      const nextInput = document.querySelector(`input[name="code-${index + 1}"]`) as HTMLInputElement;
      nextInput?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.querySelector(`input[name="code-${index - 1}"]`) as HTMLInputElement;
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      const newCode = pasted.split('').concat(Array(6).fill('')).slice(0, 6);
      setCode(newCode);
      const focusIndex = Math.min(pasted.length, 5);
      const nextInput = document.querySelector(`input[name="code-${focusIndex}"]`) as HTMLInputElement;
      nextInput?.focus();
    }
  };

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
              {step === 'email'
                ? 'Enter your email to receive a verification code'
                : `A 6-digit code has been sent to ${email}`
              }
            </p>
          </div>

          {/* ── Step 1: Email ────────────────────────────── */}
          {step === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
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

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Sending code...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Send Verification Code
                  </span>
                )}
              </Button>
            </form>
          )}

          {/* ── Step 2: Verification Code ────────────────── */}
          {step === 'code' && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              {/* Email shown for reference */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setError(''); setCode(['', '', '', '', '', '']); setCodeSent(false); }}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              {/* Code input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Verification Code</label>
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, index) => (
                    <Input
                      key={index}
                      name={`code-${index}`}
                      type="text"
                      inputMode="numeric"
                      value={digit}
                      onChange={(e) => handleCodeInput(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      className="w-12 h-14 text-center text-xl font-bold"
                      maxLength={1}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading || code.join('').length !== 6}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Verify & Login
                  </span>
                )}
              </Button>

              {/* Resend code */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? 'Sending...' : 'Resend verification code'}
                </button>
              </div>

              {/* Back to email */}
              <button
                type="button"
                onClick={() => { setStep('email'); setError(''); setCode(['', '', '', '', '', '']); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mx-auto cursor-pointer"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to email
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
