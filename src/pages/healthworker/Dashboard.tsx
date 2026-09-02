// ============================================================================
// Health Worker Dashboard — Functional Patient & Referral Management
// ============================================================================

import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import {
  Users, AlertTriangle, FileText, Bell, UserPlus,
  Search, Activity, Stethoscope, PenLine, ChevronRight
} from 'lucide-react';

export default function HWDashboard() {
  const { language } = useApp();
  const { patients, referrals, followups, healthWorkers, facilities, createReferral, addNotification } = useData();
  const navigate = useNavigate();

  const hw = healthWorkers[0]; // Suganthi M

  // Show ALL patients from shared data (not a hardcoded subset)
  const hwPatients = patients;
  const highRiskPatients = hwPatients.filter(p => p.chronicConditions && p.chronicConditions.length > 0);
  const pendingReferrals = referrals.filter(r => r.status === 'created' || r.status === 'accepted');
  const overdueFollowups = followups.filter(f => f.status === 'missed' || f.status === 'overdue');
  const dueFollowups = followups.filter(f => f.status === 'scheduled');
  const closedReferrals = referrals.filter(r => r.status === 'closed');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'overview' | 'patients' | 'referrals' | 'followups'>('overview');

  // Create Referral form state
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [referralPatientId, setReferralPatientId] = useState('');
  const [referralPriority, setReferralPriority] = useState<'routine' | 'urgent' | 'emergency'>('routine');
  const [referralReason, setReferralReason] = useState('');
  const [referralDestination, setReferralDestination] = useState('');
  const [referralDepartment, setReferralDepartment] = useState('');
  const [referralFeedback, setReferralFeedback] = useState<string | null>(null);

  const filteredPatients = hwPatients.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.village.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  const showFeedback = (msg: string) => {
    setReferralFeedback(msg);
    setTimeout(() => setReferralFeedback(null), 3000);
  };

  const handleCreateReferral = () => {
    const patient = patients.find(p => p.id === referralPatientId);
    const destination = facilities.find(f => f.id === referralDestination);
    if (!patient || !referralReason || !destination || !referralDepartment) {
      showFeedback('Please fill all required fields.');
      return;
    }

    createReferral({
      patientId: patient.id,
      patientName: patient.name,
      sourceFacilityId: hw.facilityId,
      sourceFacilityName: facilities.find(f => f.id === hw.facilityId)?.name || 'PHC',
      destinationFacilityId: destination.id,
      destinationFacilityName: destination.name,
      department: referralDepartment,
      priority: referralPriority,
      reason: referralReason,
      notes: `Referral created by Health Worker ${hw.name}`,
    });

    // Generate notification for the patient
    addNotification({
      userId: patient.userId,
      title: 'New Referral Created',
      message: `A ${referralPriority} referral has been created for you at ${destination.name} (${referralDepartment}).`,
      type: referralPriority === 'emergency' ? 'alert' : 'info',
      read: false,
    });

    // Reset form
    setShowReferralForm(false);
    setReferralPatientId('');
    setReferralPriority('routine');
    setReferralReason('');
    setReferralDestination('');
    setReferralDepartment('');
    setSelectedTab('referrals');
    showFeedback('Referral created successfully. The hospital admin will review it shortly.');
  };

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {referralFeedback && (
        <div className="fixed top-20 right-6 z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm font-medium text-foreground animate-in fade-in slide-in-from-top-2">
          {referralFeedback}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Welcome'}, {hw.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === 'ta' ? 'சுகாதார பணியாளர் டாஷ்போர்டு' : language === 'hi' ? 'स्वास्थ्य कार्यकर्ता डैशबोर्ड' : 'Health Worker Dashboard'} • Area: {hw.area}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTab('referrals')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Activity className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{closedReferrals.length}</p>
                <p className="text-xs text-muted-foreground">Completed Referrals</p>
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
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full" onClick={() => navigate('/patient/ai-triage')}>
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">AI Triage</span>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full" onClick={() => setShowReferralForm(true)}>
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-foreground">{t('createReferral', language)}</span>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full" onClick={() => setSelectedTab('followups')}>
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-foreground">Follow-ups</span>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search patients by name, village, or ID..."
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

      {/* Create Referral Form (inline) */}
      {showReferralForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" />
                Create New Referral
              </span>
              <Button variant="ghost" size="sm" onClick={() => setShowReferralForm(false)}>✕</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Patient *</label>
                <select
                  value={referralPatientId}
                  onChange={(e) => setReferralPatientId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select patient...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.id.toUpperCase()}) — {p.village}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Priority *</label>
                <div className="flex gap-2">
                  {(['routine', 'urgent', 'emergency'] as const).map(p => (
                    <Button
                      key={p}
                      type="button"
                      variant={referralPriority === p ? 'default' : 'outline'}
                      size="sm"
                      className={`flex-1 h-10 capitalize ${p === 'emergency' ? 'hover:bg-red-50 hover:text-red-600' : ''}`}
                      onClick={() => setReferralPriority(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Destination Facility *</label>
                <select
                  value={referralDestination}
                  onChange={(e) => setReferralDestination(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select facility...</option>
                  {facilities.filter(f => f.id !== hw.facilityId).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Department *</label>
                <Input
                  value={referralDepartment}
                  onChange={(e) => setReferralDepartment(e.target.value)}
                  placeholder="e.g. Cardiology, Orthopedics..."
                  className="h-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Reason for Referral *</label>
              <textarea
                value={referralReason}
                onChange={(e) => setReferralReason(e.target.value)}
                placeholder="Describe symptoms, findings, and reason for specialist referral..."
                className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleCreateReferral}
                disabled={!referralPatientId || !referralReason || !referralDestination || !referralDepartment}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" />
                Create Referral
              </Button>
              <Button variant="outline" onClick={() => setShowReferralForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                    {p.allergies && p.allergies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.allergies.map(a => (
                          <Badge key={a} variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">Allergy: {a}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-[10px]">{p.id.toUpperCase()}</Badge>
                    <Badge variant="outline" className="text-[10px]">{p.bloodGroup || '—'}</Badge>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setReferralPatientId(p.id);
                      setShowReferralForm(true);
                      setSelectedTab('overview');
                    }}
                  >
                    <FileText className="h-3 w-3" /> Refer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      navigate(`/patient/timeline`);
                    }}
                  >
                    View <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedTab === 'referrals' && (
        <div className="space-y-3">
          {referrals.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No referrals</CardContent></Card>
          ) : referrals.map(ref => (
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
              {referrals.slice(-5).reverse().map(ref => (
                <div key={ref.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <div className={`h-2 w-2 rounded-full mt-2 flex-shrink-0 ${
                    ref.priority === 'emergency' ? 'bg-red-500' :
                    ref.priority === 'urgent' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {ref.patientName} — {ref.referralId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ref.status.replace(/_/g, ' ')} • {ref.department} • To: {ref.destinationFacilityName}
                    </p>
                  </div>
                </div>
              ))}
              {referrals.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


