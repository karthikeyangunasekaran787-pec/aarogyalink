// ============================================================================
// AarogyaLink — Role Selection (entry screen)
// ----------------------------------------------------------------------------
// A role-selection gateway and nothing else: brand, "Select your role", the six
// cards, and Continue. No project description, features, statistics or promo
// content lives here.
//
// Scope: this file is UI only. Role state still flows through AppContext and
// Continue still navigates to the existing /auth flow — authentication,
// authorization, routing and the offline-first layer are untouched.
//
// Selection deliberately does NOT read AppContext's `currentRole`: that value
// defaults to 'patient' (and is restored from a saved session), which would
// make Continue look enabled before the visitor has chosen anything. Local
// state starts empty so the button truthfully starts disabled.
// ============================================================================

import { Suspense, lazy, useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Building2, HeartPulse, MapPinned, Settings2, Stethoscope, UserRound,
  type LucideIcon,
} from 'lucide-react';

import { RoleCard } from '@/components/roleselect/RoleCard';
import { ContinueButton } from '@/components/roleselect/ContinueButton';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useApp } from '@/contexts/AppContext';
import { useTranslation } from '@/hooks/use-translation';
import { ROLE_OPTIONS } from '@/lib/role-options';
import { nodeForRole } from '@/lib/role-network';
import type { Role } from '@/types';

// Three.js is heavy, so the background loads in its own chunk after paint.
const HealthcareNetwork3D = lazy(() => import('@/components/three/HealthcareNetwork3D'));

/**
 * Icons for the six roles, keyed by role so the card order and copy live in
 * `@/lib/role-options` (one source of truth, assertable without a DOM).
 * Avatar-free and equipment-free by design.
 */
const ROLE_ICONS: Record<Role, LucideIcon> = {
  patient: UserRound,
  health_worker: HeartPulse,
  doctor: Stethoscope,
  hospital_admin: Building2,
  gov_admin: MapPinned,
  overall_admin: Settings2,
};

export default function RoleSelect() {
  const { setCurrentRole } = useApp();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  const [selected, setSelected] = useState<Role | null>(null);

  const handleSelect = useCallback(
    (role: Role) => {
      // Keep the existing contract: publish the chosen role to AppContext so
      // the auth flow reads it exactly as before.
      setSelected(role);
      setCurrentRole(role);
    },
    [setCurrentRole],
  );

  const handleContinue = useCallback(() => {
    // Unchanged navigation into the existing role-specific authentication flow.
    navigate('/auth');
  }, [navigate]);

  /** Shared timing for the brand block, which fades in ahead of the cards. */
  const fade = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } }
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, ease: 'easeOut' as const, delay },
        };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6fafb]">
      {/* ── Background: 3D network, then a soft veil for text contrast ────── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <Suspense fallback={null}>
          <HealthcareNetwork3D className="absolute inset-0" activeNode={nodeForRole(selected)} />
        </Suspense>
        {/* Guarantees legibility without erasing the scene: a light core sits
            under the brand, heading and cards, while the outer band where the
            network lives stays clear enough to read. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(62% 56% at 50% 50%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 50%, rgba(246,250,251,0.38) 76%, rgba(246,250,251,0.10) 100%)',
          }}
        />
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen flex-col items-center px-5 py-10 sm:px-6 sm:py-12">
        <main className="flex w-full max-w-4xl flex-1 flex-col items-center justify-center">
          {/* Brand — the new AarogyaLink lockup (emblem + wordmark + tagline in
              the artwork itself), so no wordmark is printed under it. */}
          <motion.div {...fade(0)} className="flex flex-col items-center text-center">
            <BrandLogo variant="full" size={64} />
          </motion.div>

          <motion.h2
            {...fade(0.1)}
            className="mt-9 text-center text-xl font-semibold tracking-tight text-slate-900 sm:text-[26px]"
          >
            {t('selectYourRole')}
          </motion.h2>

          {/* Six role cards: 3×2 desktop, 2×3 tablet, single column mobile. */}
          <div className="mt-7 grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
            {ROLE_OPTIONS.map((option, index) => (
              <RoleCard
                key={option.role}
                index={index}
                label={t(option.labelKey)}
                icon={ROLE_ICONS[option.role]}
                tint={option.tint}
                selected={selected === option.role}
                onSelect={() => handleSelect(option.role)}
              />
            ))}
          </div>

          {/* Continue */}
          <div className="mt-9 flex w-full justify-center">
            <ContinueButton disabled={!selected} onClick={handleContinue} />
          </div>
        </main>
      </div>
    </div>
  );
}