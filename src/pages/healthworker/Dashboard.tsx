// ============================================================================
// Health Worker Dashboard — Functional Patient & Referral Management
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { Link } from 'react-router';
import {
  Users, AlertTriangle, FileText, Bell, UserPlus,
  Search, CheckCircle2, Activity, Wifi, WifiOff, Stethoscope
} from 'lucide-react';

export default function HWDashboard() {
  const { language } = useApp();
  const { patients, referrals, followups, healthWorkers } = useData();

  const hw = healthWorkers[0]; // Suganthi M
  const hwPatients = patients.filter(p => ['p1', 'p4', 'p6', 'p7', 'p9'].includes(p.id));
  const highRiskPatients = hwPatients.filter(p => p.chronicConditions && p.chronicConditions.length > 0);
  const pendingReferrals = referrals.filter(r => r.status === 'created' || r.status === 'accepted');
  const overdueFollowups = followups.filter(f => f.status === 'missed' || f.status === 'overdue');
  const dueFollowups = followups.filter(f => f.status === 'scheduled');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'overview' | 'patients' | 'referrals' | 'followups'>('overview');

  const filteredPatients = hwPatients.filter(p => {
    if (!searchQuery) return true;
    return p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.village.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Welcome'}, {hw.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === 'ta' ? 'சுகாதார பணியாளர் டாஷ்போர்டு' : language === 'hi' ? 'स्वास्थ्य कार्यकर्ता डैशबोर्ड' : 'Health Worker Dashboard'} • Area: {hw.area}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTab('patients')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{hwPatients.length}</p>
                <p className="text-xs text-muted-foreground">{t('todayPatients', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTab('patients')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{highRiskPatients.length}</p>
                <p className="text-xs text-muted-foreground">{t('highRiskCases', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTab('referrals')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingReferrals.length}</p>
                <p className="text-xs text-muted-foreground">{t('pendingReferrals', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTab('followups')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Bell className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{overdueFollowups.length}</p>
                <p className="text-xs text-muted-foreground">{t('missedFollowups', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/health-worker/register">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-foreground">{t('registerPatient', language)}</span>
            </CardContent>
          </Card>
        </Link>
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">AI Triage</span>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-foreground">{t('createReferral', language)}</span>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-foreground">Sync Status</span>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search patients by name or village..."
          className="pl-9"
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['overview', 'patients', 'referrals', 'followups'] as const).map(tab => (
          <Button
            key={tab}
            variant={selectedTab === tab ? 'default' : 'outline'}
            size="sm"
            className="text-xs whitespace-nowrap"
            onClick={() => setSelectedTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      {selectedTab === 'patients' && (
        <div className="space-y-3">
          {filteredPatients.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No patients found</CardContent></Card>
          ) : filteredPatients.map(p => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.age}y, {p.gender} • {p.village}, {p.district}</p>
                    {p.chronicConditions && p.chronicConditions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.chronicConditions.map(c => (
                          <Badge key={c} variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">{c}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{p.id.toUpperCase()}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedTab === 'referrals' && (
        <div className="space-y-3">
          {pendingReferrals.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No pending referrals</CardContent></Card>
          ) : pendingReferrals.map(ref => (
            <Card key={ref.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{ref.patientName}</p>
                    <p className="text-xs text-muted-foreground">{ref.referralId} • {ref.department}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">To: {ref.destinationFacilityName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={ref.priority} />
                    <Badge variant="outline" className="text-[10px] capitalize">{ref.status.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
                <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedTab === 'followups' && (
        <div className="space-y-3">
          {[...dueFollowups, ...overdueFollowups].length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No pending follow-ups</CardContent></Card>
          ) : [...dueFollowups, ...overdueFollowups].map(f => (
            <Card key={f.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{f.patientName}</p>
                    <p className="text-xs text-muted-foreground">{f.doctorName} • {f.facilityName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Date: {f.scheduledDate} at {f.scheduledTime}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Reason: {f.reason}</p>
                  </div>
                  <Badge className={`text-[10px] ${
                    f.status === 'missed' ? 'bg-red-50 text-red-700 border-red-200' :
                    f.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {f.status === 'missed' ? 'Missed' : f.status === 'scheduled' ? 'Due' : f.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedTab === 'overview' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="h-2 w-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Patient Murugan P triaged as EMERGENCY</p>
                  <p className="text-xs text-muted-foreground">2 hours ago • Cardiology referral created</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="h-2 w-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Patient Anitha V missed follow-up</p>
                  <p className="text-xs text-muted-foreground">Yesterday • Neurology follow-up overdue</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="h-2 w-2 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">New referral REF-2026-006 created for Kumar S</p>
                  <p className="text-xs text-muted-foreground">Today 8:00 AM • Urgent • Pulmonology</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
