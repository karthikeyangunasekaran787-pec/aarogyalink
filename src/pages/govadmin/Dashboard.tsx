// ============================================================================
// District Administrator — Command Center with Live Computed Data
// ============================================================================

import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users, FileText, Clock, AlertTriangle, TrendingUp, Activity,
  Building2, MapPin, Lightbulb, CheckCircle2, Heart
} from 'lucide-react';

export default function GovDashboard() {
  const { language } = useApp();
  const {
    patients, referrals, followups, facilities, villageAccessScores,
    medicineStock, diagnostics,
    districtAnalytics: liveAnalytics, referralFunnel, aiInsights,
  } = useData();

  // Compute facility performance from actual referrals
  const facilityPerformance = useMemo(() => {
    return facilities.map(f => {
      const fReferrals = referrals.filter(r => r.destinationFacilityId === f.id);
      const closed = fReferrals.filter(r => r.status === 'closed').length;
      const closureRate = fReferrals.length > 0 ? Math.round((closed / fReferrals.length) * 100) : 0;
      return {
        facility: f.name,
        closureRate,
        avgWait: f.averageWaitTime,
        referrals: fReferrals.length,
        totalReferrals: fReferrals.length,
      };
    });
  }, [facilities, referrals]);

  // Compute monthly trends from actual referral dates
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
    // Show in chronological order
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    return monthOrder.filter(m => monthMap[m]).map(m => ({
      month: m,
      ...monthMap[m],
    }));
  }, [referrals, followups]);

  const maxMonthlyCreated = Math.max(...monthlyTrends.map(m => m.created), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'ta' ? 'மாவட்ட கட்டுப்பாட்டு மையம்' : language === 'hi' ? 'जिला कमांड सेंटर' : 'District Command Center'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Madurai District • {facilities.length} Facilities • {patients.length} Registered Patients
        </p>
      </div>

      {/* KPI Cards — all computed from live data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{patients.length}</p>
                <p className="text-xs text-muted-foreground">{t('patientsServed', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveAnalytics.totalReferrals}</p>
                <p className="text-xs text-muted-foreground">{t('totalReferrals', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveAnalytics.referralClosureRate}%</p>
                <p className="text-xs text-muted-foreground">{t('closureRate', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveAnalytics.averageWaitingTime.toFixed(1)}d</p>
                <p className="text-xs text-muted-foreground">{t('avgWaitTime', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second row of KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveAnalytics.facilitiesOperational}</p>
                <p className="text-xs text-muted-foreground">Active Facilities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveAnalytics.missedFollowups}</p>
                <p className="text-xs text-muted-foreground">Missed Follow-ups</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Heart className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveAnalytics.highRiskPending}</p>
                <p className="text-xs text-muted-foreground">High-Risk Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{liveAnalytics.specialistsOnDuty}</p>
                <p className="text-xs text-muted-foreground">Specialists On Duty</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Third row — availability KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Bed Occupancy</p>
                <p className="text-lg font-bold text-foreground">{liveAnalytics.occupiedBeds}/{liveAnalytics.totalBeds}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Medicines</p>
                <p className="text-lg font-bold text-foreground">{liveAnalytics.medicinesInStock} in stock</p>
              </div>
              <Badge variant="outline" className={`text-[10px] ${liveAnalytics.lowStockMedicines > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                {liveAnalytics.lowStockMedicines} shortages
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Diagnostics</p>
                <p className="text-lg font-bold text-foreground">{liveAnalytics.diagnosticsAvailable} available</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-teal-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">RHAS Score</p>
                <p className="text-lg font-bold text-foreground">{liveAnalytics.ruralAccessScore}/100</p>
              </div>
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                liveAnalytics.ruralAccessScore >= 70 ? 'bg-emerald-50' :
                liveAnalytics.ruralAccessScore >= 40 ? 'bg-amber-50' : 'bg-red-50'
              }`}>
                <MapPin className={`h-5 w-5 ${
                  liveAnalytics.ruralAccessScore >= 70 ? 'text-emerald-600' :
                  liveAnalytics.ruralAccessScore >= 40 ? 'text-amber-600' : 'text-red-600'
                }`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Referral Funnel (computed from actual data) ──────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('referralFunnel', language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {referralFunnel.map((stage) => (
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
              Monthly Referral Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthlyTrends.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
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
              Facility Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {facilityPerformance.map(f => (
              <div key={f.facility} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium text-foreground">{f.facility}</p>
                  <p className="text-xs text-muted-foreground">{f.referrals} referrals • {f.avgWait}m avg wait</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">{f.closureRate}%</p>
                  <p className="text-[10px] text-muted-foreground">closure rate</p>
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
              Village Healthcare Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {villageAccessScores.map(v => (
              <div key={v.villageId} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${
                    v.accessLevel === 'good' ? 'bg-emerald-500' :
                    v.accessLevel === 'moderate' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{v.villageName}</p>
                    <p className="text-xs text-muted-foreground">{v.distanceToFacility}km • Pop: {v.population.toLocaleString()}</p>
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

      {/* ── AI Insights ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-[1.125rem] w-[1.125rem] text-primary" />
            AI-Generated Operational Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiInsights.map(insight => (
            <div key={insight.id} className={`p-3 rounded-lg border ${
              insight.priority === 'high' ? 'border-red-200 bg-red-50/30' :
              insight.priority === 'medium' ? 'border-amber-200 bg-amber-50/30' :
              'border-border bg-muted/30'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                </div>
                {insight.metric && (
                  <Badge variant="outline" className="text-[10px] ml-2 flex-shrink-0">{insight.metric}</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
