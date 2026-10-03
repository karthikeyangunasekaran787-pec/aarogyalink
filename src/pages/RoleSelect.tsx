// ============================================================================
// AarogyaLink - Role Selection Screen (Pre-Login)
// UI/UX only: role-selection state, auth, routing and backend are untouched.
// ============================================================================

import '@fontsource-variable/inter';

import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Building2,
  Check,
  ClipboardPlus,
  MapPinned,
  ShieldCheck,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import type { Role } from '@/types';

// Official AarogyaLink logo (served from public/).
const LOGO_SOURCES = [
  '/aarogyalink-logo.jpeg',
  '/aarogyalink-logo.jpg',
  '/aarogyalink-logo.png',
  '/aarogyalink-logo.webp',
];

const FONT_STACK = '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const ROLES: { role: Role; icon: LucideIcon; label: string }[] = [
  { role: 'patient', icon: UserRound, label: 'Patient' },
  { role: 'health_worker', icon: ClipboardPlus, label: 'Health Worker' },
  { role: 'doctor', icon: Stethoscope, label: 'Doctor' },
  { role: 'hospital_admin', icon: Building2, label: 'Hospital Administrator' },
  { role: 'gov_admin', icon: MapPinned, label: 'District Administrator' },
  { role: 'overall_admin', icon: ShieldCheck, label: 'Overall Administrator' },
];

// --- Decorative background (aria-hidden, extremely low opacity) -------------

function BackgroundDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Very subtle teal + blue gradient glows */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(54rem 28rem at 10% -8%, rgba(13, 148, 136, 0.09), transparent 60%)',
            'radial-gradient(50rem 26rem at 98% 4%, rgba(59, 130, 246, 0.08), transparent 55%)',
          ].join(', '),
        }}
      />
      {/* Faint curved healthcare connection lines */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.06]"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path d="M-60 262 C 300 142 560 362 900 242 S 1320 122 1520 232" stroke="#0d9488" strokeWidth="1.5" />
        <path d="M-60 642 C 260 722 520 542 860 642 S 1280 762 1520 622" stroke="#3b82f6" strokeWidth="1.5" />
        <path d="M-40 462 C 380 402 700 522 1040 442 S 1380 382 1500 432" stroke="#10b981" strokeWidth="1" />
      </svg>
    </div>
  );
}

export default function RoleSelect() {
  const { setCurrentRole, currentRole } = useApp();
  const navigate = useNavigate();
  const [logoAttempt, setLogoAttempt] = useState(0);
  const logoSrc = logoAttempt < LOGO_SOURCES.length ? LOGO_SOURCES[logoAttempt] : null;

  const handleSelect = (role: Role) => {
    setCurrentRole(role);
  };

  return (
    <div className="relative min-h-screen bg-background" style={{ fontFamily: FONT_STACK }}>
      <BackgroundDecor />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex w-full max-w-[1000px] flex-col items-center">
          {/* Branding */}
          {logoSrc && (
            <img
              key={logoSrc}
              src={logoSrc}
              alt="AarogyaLink logo"
              onError={() => setLogoAttempt((attempt) => attempt + 1)}
              className="mx-auto h-[72px] w-auto max-w-full select-none animate-[brand-fade-down_450ms_ease-out_both] motion-reduce:animate-none sm:h-[84px]"
              style={{ animationDelay: '0ms' }}
              draggable={false}
            />
          )}
          <h1
            className="mt-3 text-[28px] font-bold tracking-tight text-foreground animate-[content-fade-up_450ms_ease-out_both] motion-reduce:animate-none sm:text-[32px]"
            style={{ animationDelay: '70ms' }}
          >
            AarogyaLink
          </h1>
          <p
            className="mt-1.5 text-sm font-medium text-primary animate-[content-fade-up_450ms_ease-out_both] motion-reduce:animate-none sm:text-[15px]"
            style={{ animationDelay: '130ms' }}
          >
            Closing the Rural Healthcare Loop
          </p>

          {/* Role selection container */}
          <section
            className="mt-6 w-full rounded-[24px] border border-border/60 bg-card/60 p-4 shadow-[0_1px_4px_rgba(16,24,40,0.05)] backdrop-blur-md animate-[content-fade-up_450ms_ease-out_both] motion-reduce:animate-none sm:p-6"
            style={{ animationDelay: '180ms' }}
          >
            <h2 className="text-center text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Choose your role
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map(({ role, icon: Icon, label }, index) => {
                const selected = currentRole === role;
                return (
                  <div
                    key={role}
                    className="animate-[card-fade-up_450ms_ease-out_both] motion-reduce:animate-none"
                    style={{ animationDelay: `${240 + index * 60}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(role)}
                      aria-pressed={selected}
                      className={`group relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] border p-2.5 text-center transition-all duration-200 ease-out hover:-translate-y-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-2 sm:p-4 ${
                        selected
                          ? 'border-primary bg-primary/5 shadow-[0_6px_18px_-10px_rgba(13,148,136,0.5)] hover:border-primary'
                          : 'border-border/70 bg-card/95 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-primary/60 hover:shadow-[0_10px_24px_-14px_rgba(16,24,40,0.35)]'
                      }`}
                    >
                      {selected && (
                        <span
                          aria-hidden="true"
                          className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      )}
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 sm:h-11 sm:w-11 ${
                          selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-healthcare-light text-healthcare-dark group-hover:bg-primary/25'
                        }`}
                      >
                        <Icon
                          className="h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-105"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-sm font-semibold leading-snug text-foreground">{label}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Continue */}
            <div className="mt-6 flex justify-center">
              <Button
                className="h-12 w-full rounded-[13px] gap-1.5 text-[15px] font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(13,148,136,0.65)] hover:brightness-110 disabled:shadow-none sm:w-[160px]"
                onClick={() => navigate('/auth')}
                disabled={!currentRole}
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
