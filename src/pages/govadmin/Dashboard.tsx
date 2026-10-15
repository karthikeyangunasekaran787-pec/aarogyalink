// ============================================================================
// District Administrator — Command Center with Live Computed Data
// ============================================================================

import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatTile } from '@/components/shared/StatTile';
import {
  Users, FileText, Clock, AlertTriangle, TrendingUp, Activity,
  Building2, MapPin, CheckCircle2, Heart, CalendarClock
} from 'lucide-react';
// The district's missed-referral metrics use the SAME formulas as the
// health-worker follow-up queue, computed from the stored records.
import { MISSED_REASONS, missedReferralMetrics, referralTouchesFacilities } from '@/lib/missed-referrals';
import { OpenReferralTracker } from '@/components/shared/OpenReferralTracker';
import { ReferralClosureStats } from '@/components/shared/ReferralClosureStats';
import type { TranslationKey } from '@/lib/i18n';

export default function GovDashboard() {
  const { currentUser } = useApp();
  const { t } = useTranslation();
  const districtId = currentUser?.districtId;
  const districtName = currentUser?.districtName;

  // This console covers exactly ONE district: the backend scopes the data it
  // hands over (convex/authz.ts) and `currentFacilities` is scoped to the
  // signed-in district administrator's district as well.
  const {
    patients, referrals, followups, currentFacilities, referralEvents,
    villageAccessScores, districtAnalytics: liveAnalytics, referralFunnel,
  } = useData();

  const scopedFacilities = currentFacilities;

  // Compute facility performance from actual referrals. Uses the dynamic
  // facility list so hospitals added by the District Administrator appear here.
  const facilityPerformance = useMemo(() => {
    return currentFacilities.map(f => {
      const fReferrals = referrals.filter(r => r.destinationFacilityId === f.id);
      const closed = fReferrals.filter(r => r.status === 'closed').length;
      const closureRate = fReferrals.length > 0 ? Math.round((closed / fReferrals.length) * 100) : 0;
      return {
        facility: f.name,
        closureRate,
        avgWait: f.averageWaitTime,
        referrals: fReferrals.length,
      };
    });
  }, [currentFacilities, referrals]);

  // Compute monthly trends from actual referral dates, in chronological order.
  const monthlyTrends = useMemo(() => {
    const monthMap: Record<string, { created: number; closed: number; missed: number }> = {};
    referrals.forEach(r => {
      const d = new Date(r.createdAt);
      const key = d.toLocaleString('en-US', { month: 'short' });
      if (!monthMap[key]) monthMap[key] = { created: 0, closed: 0, missed: 0 };
      monthMap[key].created++;
      if (r.status === 'closed') monthMap[key].closed++;
    });
    followups.forEach(f => {
      if (f.status === 'missed') {
        const d = new Date(f.createdAt);
        const key = d.toLocaleString('en-US', { month: 'short' });
        if (monthMap[key]) monthMap[key].missed++;
      }
    });
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthOrder.filter(m => monthMap[m]).map(m => ({
      month: m,
      ...monthMap[m],
    }));
  }, [referrals, followups]);

  const maxMonthlyCreated = Math.max(...monthlyTrends.map(m => m.created), 1);

  // Missed referrals and follow-up, computed from the district's actual records
  // (the same formulas the health-worker queue and the backend sweep use).
  // The referral set is restricted to this district's facilities, so a district
  // administrator can never be shown another district's patients — the same
  // rule the backend applies when it scopes the collection it hands over.
  const districtReferrals = useMemo(() => {
    const facilityIds = new Set(scopedFacilities.map(f => f.id));
    return referrals.filter(r => referralTouchesFacilities(r, facilityIds));
  }, [referrals, scopedFacilities]);

  const followupMetrics = useMemo(() => missedReferralMetrics(districtReferrals, new Date()), [districtReferrals]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title={t('districtCommandCenterTitle')}
        subtitle={`${districtName ? t('districtNameDisplay', { name: districtName }) : t('districtInfoPlaceholder')} • ${districtId || '—'} • ${scopedFacilities.length} ${t('facilitiesUnit')} • ${patients.length} ${t('registeredPatientsUnit')}`}
      />

      {/* KPI Cards — all computed from live data, one aligned 4-up grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} tone="blue" value={patients.length} label={t('patientsServed')} />
        <StatTile icon={FileText} tone="emerald" value={liveAnalytics.totalReferrals} label={t('totalReferrals')} />
        <StatTile icon={CheckCircle2} tone="primary" value={`${liveAnalytics.referralClosureRate}%`} label={t('closureRate')} />
        <StatTile icon={Clock} tone="amber" value={`${liveAnalytics.averageWaitingTime.toFixed(1)}d`} label={t('avgWaitTime')} />
        <StatTile icon={Building2} tone="emerald" value={liveAnalytics.facilitiesOperational} label={t('activeFacilities')} />
        <StatTile icon={AlertTriangle} tone="red" value={liveAnalytics.missedFollowups} label={t('missedFollowups')} />
        <StatTile icon={Heart} tone="red" value={liveAnalytics.highRiskPending} label={t('highRiskPending')} />
        <StatTile icon={Users} tone="violet" value={liveAnalytics.specialistsOnDuty} label={t('specialistsOnDuty')} />
      </div>

      {/* Third row — availability KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Activity}
          tone="blue"
          value={`${liveAnalytics.occupiedBeds}/${liveAnalytics.totalBeds}`}
          label={t('bedOccupancy')}
        />
        <StatTile
          icon={TrendingUp}
          tone="emerald"
          value={`${liveAnalytics.medicinesInStock} ${t('inStock')}`}
          label={t('medicines')}
          hint={`${liveAnalytics.lowStockMedicines} ${t('stockShortages')}`}
        />
        <StatTile
          icon={CheckCircle2}
          tone="primary"
          value={`${liveAnalytics.diagnosticsAvailable} ${t('unitsAvailable')}`}
          label={t('diagnostics')}
        />
        <StatTile
          icon={MapPin}
          tone={
            liveAnalytics.ruralAccessScore >= 70 ? 'emerald'
              : liveAnalytics.ruralAccessScore >= 40 ? 'amber' : 'red'
          }
          value={`${liveAnalytics.ruralAccessScore}/100`}
          label={t('rhasScore')}
        />
      </div>

      {/* ── Missed referrals & follow-up (computed from actual records) ──── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-[1.125rem] w-[1.125rem] text-amber-600" />
            {t('districtFollowupTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={Clock} tone="amber" value={followupMetrics.awaitingConfirmation} label={t('metricAwaitingConfirmation')} hint={t('awaitingConfirmationHint')} />
            <StatTile icon={AlertTriangle} tone="red" value={followupMetrics.overdue} label={t('metricOverdueReferrals')} />
            <StatTile icon={AlertTriangle} tone="red" value={followupMetrics.confirmedMissed} label={t('metricConfirmedMissed')} />
            <StatTile icon={Clock} tone="red" value={followupMetrics.unresolvedMissed} label={t('metricUnresolvedMissed')} />
            <StatTile icon={CheckCircle2} tone="emerald" value={followupMetrics.successfulFollowUps} label={t('metricSuccessfulFollowups')} />
            <StatTile icon={CalendarClock} tone="blue" value={followupMetrics.rescheduledAppointments} label={t('metricRescheduledAppointments')} />
            <StatTile
              icon={TrendingUp}
              tone="emerald"
              value={followupMetrics.completionRate === null ? t('metricNoData') : `${followupMetrics.completionRate}%`}
              label={t('metricCompletionRate')}
            />
            <StatTile
              icon={AlertTriangle}
              tone="amber"
              value={followupMetrics.missedReferralRate === null ? t('metricNoData') : `${followupMetrics.missedReferralRate}%`}
              label={t('metricMissedRate')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs font-medium text-foreground">{t('metricFollowupTime')}</p>
              <p className="text-lg font-bold text-foreground">
                {followupMetrics.avgFollowUpCompletionHours === null
                  ? t('metricNoData')
                  : t('hoursUnit', { count: followupMetrics.avgFollowUpCompletionHours })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {followupMetrics.medianFollowUpCompletionHours === null
                  ? t('metricNoData')
                  : `${followupMetrics.medianFollowUpCompletionHours} h (median)`}
              </p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs font-medium text-foreground">{t('reasonsTitle')}</p>
              {followupMetrics.reasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('metricNoData')}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {followupMetrics.reasons.map(entry => {
                    const spec = MISSED_REASONS.find(r => r.value === entry.reason);
                    return (
                      <li key={entry.reason} className="flex items-center justify-between text-xs text-foreground">
                        <span>{spec ? t(spec.key as TranslationKey) : entry.reason}</span>
                        <Badge variant="outline" className="text-[10px]">{entry.count}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {followupMetrics.breachedEscalations > 0 && (
            <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {followupMetrics.breachedEscalations} × {t('escalationBreached')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Closure engine: what the district still owes, and how fast it
              closes referrals. Both read the same district records. ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OpenReferralTracker referrals={districtReferrals} events={referralEvents} limit={8} />
        <ReferralClosureStats referrals={districtReferrals} events={referralEvents} title={t('referralClosureEngine')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Referral Funnel (computed from actual data) ──────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('referralFunnel')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {referralFunnel.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noDataAvailable')}</p>
            ) : referralFunnel.map((stage) => (
              <div key={stage.stage} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{stage.stage}</span>
                    <span className="text-xs text-muted-foreground">{stage.count} ({stage.percentage}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${stage.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Monthly Trends (computed from actual data) ────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('monthlyReferralTrends')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthlyTrends.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('noDataAvailable')}</p>
              ) : monthlyTrends.map(m => (
                <div key={m.month} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-xs text-muted-foreground">{m.month}</span>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="h-4 bg-primary/20 rounded" style={{ width: `${(m.created / maxMonthlyCreated) * 100}%` }}>
                      <div className="h-full bg-primary rounded" style={{ width: `${m.created > 0 ? (m.closed / m.created) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">{m.closed}/{m.created}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Facility Performance (computed from actual data) ──── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('facilityPerformance')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {facilityPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noDataAvailable')}</p>
            ) : facilityPerformance.map(f => (
              <div key={f.facility} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium text-foreground">{f.facility}</p>
                  <p className="text-xs text-muted-foreground">{f.referrals} {t('referralsUnit')} • {f.avgWait} {t('minAvgWait')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">{f.closureRate}%</p>
                  <p className="text-[10px] text-muted-foreground">{t('closureRateLabel')}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Village Access Map (from actual data) ───────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('villageHealthcareAccess')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {villageAccessScores.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noDataAvailable')}</p>
            ) : villageAccessScores.map(v => (
              <div key={v.villageId} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  {/* Access level is spelled out in the badge, never colour alone. */}
                  <div className={`h-3 w-3 rounded-full ${
                    v.accessLevel === 'good' ? 'bg-emerald-500' :
                    v.accessLevel === 'moderate' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{v.villageName}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.distanceToFacility}km • {t('populationLabel')}: {v.population.toLocaleString()}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${
                  v.accessLevel === 'good' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  v.accessLevel === 'moderate' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {v.overallScore}/100
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
