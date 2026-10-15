// ============================================================================
// AarogyaLink — Open Referral Tracker
// ----------------------------------------------------------------------------
// The shared "what happens next" list. Every open referral the signed-in role
// can see appears with the ONE step of the closure engine it is waiting for, who
// owes that step, and whether it is already overdue.
//
// The step, the owner and the deadline all come from src/lib/referral-next-action.ts
// (which reads the canonical workflow and the stored record), so this panel can
// never promise a step the backend would refuse, and two roles looking at the
// same referral see the same next step.
// ============================================================================

import { useMemo } from 'react';
import { Activity, AlertTriangle, ArrowRight, ListChecks } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { referralStatusLabel } from '@/convex/referralStatus';
import {
  openReferralSummary,
  openReferralTracker,
  type NextActionOwner,
  type OpenReferralRow,
} from '@/lib/referral-next-action';
import type { TranslationKey } from '@/lib/i18n';
import type { Referral, ReferralEvent } from '@/types';

/** Who owes the next step, as the reader sees it. */
const OWNER_KEYS: Record<NextActionOwner, TranslationKey> = {
  destination: 'colDestination',
  source: 'sourceFacility',
  assigned_doctor: 'doctor',
  either: 'eitherHospital',
};

const formatHours = (hours: number | null): string => {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
};

export function OpenReferralTracker({
  referrals,
  events,
  title,
  limit = 6,
}: {
  referrals: Referral[];
  events: ReferralEvent[];
  title?: string;
  limit?: number;
}) {
  const { t } = useTranslation();
  const now = useMemo(() => new Date(), []);
  const rows = useMemo(
    () => openReferralTracker(referrals, events, now, limit),
    [referrals, events, now, limit],
  );
  const summary = useMemo(() => openReferralSummary(rows, now), [rows, now]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-[1.125rem] w-[1.125rem] text-primary" />
          {title ?? t('openReferrals')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('noActiveReferrals')}</p>
        ) : (
          <>
            {/* Summary line — counts only, computed from the rows below. */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] gap-1">
                <Activity className="h-3 w-3" /> {rows.length} {t('openReferrals').toLowerCase()}
              </Badge>
              {summary.overdue > 0 && (
                <Badge className="text-[11px] gap-1 bg-red-50 text-red-700 border-red-200">
                  <AlertTriangle className="h-3 w-3" /> {summary.overdue} {t('overdue').toLowerCase()}
                </Badge>
              )}
              {summary.followupQueue > 0 && (
                <Badge className="text-[11px] gap-1 bg-amber-50 text-amber-700 border-amber-200">
                  {summary.followupQueue} {t('followupQueue')}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {rows.map(row => (
                <TrackerRow key={row.referral.id} row={row} />
              ))}
            </div>

            {summary.worstOverdueHours !== null && (
              <p className="text-[11px] text-muted-foreground">
                {t('overdue')}: {formatHours(summary.worstOverdueHours)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** One referral: where it is, what it waits for, who owes it. */
function TrackerRow({ row }: { row: OpenReferralRow }) {
  const { t } = useTranslation();
  const { referral, next } = row;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{referral.patientName}</p>
          <p className="text-[11px] text-muted-foreground">
            {referral.referralId} • {referral.destinationFacilityName} •{' '}
            {referralStatusLabel(referral.status)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={referral.priority} />
          {next.overdue && (
            <Badge className="text-[10px] bg-red-50 text-red-700 border-red-200">{t('overdue')}</Badge>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="flex items-center gap-1 font-medium text-foreground">
          {t('nextAction')} <ArrowRight className="h-3 w-3" /> {t(next.labelKey)}
        </span>
        <span className="text-muted-foreground">
          {t('waitingOn')}: {t(OWNER_KEYS[next.owner])}
        </span>
        {next.dueAt && (
          <span className={next.overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
            {next.dueAt.toISOString().slice(0, 10)}
          </span>
        )}
      </div>
    </div>
  );
}
