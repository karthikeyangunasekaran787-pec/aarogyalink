// ============================================================================
// AarogyaLink — Referral Closure Engine metrics
// ----------------------------------------------------------------------------
// Every number here is COMPUTED from the referrals and their audit events that
// the signed-in role is allowed to see. Nothing is invented: when the data is
// not available (e.g. no referral has been accepted yet) the panel says
// "No data available" instead of showing a placeholder figure.
// ============================================================================

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, Clock, Timer, TrendingUp } from 'lucide-react';
import { REFERRAL_STATUS, REFERRAL_STEPS, type ReferralStatusValue } from '@/convex/referralStatus';
import type { Referral, ReferralEvent, ReferralStatus } from '@/types';

export interface ClosureStats {
  total: number;
  /** Count of referrals currently in each stage (mutually exclusive). */
  byStatus: Record<string, number>;
  /** Highest stage ever reached, per canonical step (funnel semantics). */
  reached: { status: ReferralStatusValue; label: string; count: number; percentage: number }[];
  closed: number;
  closureRate: number | null;
  /** Averages in hours, or null when there is no timing data yet. */
  avgAcceptHours: number | null;
  avgConsultHours: number | null;
  avgClosureHours: number | null;
}

const hoursBetween = (from: string | undefined, to: string | undefined): number | null => {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return (b - a) / 36e5;
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/** Status recorded by an event (older events only carry `status`). */
const eventStatusOf = (event: ReferralEvent): string | undefined =>
  event.newStatus ?? event.canonicalStatus ?? event.status;

export function computeClosureStats(referrals: Referral[], events: ReferralEvent[]): ClosureStats {
  const eventsByReferral = new Map<string, ReferralEvent[]>();
  for (const event of events) {
    const list = eventsByReferral.get(event.referralId);
    if (list) list.push(event);
    else eventsByReferral.set(event.referralId, [event]);
  }

  const byStatus: Record<string, number> = {};
  for (const referral of referrals) {
    byStatus[referral.status] = (byStatus[referral.status] ?? 0) + 1;
  }

  // Funnel: how many referrals ever reached each canonical step.
  const stepIndex = new Map<ReferralStatusValue, number>(REFERRAL_STEPS.map((s, i) => [s.status, i]));
  const reached = REFERRAL_STEPS.map(step => {
    const target = stepIndex.get(step.status) ?? 0;
    const count = referrals.filter(r => {
      const idx = stepIndex.get(r.status as ReferralStatusValue);
      return idx !== undefined && idx >= target;
    }).length;
    return {
      status: step.status,
      label: step.label,
      count,
      percentage: referrals.length === 0 ? 0 : Math.round((count / referrals.length) * 100),
    };
  });

  const closed = referrals.filter(r => r.status === REFERRAL_STATUS.CLOSED).length;

  const acceptTimes: number[] = [];
  const consultTimes: number[] = [];
  const closureTimes: number[] = [];
  for (const referral of referrals) {
    const list = (eventsByReferral.get(referral.id) ?? [])
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const at = (status: string) =>
      list.find(e => eventStatusOf(e) === status)?.timestamp ??
      (referral.status === status ? referral.updatedAt : undefined);

    const accepted = hoursBetween(referral.createdAt, at(REFERRAL_STATUS.ACCEPTED));
    if (accepted !== null) acceptTimes.push(accepted);
    const consulted = hoursBetween(referral.createdAt, at(REFERRAL_STATUS.CONSULTATION_COMPLETED));
    if (consulted !== null) consultTimes.push(consulted);
    const closedAt = at(REFERRAL_STATUS.CLOSED);
    const closedHours = hoursBetween(referral.createdAt, closedAt);
    if (closedHours !== null) closureTimes.push(closedHours);
  }

  return {
    total: referrals.length,
    byStatus,
    reached,
    closed,
    closureRate: referrals.length === 0 ? null : Math.round((closed / referrals.length) * 100),
    avgAcceptHours: mean(acceptTimes),
    avgConsultHours: mean(consultTimes),
    avgClosureHours: mean(closureTimes),
  };
}

const formatHours = (value: number | null): string => {
  if (value === null) return 'No data available';
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} hrs`;
  return `${(value / 24).toFixed(1)} days`;
};

const STAGE_TILES: { status: ReferralStatus; label: string }[] = [
  { status: 'created', label: 'Created' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'doctor_assigned', label: 'Doctor Assigned' },
  { status: 'scheduled', label: 'Awaiting Arrival' },
  { status: 'patient_arrived', label: 'Consultation Pending' },
  { status: 'treatment', label: 'Treatment In Progress' },
  { status: 'followup', label: 'Follow-up Pending' },
  { status: 'closed', label: 'Closed' },
];

/** Referral Closure Engine dashboard block (hospital / doctor / district views). */
export function ReferralClosureStats({
  referrals,
  events,
  title = 'Referral Closure Engine',
}: {
  referrals: Referral[];
  events: ReferralEvent[];
  title?: string;
}) {
  const stats = computeClosureStats(referrals, events);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats.total === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No data available — no referrals are visible to your account yet.
          </p>
        ) : (
          <>
            {/* Stage counts — computed, never hard-coded */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STAGE_TILES.map(tile => (
                <div key={tile.status} className="rounded-lg border border-border p-2.5">
                  <p className="text-lg font-bold text-foreground">{stats.byStatus[tile.status] ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">{tile.label}</p>
                </div>
              ))}
            </div>

            {/* Closure rate */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" /> Referral closure rate
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {stats.closureRate === null ? 'No data available' : `${stats.closureRate}%`}
                </span>
              </div>
              <Progress value={stats.closureRate ?? 0} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {stats.closed} of {stats.total} referrals closed
              </p>
            </div>

            {/* Timing — real event timestamps only */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Avg. time to acceptance
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{formatHours(stats.avgAcceptHours)}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" /> Avg. time to consultation
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{formatHours(stats.avgConsultHours)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" /> Avg. time to closure
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{formatHours(stats.avgClosureHours)}</p>
              </div>
            </div>

            {/* Funnel of stages ever reached */}
            <div className="space-y-1.5">
              {stats.reached.map(step => (
                <div key={step.status} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{step.label}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${step.percentage}%` }} />
                  </div>
                  <span className="text-xs font-medium text-foreground w-8 text-right">{step.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
