// ============================================================================
// AarogyaLink - Authentication Page (Email Verification Code)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useApp } from '@/contexts/AppContext';
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

// Generate a 6-digit verification code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Format time remaining
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type AuthStep = 'email' | 'code';

export default function AuthPage() {
  const { currentRole, login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  const returnTo = (location.state as { from?: { pathname: string } })?.from?.pathname || ROLE_ROUTES[currentRole] || '/patient/dashboard';

  // Countdown timer for code expiry
  useEffect(() => {
    if (codeExpiry <= 0) return;
    const timer = setInterval(() => {
      setCodeExpiry(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [codeExpiry]);

  const handleSendCode = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    // Simulate sending verification code
    await new Promise(r => setTimeout(r, 1200));

    const newCode = generateCode();
    setGeneratedCode(newCode);
    setCodeSent(true);
    setCodeExpiry(300); // 5 minutes
    setStep('code');
    setLoading(false);
    setCode(['', '', '', '', '', '']);
  }, [email]);

  const handleVerifyCode = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const enteredCode = code.join('');
    if (enteredCode.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    if (codeExpiry <= 0) {
      setError('Verification code has expired. Please request a new one.');
      return;
    }

    setLoading(true);
    // Simulate verification
    await new Promise(r => setTimeout(r, 800));

    if (enteredCode === generatedCode) {
      const success = login(email, 'verified');
      setLoading(false);
      if (success) {
        navigate(returnTo, { replace: true });
      } else {
        setError('Login failed. Please try again.');
      }
    } else {
      setLoading(false);
      setError('Invalid verification code. Please check and try again.');
    }
  }, [code, generatedCode, codeExpiry, email, login, navigate, returnTo]);

  const handleResendCode = useCallback(async () => {
    setError('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    const newCode = generateCode();
    setGeneratedCode(newCode);
    setCodeExpiry(300);
    setCode(['', '', '', '', '', '']);
    setLoading(false);
  }, []);

  const handleCodeInput = (index: number, value: string) => {
    if (value.length > 1) return; // Only single digit
    if (value && !/^\d$/.test(value)) return; // Only digits

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
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
      // Focus last filled or next empty
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
                : `Verification code sent to ${email}`
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

              {/* Timer */}
              {codeExpiry > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Code expires in <span className="font-mono font-medium text-foreground">{formatTime(codeExpiry)}</span>
                </p>
              )}
              {codeExpiry <= 0 && codeSent && (
                <p className="text-center text-xs text-red-600">Code expired</p>
              )}

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading || codeExpiry <= 0}>
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
                  disabled={codeExpiry > 0 || loading}
                  className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed cursor-pointer"
                >
                  {codeExpiry > 0 ? `Resend code in ${formatTime(codeExpiry)}` : 'Resend verification code'}
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

          {/* Prototype notice */}
          <div className="text-center p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[11px] text-amber-800 font-medium">Prototype Mode</p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              The verification code will appear in a banner at the top of the screen since no email service is connected.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Code Display Banner (for prototype) ═══ */}
      {step === 'code' && codeSent && generatedCode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="text-center">
            <p className="text-[10px] opacity-80 font-medium uppercase tracking-wider">Verification Code</p>
            <p className="text-2xl font-mono font-bold tracking-[0.3em]">{generatedCode}</p>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(generatedCode)}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
