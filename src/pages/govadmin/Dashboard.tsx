// ============================================================================
// Government / District Admin Command Center
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AIDisclaimer, AIInsightCard } from '@/components/shared/AIDisclaimer';
import {
  districtAnalytics, referralFunnel, villageAccessScores,
  aiInsights, monthlyReferralTrends, facilityPerformance, facilities, medicineStock
} from '@/lib/mock-data';
import {
  Users, FileText, Clock, AlertTriangle, TrendingUp, Download,
  MapPin, Brain
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

const COLORS = ['#0d9488', '#2563eb', '#7c3aed', '#ea580c', '#dc2626', '#059669', '#d97706'];

export default function GovDashboard() {
  const { language } = useApp();
  const analytics = districtAnalytics;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'ta' ? 'மாவட்ட கட்டுப்பாட்டு மையம்' :
             language === 'hi' ? 'जिला कमांड सेंटर' :
             'District Command Center'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Madurai District • Rural Healthcare Analytics
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 self-start">
          <Download className="h-4 w-4" />
          {t('downloadReport', language)}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{analytics.totalPatients.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{t('patientsServed', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{analytics.totalReferrals.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{t('totalReferrals', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{analytics.referralClosureRate}%</p>
                <p className="text-xs text-muted-foreground">{t('closureRate', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{analytics.averageWaitingTime}d</p>
                <p className="text-xs text-muted-foreground">{t('avgWaitTime', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-foreground">{analytics.missedFollowups}</p>
            <p className="text-xs text-muted-foreground">{t('missedFollowups', language)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-red-600">{analytics.highRiskPending}</p>
            <p className="text-xs text-muted-foreground">{t('highRiskCases', language)} Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-foreground">{analytics.ruralAccessScore}</p>
            <p className="text-xs text-muted-foreground">{t('ruralAccessScore', language)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-foreground">{analytics.facilitiesOperational}/{23}</p>
            <p className="text-xs text-muted-foreground">{t('facilityCapacity', language)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="funnel">{t('referralFunnel', language)}</TabsTrigger>
          <TabsTrigger value="villages">{t('villageMap', language)}</TabsTrigger>
          <TabsTrigger value="insights">{t('insights', language)}</TabsTrigger>
          <TabsTrigger value="facilities">{t('facilityCapacity', language)}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trends */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Referral Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyReferralTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="created" stroke="#0d9488" strokeWidth={2} name="Created" />
                    <Line type="monotone" dataKey="closed" stroke="#2563eb" strokeWidth={2} name="Closed" />
                    <Line type="monotone" dataKey="missed" stroke="#dc2626" strokeWidth={2} name="Missed" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Facility Performance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Facility Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={facilityPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="facility" tick={{ fontSize: 10 }} angle={-20} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="closureRate" fill="#0d9488" name="Closure Rate %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Resource Overview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resource Availability</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{analytics.occupiedBeds}/{analytics.totalBeds}</p>
                  <p className="text-xs text-muted-foreground">Beds Occupied</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{analytics.specialistsOnDuty}</p>
                  <p className="text-xs text-muted-foreground">Specialists On Duty</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{analytics.medicinesInStock}</p>
                  <p className="text-xs text-muted-foreground">Medicines In Stock</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{analytics.lowStockMedicines}</p>
                  <p className="text-xs text-muted-foreground">Low Stock Medicines</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funnel" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Referral Closure Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {referralFunnel.map((stage, idx) => (
                  <div key={stage.stage} className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-40 text-right">{stage.stage}</span>
                    <div className="flex-1 relative">
                      <div className="h-8 bg-muted rounded-lg overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all"
                          style={{
                            width: `${stage.percentage}%`,
                            backgroundColor: COLORS[idx % COLORS.length],
                            opacity: 0.85,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-foreground w-20 text-right">
                      {stage.count.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {stage.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="villages" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {t('villageMap', language)} — Rural Healthcare Access Scores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  {t('goodAccess', language)} (70+)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-amber-500" />
                  {t('moderateAccess', language)} (40-69)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  {t('underserved', language)} (&lt;40)
                </span>
              </div>

              <div className="space-y-2">
                {villageAccessScores
                  .sort((a, b) => a.overallScore - b.overallScore)
                  .map(v => (
                  <div key={v.villageId} className="flex items-center gap-4 p-3 rounded-lg border border-border">
                    <div className={`h-3 w-3 rounded-full flex-shrink-0 ${
                      v.accessLevel === 'good' ? 'bg-emerald-500' :
                      v.accessLevel === 'moderate' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{v.villageName}</p>
                        <span className="text-xs text-muted-foreground">Pop: {v.population.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">Distance: {v.distanceToFacility}km</span>
                        <span className="text-xs text-muted-foreground">Wait: {v.averageWaitTime}m</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        v.overallScore >= 70 ? 'text-emerald-600' :
                        v.overallScore >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}>{v.overallScore}</p>
                      <p className="text-[10px] text-muted-foreground">Score</p>
                    </div>
                    {/* Score breakdown bar */}
                    <div className="w-32 hidden sm:block">
                      <div className="grid grid-cols-5 gap-0.5 h-4">
                        {[v.facilityCapacity, v.specialistAvailability, v.diagnosticAvailability, v.medicineAvailability, 100 - v.averageWaitTime].map((val, i) => (
                          <div
                            key={i}
                            className="rounded-sm"
                            style={{
                              height: `${val}%`,
                              backgroundColor: val >= 60 ? '#059669' : val >= 40 ? '#d97706' : '#dc2626',
                              alignSelf: 'flex-end',
                              minHeight: '2px',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-600" />
                {t('insights', language)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiInsights.map(insight => (
                <AIInsightCard
                  key={insight.id}
                  title={insight.title}
                  content={insight.description}
                />
              ))}
              <AIDisclaimer />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facilities" className="mt-4 space-y-4">
          {facilities.map(f => {
            const fMeds = medicineStock.filter(m => m.facilityId === f.id);
            const lowStockCount = fMeds.filter(m => m.status === 'low_stock' || m.status === 'out_of_stock').length;
            return (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{f.name}</h4>
                      <p className="text-xs text-muted-foreground">{f.type.toUpperCase()} • {f.village}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{f.careMatchScore} CareMatch</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded bg-muted/50 p-2">
                      <p className="font-bold">{f.occupiedBeds}/{f.totalBeds}</p>
                      <p className="text-muted-foreground">Beds</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="font-bold">{f.specialistsAvailable}</p>
                      <p className="text-muted-foreground">Specialists</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="font-bold">{f.diagnosticsAvailable.length}</p>
                      <p className="text-muted-foreground">Diagnostics</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="font-bold">{f.medicinesAvailable.length}</p>
                      <p className="text-muted-foreground">Medicines</p>
                    </div>
                  </div>
                  {lowStockCount > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      {lowStockCount} medicine(s) low/out of stock
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
