// ============================================================================
// AarogyaLink - Role Selection Screen (Pre-Login)
// UI/UX only: role-selection state, auth, routing and backend are untouched.
// ============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  CloudOff,
  Route,
  Shield,
  ShieldCheck,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import type { Role } from '@/types';

// Official AarogyaLink healthcare-loop logo (served from public/).
const LOGO_SOURCES = [
  '/aarogyalink-logo.jpeg',
  '/aarogyalink-logo.jpg',
  '/aarogyalink-logo.png',
  '/aarogyalink-logo.webp',
];

const ROLES: { role: Role; icon: LucideIcon; label: string; description: string }[] = [
  { role: 'patient', icon: UserRound, label: 'Patient', description: 'View your healthcare journey' },
  { role: 'health_worker', icon: ClipboardList, label: 'Health Worker', description: 'Register patients & manage referrals' },
  { role: 'doctor', icon: Stethoscope, label: 'Doctor', description: 'Consult & manage assigned patients' },
  { role: 'hospital_admin', icon: Building2, label: 'Hospital Administrator', description: 'Manage hospital referrals & staff' },
  { role: 'gov_admin', icon: Shield, label: 'District Administrator', description: 'Monitor district healthcare activity' },
  { role: 'overall_admin', icon: ShieldCheck, label: 'Overall Administrator', description: 'Manage the healthcare network' },
];

const FEATURES: { icon: LucideIcon; label: string }[] = [
  { icon: ShieldCheck, label: 'Secure Role-Based Access' },
  { icon: Route, label: 'Referral Tracking' },
  { icon: CloudOff, label: 'Offline-First Workflows' },
  { icon: Activity, label: 'Follow-up Monitoring' },
];

// --- Decorative background (aria-hidden, extremely low opacity) -------------

const NODES: [number, number][] = [
  [120, 160], [245, 92], [352, 214], [184, 322], [96, 428],
  [1318, 142], [1214, 258], [1358, 332],
  [1178, 702], [1298, 782], [1076, 798],
  [238, 716], [124, 818], [358, 796],
  [694, 58], [842, 118],
];

const LINKS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 3],
  [5, 6], [6, 7], [5, 7],
  [8, 9], [9, 10], [8, 10],
  [11, 12], [11, 13], [12, 13],
  [14, 15],
];

const CROSSES: [number, number, number][] = [
  [478, 118, 1], [982, 218, 0.75], [142, 558, 0.9],
  [1244, 542, 1.05], [622, 832, 0.8], [906, 62, 0.65],
];

function BackgroundDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Very subtle teal / green / blue gradient wash */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(58rem 30rem at 8% -8%, rgba(13, 148, 136, 0.10), transparent 60%)',
            'radial-gradient(52rem 28rem at 100% 0%, rgba(59, 130, 246, 0.09), transparent 55%)',
            'radial-gradient(48rem 30rem at 55% 112%, rgba(16, 185, 129, 0.08), transparent 60%)',
          ].join(', '),
        }}
      />
      {/* Connected nodes, curved lines and faint medical crosses */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.07]"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path d="M-60 262 C 300 142 560 362 900 242 S 1320 122 1520 232" stroke="#0d9488" strokeWidth="1.5" />
        <path d="M-60 642 C 260 722 520 542 860 642 S 1280 762 1520 622" stroke="#3b82f6" strokeWidth="1.5" />
        <path d="M-40 462 C 380 402 700 522 1040 442 S 1380 382 1500 432" stroke="#10b981" strokeWidth="1" />
        {LINKS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
            stroke="#0d9488"
            strokeWidth="1.25"
          />
        ))}
        {NODES.map(([x, y], index) => (
          <g key={`node-${index}`}>
            <circle cx={x} cy={y} r="4.5" fill="#0d9488" />
            <circle cx={x} cy={y} r="10" stroke="#3b82f6" strokeWidth="1.25" />
          </g>
        ))}
        {CROSSES.map(([x, y, scale], index) => (
          <g key={`cross-${index}`} transform={`translate(${x} ${y}) scale(${scale})`} fill="#10b981">
            <rect x={-12} y={-4} width={24} height={8} rx={4} />
            <rect x={-4} y={-12} width={8} height={24} rx={4} />
          </g>
        ))}
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
    <div className="relative min-h-screen bg-background">
      <BackgroundDecor />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-[1100px]">
          {/* Brand header */}
          <header className="text-center">
            {logoSrc && (
              <img
                key={logoSrc}
                src={logoSrc}
                alt="AarogyaLink logo"
                onError={() => setLogoAttempt((attempt) => attempt + 1)}
                className="mx-auto h-14 w-auto max-w-full select-none sm:h-20 lg:h-24"
                draggable={false}
              />
            )}
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              AarogyaLink
            </h1>
            <p className="mt-2 text-base font-medium text-primary sm:text-lg">
              Closing the Rural Healthcare Loop
            </p>
            <p className="mx-auto mt-2.5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              One connected platform for referrals, care coordination and follow-up.
            </p>
          </header>

          {/* Role selection */}
          <section className="mt-8 text-center sm:mt-9">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Choose your role
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Select how you access AarogyaLink</p>
          </section>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ROLES.map(({ role, icon: Icon, label, description }) => {
              const selected = currentRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleSelect(role)}
                  aria-pressed={selected}
                  className={`group flex items-start gap-4 rounded-[18px] border p-4 text-left cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    selected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/25 shadow-[0_10px_30px_-16px_rgba(13,148,136,0.45)]'
                      : 'border-border/70 bg-card shadow-[0_1px_3px_rgba(16,24,40,0.05)] hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_6px_18px_-10px_rgba(16,24,40,0.25)]'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                      selected ? 'bg-primary/15 text-primary' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold leading-snug text-foreground">
                        {label}
                      </span>
                      {selected && (
                        <span
                          aria-hidden="true"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Continue */}
          <div className="mt-7 flex justify-center">
            <Button
              size="lg"
              className="h-12 w-full rounded-full px-9 text-[15px] font-semibold shadow-[0_8px_22px_-12px_rgba(13,148,136,0.65)] transition-all hover:-translate-y-0.5 sm:w-auto"
              onClick={() => navigate('/auth')}
              disabled={!currentRole}
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Platform feature strip */}
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-[13px]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-4 max-w-2xl text-center text-[11px] leading-relaxed text-muted-foreground/70">
            Secure role-based access • Referral tracking • Offline-first healthcare workflows
          </p>
        </div>
      </div>
    </div>
  );
}
