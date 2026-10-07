// ============================================================================
// AarogyaLink — Landing page
// ----------------------------------------------------------------------------
// The public front door. It states what the platform does, shows the referral
// loop that the product is built around, and routes into role selection.
//
// Everything claimed here is implemented: the referral closure workflow, the
// six role scopes, the QR arrival check and the offline-first cache. There are
// deliberately no usage statistics, no accuracy claims and no AI references.
// ============================================================================

import { Suspense, lazy, useCallback } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight, BadgeCheck, Building2, CalendarCheck, CheckCircle2,
  ClipboardList, CreditCard, Heart, Hospital, LayoutDashboard, MapPin,
  QrCode, ShieldCheck, Stethoscope, UserRound, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { REFERRAL_STEPS } from '@/convex/referralStatus';
import type { Language } from '@/lib/i18n';

// The 3D scene pulls in three.js, so it is loaded separately from the page.
const CareNetworkScene = lazy(() => import('@/components/three/CareNetworkScene'));

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'hi', label: 'हिन्दी' },
];

const ROLES = [
  { icon: UserRound, name: 'Patient', purpose: 'Follow your referrals, appointments and care history.' },
  { icon: Heart, name: 'Health Worker', purpose: 'Register patients and raise referrals from the field.' },
  { icon: Stethoscope, name: 'Doctor', purpose: 'Verify arrivals, consult, record treatment and close the loop.' },
  { icon: Hospital, name: 'Hospital Administrator', purpose: 'Accept referrals, assign doctors and schedule arrivals.' },
  { icon: Building2, name: 'District Administrator', purpose: 'Monitor every facility and referral in the district.' },
  { icon: LayoutDashboard, name: 'Overall Administrator', purpose: 'See the network across all districts.' },
];

const CAPABILITIES = [
  {
    icon: ClipboardList,
    title: 'Referral Closure Engine',
    body: 'Every referral moves through nine validated stages with recorded actor, role, facility and timestamp.',
  },
  {
    icon: QrCode,
    title: 'QR arrival verification',
    body: 'The receiving hospital scans the patient\u2019s referral QR to confirm arrival before the consultation begins.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-scoped access',
    body: 'A hospital sees only its own records, a district only its own district, a patient only their own care.',
  },
  {
    icon: WifiOff,
    title: 'Built for low connectivity',
    body: 'Work continues offline on the device cache and synchronises once the connection returns.',
  },
  {
    icon: CalendarCheck,
    title: 'Appointments and follow-ups',
    body: 'Scheduling, consultation and follow-up sit inside the same referral record, not in separate silos.',
  },
  {
    icon: CreditCard,
    title: 'Health card and care timeline',
    body: 'A single health card identifier ties visits, medicines, diagnostics and referrals together.',
  },
];

export default function Landing() {
  const { language, setLanguage } = useApp();

  const handleExplore = useCallback(() => {
    document.getElementById('care-loop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="AarogyaLink home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Heart className="h-4 w-4 text-primary-foreground" fill="currentColor" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight">
              Aarogya<span className="text-primary">Link</span>
            </span>
          </Link>

          <div className="flex-1" />

          <nav aria-label="Language" className="hidden items-center gap-1 sm:flex">
            {LANGUAGES.map(option => (
              <button
                key={option.code}
                type="button"
                onClick={() => setLanguage(option.code)}
                aria-pressed={language === option.code}
                className={
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (language === option.code
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {option.label}
              </button>
            ))}
          </nav>

          <Link to="/role-select">
            <Button size="sm" className="gap-1.5">
              Enter AarogyaLink
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Public healthcare referral network
            </p>

            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              AarogyaLink
              <span className="mt-2 block text-xl font-semibold text-primary sm:text-2xl">
                Closing the Rural Healthcare Loop
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Connecting patients, health workers, hospitals and doctors until care is completed.
            </p>

            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              We don&apos;t just create a referral. We close the care loop.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/role-select">
                <Button size="lg" className="w-full gap-2 sm:w-auto">
                  Enter AarogyaLink
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="w-full gap-2 sm:w-auto" onClick={handleExplore}>
                Explore the Care Journey
              </Button>
            </div>
          </div>

          {/* Decorative 3D care loop. Text carries every fact it depicts. */}
          <div className="relative h-72 sm:h-96 lg:h-[26rem]">
            <div className="absolute inset-0 rounded-2xl border border-border bg-card/60" />
            <Suspense fallback={null}>
              <CareNetworkScene className="absolute inset-0" />
            </Suspense>
            <p className="absolute inset-x-0 bottom-4 text-center text-xs font-medium text-muted-foreground">
              Patient → Health Worker → Facility → Doctor → Treatment → Follow-up → Closed
            </p>
          </div>
        </div>
      </section>

      {/* ── The care loop ──────────────────────────────────────────────── */}
      <section id="care-loop" className="border-b border-border bg-card/40 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              One referral, nine accountable stages
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              A referral is not finished when it is sent. It stays open until the receiving facility has
              verified arrival, consulted the patient and either closed the case or scheduled a follow-up.
              Every transition is validated and attributed.
            </p>
          </div>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {REFERRAL_STEPS.map((step, index) => (
              <li key={step.canonical} className="bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">{step.label}</span>
                </div>
                <p className="mt-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {step.canonical}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Invalid transitions are refused
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Doctor assignment cannot be skipped
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Closure is permanent
            </span>
          </div>
        </div>
      </section>

      {/* ── Capabilities ───────────────────────────────────────────────── */}
      <section className="border-b border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What the platform does</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            A single system for the whole referral pathway, designed for rural facilities and
            intermittent connectivity.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(capability => {
              const Icon = capability.icon;
              return (
                <article key={capability.title} className="rounded-xl border border-border bg-card p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{capability.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Roles ──────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/40 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Six roles, one pathway</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Each participant sees exactly the records their role is authorised for.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map(role => {
              const Icon = role.icon;
              return (
                <li key={role.name} className="flex gap-4 rounded-xl border border-border bg-card p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{role.name}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{role.purpose}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Closing call to action ─────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                Enter the referral network
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Choose your role to open the workspace you are authorised for.
              </p>
            </div>
            <Link to="/role-select" className="shrink-0">
              <Button size="lg" className="gap-2">
                Enter AarogyaLink
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-medium">AarogyaLink — Closing the Rural Healthcare Loop</p>
          <p className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
Primary districts: Pudukkottai and Tiruchirappalli
          </p>
        </div>
      </footer>
    </div>
  );
}
