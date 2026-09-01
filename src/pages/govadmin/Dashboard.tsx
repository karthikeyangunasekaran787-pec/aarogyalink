// ============================================================================
// District Administrator — Command Center with Live Data
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users, FileText, Clock, AlertTriangle, TrendingUp, Activity,
  Building2, MapPin, Lightbulb
} from 'lucide-react';

export default function GovDashboard() {
  const { language } = useApp();
  const {
    patients, referrals, followups, facilities, villageAccessScores,
    districtAnalytics, referralFunnel, aiInsights,
    monthlyReferralTrends, facilityPerformance
  } = useData();

  // Compute live KPIs from shared data
  const totalReferrals = referrals.length;
  const closedReferrals = referrals.filter(r => r.status === 'closed').length;
  const closureRate = totalReferrals > 0 ? Math.round((closedReferrals / totalReferrals) * 100) : 0;
  // active referrals computed inline below
  const overdueFollowups = followups.filter(f => f.status === 'missed' || f.status === 'overdue').length;
  const highRiskPending = referrals.filter(r => r.priority === 'emergency' && r.status !== 'closed').length;
  // low stock count computed from data


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

      {/* KPI Cards */}
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
                <p className="text-2xl font-bold text-foreground">{closureRate}%</p>
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
                <p className="text-2xl font-bold text-foreground">{districtAnalytics.averageWaitingTime}d</p>
                <p className="text-xs text-muted-foreground">{t('avgWaitTime', language)}</p>
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
                <p className="text-2xl font-bold text-foreground">{highRiskPending + overdueFollowups}</p>
                <p className="text-xs text-muted-foreground">Pending Attention</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Referral Funnel ──────────────────────────────── */}
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

        {/* ── Monthly Trends ───────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
              Monthly Referral Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthlyReferralTrends.map(m => (
                <div key={m.month} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-xs text-muted-foreground">{m.month}</span>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="h-4 bg-primary/20 rounded" style={{ width: `${(m.created / 400) * 100}%` }}>
                      <div className="h-full bg-primary rounded" style={{ width: `${(m.closed / m.created) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">{m.closed}/{m.created}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Facility Performance ─────────────────────────── */}
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

        {/* ── Village Access Map ───────────────────────────── */}
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
