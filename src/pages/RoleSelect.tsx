// ============================================================================
// AarogyaLink - Role Selection Screen (Pre-Login)
// ============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Shield,
  ShieldCheck,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import type { Role } from '@/types';

// Official AarogyaLink brand logo. Drop the asset into `public/` under any of
// these names (png preferred) and it renders top-center, untouched.
const LOGO_SOURCES = [
  '/aarogyalink-logo.jpeg',
  '/aarogyalink-logo.jpg',
  '/aarogyalink-logo.png',
  '/aarogyalink-logo.webp',
];

const ROLES: { role: Role; icon: LucideIcon; label: string; secondary?: boolean }[] = [
  { role: 'patient', icon: UserRound, label: 'Patient' },
  { role: 'health_worker', icon: ClipboardList, label: 'Health Worker' },
  { role: 'doctor', icon: Stethoscope, label: 'Doctor' },
  { role: 'hospital_admin', icon: Building2, label: 'Hospital Administrator' },
  { role: 'gov_admin', icon: Shield, label: 'District Administrator' },
  // Master administrator account — kept available but visually secondary.
  { role: 'overall_admin', icon: ShieldCheck, label: 'Overall Administrator', secondary: true },
];

export default function RoleSelect() {
  const { setCurrentRole, currentRole } = useApp();
  const navigate = useNavigate();
  const [logoAttempt, setLogoAttempt] = useState(0);
  const logoSrc = logoAttempt < LOGO_SOURCES.length ? LOGO_SOURCES[logoAttempt] : null;

  const handleSelect = (role: Role) => {
    setCurrentRole(role);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
      <div className="w-full max-w-[1080px]">
        {/* Brand header */}
        <header className="text-center">
          {logoSrc && (
            <img
              key={logoSrc}
              src={logoSrc}
              alt="AarogyaLink logo"
              onError={() => setLogoAttempt((attempt) => attempt + 1)}
              className="mx-auto h-16 w-auto max-w-full select-none sm:h-20 lg:h-24"
              draggable={false}
            />
          )}
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            AarogyaLink
          </h1>
          <p className="mt-1.5 text-sm font-medium text-primary sm:text-base">
            Closing the Rural Healthcare Loop
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
            One connected platform for referrals, care coordination and follow-up.
          </p>
        </header>

        {/* Role selection */}
        <section className="mt-8 text-center sm:mt-9">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">Choose your role</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select how you access AarogyaLink</p>
        </section>

        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map(({ role, icon: Icon, label, secondary }) => {
            const selected = currentRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => handleSelect(role)}
                aria-pressed={selected}
                className={`group flex items-center gap-3.5 rounded-[18px] border p-4 text-left cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-[0_1px_3px_rgba(16,24,40,0.06)]'
                    : 'border-border/80 bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-px hover:border-primary/40 hover:bg-muted/30'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    selected
                      ? 'bg-primary/10 text-primary'
                      : secondary
                        ? 'bg-muted/60 text-muted-foreground/70 group-hover:text-primary'
                        : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span
                  className={`text-sm font-semibold leading-snug ${
                    selected ? 'text-foreground' : secondary ? 'text-foreground/60' : 'text-foreground'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Continue */}
        <div className="mt-7 flex justify-center">
          <Button
            size="lg"
            className="h-11 w-full rounded-xl px-8 text-sm font-semibold sm:w-auto"
            onClick={() => navigate('/auth')}
            disabled={!currentRole}
          >
            Continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Footer notice */}
        <p className="mx-auto mt-6 max-w-xl text-center text-[11px] leading-relaxed text-muted-foreground/80">
          AarogyaLink uses AI-assisted clinical decision support. All AI outputs require healthcare
          professional review and do not constitute autonomous medical diagnosis.
        </p>
      </div>
    </div>
  );
}
