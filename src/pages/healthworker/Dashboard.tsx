// ============================================================================
// Health Worker Dashboard — Functional Patient & Referral Management
// ============================================================================

import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
import type { HealthWorker, Referral, ReferralEvent, ReferralStatus } from '@/types';
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
  Search, Activity, Stethoscope, PenLine, ChevronRight,
  Clock, CheckCircle2, XCircle, Eye, X, MapPin, Calendar
} from 'lucide-react';

const REFERRAL_STEPS = [
  { key: 'created', label: 'Created', icon: FileText },
  { key: 'accepted', label: 'Accepted', icon: CheckCircle2 },
  { key: 'scheduled', label: 'Scheduled', icon: Calendar },
  { key: 'patient_arrived', label: 'Patient Arrived', icon: Users },
  { key: 'consultation', label: 'Consultation', icon: Stethoscope },
  { key: 'treatment', label: 'Treatment', icon: Activity },
  { key: 'followup', label: 'Follow-up', icon: Clock },
  { key: 'closed', label: 'Closed', icon: CheckCircle2 },
];

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  scheduled: 'bg-violet-50 text-violet-700 border-violet-200',
  patient_arrived: 'bg-amber-50 text-amber-700 border-amber-200',
  consultation: 'bg-orange-50 text-orange-700 border-orange-200',
  treatment: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  followup: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function HWDashboard() {
  const { language, currentUser } = useApp();
  const { patients, referrals, followups, healthWorkers, facilities, createReferral, addNotification, getReferralEvents } = useData();
  const navigate = useNavigate();

  // Load health workers from context or localStorage as fallback
  const allHealthWorkers = (() => {
    if (healthWorkers.length > 0) return healthWorkers;
    try {
      const stored = localStorage.getItem('aal_healthWorkers');
      if (stored) {
        const parsed = JSON.parse(stored) as HealthWorker[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  })();

  // Find HW record — primary: match by userId; fallback: match by name
  let hw = allHealthWorkers.find(h => h.userId === currentUser?.id);

  if (!hw && currentUser?.name) {
    hw = allHealthWorkers.find(h =>
      h.name.toLowerCase() === currentUser.name.toLowerCase()
    );
  }

  // If no health worker record found, show a message
  if (!hw) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Stethoscope className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">No Health Worker Record Found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Your account ({currentUser?.id || 'unknown'}) has no matching health worker profile.
            HW records found: {allHealthWorkers.length}.
            Please contact your Hospital Administrator to create your health worker record via Staff Management.
          </p>
        </div>
      </div>
    );
  }

  // Hospital isolation: show only patients and referrals from this HW's hospital
  const hwHospitalId = hw.facilityId;
  const hwPatients = patients.filter(p => {
    // Patients registered by this HW or at this facility
    return true; // For now show all patients the HW has access to (filtered by registration context)
  });
  const highRiskPatients = hwPatients.filter(p => p.chronicConditions && p.chronicConditions.length > 0);
  const pendingReferrals = referrals.filter(r => (r.status === 'created' || r.status === 'accepted') && r.sourceFacilityId === hwHospitalId);
  const overdueFollowups = followups.filter(f => (f.status === 'missed' || f.status === 'overdue') && f.facilityName === (facilities.find(fac => fac.id === hwHospitalId)?.name || ''));
  const dueFollowups = followups.filter(f => f.status === 'scheduled' && f.facilityName === (facilities.find(fac => fac.id === hwHospitalId)?.name || ''));
  const closedReferrals = referrals.filter(r => r.status === 'closed' && (r.sourceFacilityId === hwHospitalId || r.destinationFacilityId === hwHospitalId));

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

  // Referrals this HW created (from their hospital)
  const myReferrals = useMemo(() =>
    referrals.filter(r => r.sourceFacilityId === hwHospitalId),
    [referrals, hwHospitalId]
  );
  const activeMyReferrals = myReferrals.filter(r => r.status !== 'closed');
  const completedMyReferrals = myReferrals.filter(r => r.status === 'closed');

  // Selected referral for monitoring detail
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);
  const selectedReferral = selectedReferralId ? myReferrals.find(r => r.id === selectedReferralId) : null;
  const selectedReferralEvents = selectedReferral ? getReferralEvents(selectedReferral.id) : [];

  // Referral monitoring filter
  const [referralFilter, setReferralFilter] = useState<'all' | 'active' | 'completed'>('all');
  const filteredReferrals = referralFilter === 'all' ? myReferrals
    : referralFilter === 'active' ? activeMyReferrals
    : completedMyReferrals;

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
        <div className="space-y-4">
          {/* Referral Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setReferralFilter('all')}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-foreground">{myReferrals.length}</p>
                <p className="text-[10px] text-muted-foreground">Total Referrals</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setReferralFilter('active')}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-amber-600">{activeMyReferrals.length}</p>
                <p className="text-[10px] text-muted-foreground">In Progress</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setReferralFilter('completed')}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">{completedMyReferrals.length}</p>
                <p className="text-[10px] text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2">
            {(['all', 'active', 'completed'] as const).map(f => (
              <Button key={f} size="sm" variant={referralFilter === f ? 'default' : 'outline'} className="text-xs" onClick={() => setReferralFilter(f)}>
                {f === 'all' ? 'All' : f === 'active' ? 'In Progress' : 'Completed'}
              </Button>
            ))}
          </div>

          {/* Referral List */}
          {filteredReferrals.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No referrals found</CardContent></Card>
          ) : filteredReferrals.map(ref => (
            <Card key={ref.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedReferralId(ref.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{ref.patientName}</p>
                    <p className="text-xs text-muted-foreground">{ref.referralId} • {ref.department}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">To: {ref.destinationFacilityName}</p>
                    </div>
                    {ref.appointmentDate && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">{ref.appointmentDate} at {ref.appointmentTime}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <PriorityBadge priority={ref.priority} />
                    <Badge className={`text-[10px] ${STATUS_COLORS[ref.status] || ''}`}>\n                      {ref.status.replace(/_/g, ' ')}\n                    </Badge>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-0.5 mt-1">
                      <Eye className="h-3 w-3" /> Monitor
                    </Button>
                  </div>
                </div>
                <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Referral Monitoring Detail Modal ──────────────────── */}
      {selectedReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedReferralId(null)} />
          <div className="relative bg-background rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-base font-bold text-foreground">Referral Monitor</h3>
                <p className="text-xs text-muted-foreground">{selectedReferral.referralId}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedReferralId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Patient Info */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-semibold text-foreground">{selectedReferral.patientName}</p>
                <p className="text-xs text-muted-foreground">Priority: <PriorityBadge priority={selectedReferral.priority} /></p>
              </div>

              {/* Route */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Referral Route</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{selectedReferral.sourceFacilityName}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-primary">{selectedReferral.destinationFacilityName}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Department: {selectedReferral.department}</p>
                {selectedReferral.doctorName && (
                  <p className="text-xs text-muted-foreground">Doctor: {selectedReferral.doctorName}</p>
                )}
                {selectedReferral.appointmentDate && (
                  <p className="text-xs text-muted-foreground">Appointment: {selectedReferral.appointmentDate} at {selectedReferral.appointmentTime}</p>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${STATUS_COLORS[selectedReferral.status] || ''}`}>\n                  {selectedReferral.status.replace(/_/g, ' ')}\n                </Badge>
                {selectedReferral.isOverdue && (
                  <Badge className="text-xs bg-red-50 text-red-700 border-red-200">Overdue</Badge>
                )}
              </div>

              {/* Progress Bar */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Progress</p>
                <ReferralProgressMini currentStep={selectedReferral.currentStep} totalSteps={selectedReferral.totalSteps} isOverdue={selectedReferral.isOverdue} />
              </div>

              {/* Step Indicators */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Lifecycle Steps</p>
                <div className="space-y-1">
                  {REFERRAL_STEPS.map((step, idx) => {
                    const isCompleted = selectedReferral.currentStep > idx;
                    const isCurrent = selectedReferral.currentStep === idx + 1;
                    const isPending = selectedReferral.currentStep < idx + 1;
                    const Icon = step.icon;
                    const eventForStep = selectedReferralEvents.find(e => e.status === step.key as ReferralStatus);
                    return (
                      <div key={step.key} className={`flex items-center gap-3 p-2 rounded-lg ${
                        isCurrent ? 'bg-primary/5 border border-primary/20' : ''
                      }`}>
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCompleted ? 'bg-emerald-100 text-emerald-600' :
                          isCurrent ? 'bg-primary text-primary-foreground' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${isCompleted || isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>\n                            {step.label}
                          </p>
                          {eventForStep && (
                            <p className="text-[10px] text-muted-foreground truncate">{eventForStep.description}</p>
                          )}
                          {eventForStep && (
                            <p className="text-[10px] text-muted-foreground">{new Date(eventForStep.timestamp).toLocaleString()}</p>
                          )}
                        </div>
                        {isCurrent && (
                          <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20">Current</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline */}
              {selectedReferralEvents.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Timeline</p>
                  <div className="space-y-2">
                    {selectedReferralEvents.map(event => (
                      <div key={event.id} className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg">
                        <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground">{event.description}</p>
                          <p className="text-[10px] text-muted-foreground">by {event.performedBy} • {new Date(event.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <Button variant="outline" className="w-full" onClick={() => setSelectedReferralId(null)}>Close</Button>
            </div>
          </div>
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
          {/* Active Referrals Alert */}
          {activeMyReferrals.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-foreground">{activeMyReferrals.length} Active Referrals to Monitor</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">These referrals are in progress. Click any referral to monitor its full lifecycle.</p>
                <div className="space-y-2">
                  {activeMyReferrals.slice(0, 3).map(ref => (
                    <div key={ref.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-border cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedReferralId(ref.id); setSelectedTab('referrals'); }}>
                      <div>
                        <p className="text-xs font-medium text-foreground">{ref.patientName} → {ref.destinationFacilityName}</p>
                        <p className="text-[10px] text-muted-foreground">{ref.referralId} • {ref.department}</p>
                      </div>
                      <Badge className={`text-[9px] ${STATUS_COLORS[ref.status] || ''}`}>\n                        {ref.status.replace(/_/g, ' ')}\n                      </Badge>
                    </div>
                  ))}
                  {activeMyReferrals.length > 3 && (
                    <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => { setReferralFilter('active'); setSelectedTab('referrals'); }}>
                      View all {activeMyReferrals.length} active referrals →
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
                Recent Referral Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {myReferrals.slice(-5).reverse().map(ref => (
                <div key={ref.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedReferralId(ref.id); setSelectedTab('referrals'); }}>
                  <div className={`h-2 w-2 rounded-full mt-2 flex-shrink-0 ${
                    ref.priority === 'emergency' ? 'bg-red-500' :
                    ref.priority === 'urgent' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {ref.patientName} — {ref.referralId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ref.status.replace(/_/g, ' ')} • {ref.department} • To: {ref.destinationFacilityName}
                    </p>
                  </div>
                  <Badge className={`text-[9px] ${STATUS_COLORS[ref.status] || ''}`}>\n                    {ref.status.replace(/_/g, ' ')}\n                  </Badge>
                </div>
              ))}
              {myReferrals.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No referrals created yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


