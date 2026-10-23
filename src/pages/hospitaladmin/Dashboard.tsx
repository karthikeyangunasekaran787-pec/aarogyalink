// ============================================================================
// Hospital Admin Dashboard — Functional Referral Management
// ============================================================================

import { useState } from 'react';
import type { Facility } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatTile } from '@/components/shared/StatTile';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { ReferralClosureStats } from '@/components/shared/ReferralClosureStats';
import { OpenReferralTracker } from '@/components/shared/OpenReferralTracker';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { useReferralEngine } from '@/hooks/use-referral-engine';
// Arrival confirmation for appointments whose time has passed.
import { AwaitingConfirmationPanel } from '@/components/referrals/AwaitingConfirmationPanel';
import {
  Inbox, CheckCircle2, ScanLine, Package, XCircle, Trash2, Plus,
  Users, Building2, Clock, Calendar, Search, Stethoscope,
  MapPin, Phone, Mail, Bed, ShieldCheck, Edit3, Save, ChevronDown, AlertTriangle
} from 'lucide-react';

export default function HospitalAdminDashboard() {
  const { language, currentUser } = useApp();
  const {
    referrals, referralEvents, facilities, hospitals, medicineStock, diagnostics, doctors,
    acceptReferral, rejectReferral, scheduleReferral,
    addMedicineStock, removeMedicineStock,
    updateHospital, toggleHospitalStatus, removeHospital, addHospital
  } = useData();
  // Referral Closure Engine: doctor assignment + QR arrival verification are
  // validated against the stored record by the backend.
  const { assignDoctor, verifyArrivalByQr } = useReferralEngine();

  // Resolve the hospital from the logged-in user's facilityId — check both facilities and hospitals.
  // NEVER fall back to another hospital's record: the backend scopes this account to its own
  // hospital, so an unknown id only means the record has not synced yet. Show a neutral
  // placeholder instead of another hospital's data.
  const facility = facilities.find(f => f.id === currentUser?.facilityId)
    || hospitals.find(h => h.id === currentUser?.facilityId)
    || ({
      id: currentUser?.facilityId ?? '',
      name: currentUser?.facilityName || 'Your hospital',
    } as unknown as Facility);
  const facilityReferrals = referrals.filter(r => r.destinationFacilityId === facility.id);

  // Facility management state (hospital admin edits their own hospital).
  const [showFacilityForm, setShowFacilityForm] = useState(false);
  const [facilityForm, setFacilityForm] = useState({
    name: '', type: 'government' as const, address: '', village: '', district: '',
    state: '', phone: '', email: '', departments: '', services: '',
    totalBeds: 0, occupiedBeds: 0
  });
  const [facilityFormDirty, setFacilityFormDirty] = useState(false);
  const [confirmRemoveFacility, setConfirmRemoveFacility] = useState<string | null>(null);
  const [facilitySaveFeedback, setFacilitySaveFeedback] = useState<string | null>(null);
  const pendingReferrals = facilityReferrals.filter(r => r.status === 'created');
  const closedReferrals = facilityReferrals.filter(r => r.status === 'closed');
  const facilityMeds = medicineStock.filter(m => m.facilityId === facility.id);
  const facilityDiags = diagnostics.filter(d => d.facilityId === facility.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [schedulingRef, setSchedulingRef] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scannedRef, setScannedRef] = useState('');
  const [assigningDoctor, setAssigningDoctor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showMedForm, setShowMedForm] = useState(false);
  const [medForm, setMedForm] = useState({ medicineName: '', quantity: 0, unit: 'tablets', expiryDate: '' });
  const [confirmDeleteMed, setConfirmDeleteMed] = useState<string | null>(null);
  const [confirmToggleStatus, setConfirmToggleStatus] = useState<boolean>(false);

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const showFacilityFeedback = (msg: string) => {
    setFacilitySaveFeedback(msg);
    setTimeout(() => setFacilitySaveFeedback(null), 3000);
  };

  // Convert the editable facility form into the Hospital shape the data layer expects.
  function facilityFormToHospital(draft: typeof facilityForm, hospitalId: string): Omit<Hospital, 'id' | 'hospitalId' | 'createdAt'> {
    return {
      name: draft.name.trim(),
      type: draft.type,
      address: draft.address.trim(),
      village: draft.village.trim(),
      district: draft.district.trim(),
      state: draft.state.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      departments: departmentsList(draft.departments),
      services: servicesList(draft.services),
      totalBeds: Math.max(0, draft.totalBeds),
      occupiedBeds: Math.max(0, Math.min(draft.totalBeds, draft.occupiedBeds)),
      status: 'active',
    };
  }

  function departmentsList(raw: string): string[] {
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  function servicesList(raw: string): string[] {
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Doctors who actually belong to THIS hospital (the engine re-checks this).
  const facilityDoctors = doctors.filter(d => d.facilityId === facility.id);

  /** The hospital record this admin is allowed to edit. */
  const facilityHospital = hospitals.find(h => h.id === currentUser?.facilityId)
    ?? facilities.find(f => f.id === currentUser?.facilityId)
    ?? null;

  /** Staff accounts bound to this facility, so the admin can see who serves it. */
  const facilityAdmins = [
    ...(currentUser ? [currentUser] : []),
    ...doctors.filter(d => d.facilityId === facility.id),
  ];

  /** Persist a facility edit through the existing data-layer mutations. */
  async function handleSaveFacility() {
    if (!facilityHospital || !facilityFormDirty) return;
    await runStep('facility', async () => {
      const patch = facilityFormToHospital(facilityForm, facilityHospital.id);
      updateHospital(facilityHospital.id, patch);
      return { ok: true, message: t('facilitySaveSuccess', language) };
    });
    setFacilityFormDirty(false);
  }

  /**
   * Every workflow step reports the SERVER's verdict: the engine owns the state
   * machine, so an out-of-order click, a double click or an attempt on another
   * hospital's referral comes back as an explicit message instead of a silent
   * failure. Buttons are disabled while a step is in flight (no duplicates).
   */
  const runStep = async (key: string, action: () => Promise<{ ok: boolean; message: string }>, onSuccess?: () => void) => {
    if (busy) return;
    setBusy(key);
    try {
      const result = await action();
      showFeedback(result.message);
      if (result.ok) onSuccess?.();
    } finally {
      setBusy(null);
    }
  };

  const handleAccept = (refId: string) => runStep(`accept-${refId}`, () => acceptReferral(refId));

  const handleReject = (refId: string) => runStep(`reject-${refId}`, () => rejectReferral(refId));

  const handleAssignDoctor = (refId: string) => {
    const doctorId = assigningDoctor[refId];
    return runStep(`assign-${refId}`, () => assignDoctor(refId, doctorId), () => {
      setAssigningDoctor(prev => { const next = { ...prev }; delete next[refId]; return next; });
    });
  };

  const handleSchedule = (refId: string) => {
    if (!scheduleDate || !scheduleTime) return;
    return runStep(`schedule-${refId}`, () => scheduleReferral(refId, scheduleDate, scheduleTime), () => {
      setSchedulingRef(null);
      setScheduleDate('');
      setScheduleTime('');
    });
  };

  const handleConfirmArrival = () => runStep('qr', () => verifyArrivalByQr(scannedRef), () => setScannedRef(''));

  /** The referral in the scanned field, if it is one this hospital can see. */
  const scannedReferral = facilityReferrals.find(
    r => r.referralId === scannedRef.trim() || r.id === scannedRef.trim(),
  );

  const filteredReferrals = facilityReferrals.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.patientName.toLowerCase().includes(q) || r.referralId.toLowerCase().includes(q) || r.department.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {actionFeedback && (
        <div className="fixed top-20 right-6 z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm font-medium text-foreground animate-in fade-in slide-in-from-top-2">
          {actionFeedback}
        </div>
      )}

      <PageHeader
        icon={Building2}
        title={`${t('welcome', language)}, ${t('hospitalAdminLabel', language)}`}
        subtitle={facility.name}
      />

      {/* KPI Cards — equal-height tiles in one aligned row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Inbox}
          tone="blue"
          value={pendingReferrals.length}
          label={t('pendingAcceptance', language)}
        />
        <StatTile
          icon={CheckCircle2}
          tone="emerald"
          value={closedReferrals.length}
          label={t('closed', language)}
        />
        <StatTile
          icon={Package}
          tone="amber"
          value={`${facilityMeds.filter(m => m.status !== 'out_of_stock').length}/${facilityMeds.length}`}
          label={t('medicineStock', language)}
        />
        <StatTile
          icon={Users}
          tone="violet"
          value={'specialistsAvailable' in facility ? facility.specialistsAvailable : 0}
          label={`${t('specialists', language)} On Duty`}
        />
      </div>

      <Tabs defaultValue="referrals">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="referrals">{t('referralInbox', language)}</TabsTrigger>
          <TabsTrigger value="qr"><ScanLine className="h-4 w-4 mr-1" /> QR Scan</TabsTrigger>
          <TabsTrigger value="meds">{t('medicineStock', language)}</TabsTrigger>
          <TabsTrigger value="diags">{t('diagnosticAvail', language)}</TabsTrigger>
          <TabsTrigger value="facility-management"><Building2 className="h-4 w-4 mr-1" /> {t('facilityManagementTitle', language)}</TabsTrigger>
        </TabsList>

        {/* ── Referrals Tab ──────────────────────────────── */}
        <TabsContent value="referrals" className="mt-4 space-y-4">
          {/* Referrals whose expected time passed with no arrival recorded. They
              are UNCERTAIN, not missed: the desk records what actually
              happened (late arrival / did not attend / attended elsewhere). */}
          <AwaitingConfirmationPanel referrals={facilityReferrals} />

          {/* Closure engine metrics for this hospital — computed from stored data */}
          <ReferralClosureStats referrals={facilityReferrals} events={referralEvents} />

          {/* What this hospital owes next, one step per open referral */}
          <OpenReferralTracker referrals={facilityReferrals} events={referralEvents} />

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchReferralsPlaceholder', language)}
                className="pl-9"
              />
            </div>
          </div>

          {filteredReferrals.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{t('noReferralsFound', language)}</CardContent></Card>
          ) : filteredReferrals.map(ref => (
            <Card key={ref.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{ref.patientName}</p>
                      <PriorityBadge priority={ref.priority} />
                      <Badge variant="outline" className="text-[10px] capitalize">{ref.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ref.referralId} • {ref.department} • From: {ref.sourceFacilityName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ref.reason}</p>
                    {ref.appointmentDate && (
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {ref.appointmentDate} at {ref.appointmentTime}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons — one step of the closure engine at a time */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {ref.status === 'created' && (
                    <>
                      <Button size="sm" className="h-7 text-xs gap-1" disabled={busy === `accept-${ref.id}`} onClick={() => handleAccept(ref.id)}>
                        <CheckCircle2 className="h-3 w-3" /> Accept Referral
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" disabled={busy === `reject-${ref.id}`} onClick={() => handleReject(ref.id)}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </>
                  )}

                  {/* ACCEPTED → DOCTOR_ASSIGNED: only this hospital's doctors */}
                  {ref.status === 'accepted' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={assigningDoctor[ref.id] ?? ''}
                        onChange={e => setAssigningDoctor(prev => ({ ...prev, [ref.id]: e.target.value }))}
                        className="h-7 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="">
                          {facilityDoctors.length > 0 ? 'Assign doctor…' : 'No doctors at this hospital'}
                        </option>
                        {facilityDoctors.map(d => (
                          <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={!assigningDoctor[ref.id] || busy === `assign-${ref.id}`}
                        onClick={() => handleAssignDoctor(ref.id)}
                      >
                        <Stethoscope className="h-3 w-3" /> Assign Doctor
                      </Button>
                    </div>
                  )}

                  {/* DOCTOR_ASSIGNED → SCHEDULED */}
                  {ref.status === 'doctor_assigned' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {ref.doctorName && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Stethoscope className="h-3 w-3" /> {ref.doctorName}
                        </span>
                      )}
                      {schedulingRef === ref.id ? (
                        <div className="flex items-center gap-2">
                          <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="h-7 text-xs w-36" />
                          <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="h-7 text-xs w-24" />
                          <Button size="sm" className="h-7 text-xs" disabled={busy === `schedule-${ref.id}`} onClick={() => handleSchedule(ref.id)}>{t('confirm', language)}</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSchedulingRef(null)}>{t('cancel', language)}</Button>
                        </div>
                      ) : (
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setSchedulingRef(ref.id)}>
                          <Clock className="h-3 w-3" /> {t('scheduleAppointment', language)}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* SCHEDULED → ARRIVAL_VERIFIED (QR, verified by the backend) */}
                  {ref.status === 'scheduled' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      disabled={busy === 'qr'}
                      onClick={() => setScannedRef(ref.referralId)}
                    >
                      <ScanLine className="h-3 w-3" /> Verify Arrival (QR)
                    </Button>
                  )}

                  {(ref.status === 'patient_arrived' || ref.status === 'consultation') && (
                    <span className="text-xs text-muted-foreground">
                      Waiting for {ref.doctorName ?? 'the assigned doctor'} to complete the consultation.
                    </span>
                  )}
                  {ref.status === 'followup' && (
                    <span className="text-xs text-muted-foreground">
                      Follow-up scheduled for {ref.appointmentDate ?? 'the follow-up date'} — closes after the follow-up.
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── QR Scan Tab ────────────────────────────────── */}
        <TabsContent value="qr" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <ScanLine className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">{t('qrScanTitle', language)}</p>
              <p className="text-xs text-muted-foreground mb-6">{t('enterReferralIdHint', language)}</p>
              <div className="flex items-center gap-2 max-w-md mx-auto">
                <Input
                  value={scannedRef}
                  onChange={(e) => setScannedRef(e.target.value)}
                  placeholder={t('referralIdPlaceholder', language)}
                  className="flex-1"
                />
                <Button onClick={handleConfirmArrival} disabled={!scannedRef || busy === 'qr'}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> {t('verifyArrival', language)}
                </Button>
              </div>
              {/* The engine reports WHY a code was refused: another hospital's
                  referral, an arrival that was already verified, or one that
                  is not scheduled yet. */}
              {scannedRef && (
                <p className="text-xs text-muted-foreground mt-4 max-w-md mx-auto">
                  {scannedReferral
                    ? `${scannedReferral.patientName} • ${scannedReferral.referralId} • ${scannedReferral.status.replace(/_/g, ' ')}`
                    : 'Checking this code against your hospital\u2019s referrals…'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Medicine Stock Tab ─────────────────────────── */}
        <TabsContent value="meds" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setShowMedForm(true)}>
              <Plus className="h-3.5 w-3.5" /> {t('addMedicine', language)}
            </Button>
          </div>

          {/* Add Medicine Form */}
          {showMedForm && (
            <Card className="border-primary/20">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t('medicineNameLabel', language)} *</label>
                    <Input value={medForm.medicineName} onChange={e => setMedForm(f => ({ ...f, medicineName: e.target.value }))} placeholder="e.g. Paracetamol" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t('quantityLabel', language)} *</label>
                    <Input type="number" value={medForm.quantity} onChange={e => setMedForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t('unitLabel', language)}</label>
                    <select value={medForm.unit} onChange={e => setMedForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm">
                      <option value="tablets">{t('tablets', language)}</option>
                      <option value="capsules">{t('capsules', language)}</option>
                      <option value="ml">ml</option>
                      <option value="bottles">{t('bottles', language)}</option>
                      <option value="strips">{t('strips', language)}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t('expiryDate', language)}</label>
                    <Input type="date" value={medForm.expiryDate} onChange={e => setMedForm(f => ({ ...f, expiryDate: e.target.value }))} className="h-9 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowMedForm(false)}>{t('cancel', language)}</Button>
                  <Button size="sm" disabled={!medForm.medicineName || medForm.quantity <= 0} onClick={() => {
                    const status = medForm.quantity === 0 ? 'out_of_stock' : medForm.quantity < 50 ? 'low_stock' : 'in_stock';
                    addMedicineStock({
                      medicineId: `med-${Date.now()}`,
                      medicineName: medForm.medicineName,
                      facilityId: facility.id,
                      facilityName: facility.name,
                      quantity: medForm.quantity,
                      unit: medForm.unit,
                      expiryDate: medForm.expiryDate || '2027-12-31',
                      status,
                    });
                    setMedForm({ medicineName: '', quantity: 0, unit: 'tablets', expiryDate: '' });
                    setShowMedForm(false);
                    setActionFeedback('Medicine added successfully');
                    setTimeout(() => setActionFeedback(null), 3000);
                  }}>Add</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {facilityMeds.map(ms => (
            <Card key={ms.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{ms.medicineName}</p>
                  <p className="text-xs text-muted-foreground">Expires: {ms.expiryDate}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{ms.quantity} {ms.unit}</p>
                    <Badge className={`text-[10px] ${
                      ms.status === 'in_stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      ms.status === 'low_stock' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {ms.status === 'in_stock' ? 'In Stock' : ms.status === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmDeleteMed(ms.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Diagnostics Tab ────────────────────────────── */}
        <TabsContent value="diags" className="mt-4 space-y-3">
          {facilityDiags.map(d => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.category} • ₹{d.cost}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{d.waitTime}d wait</span>
                  <Badge className={`text-[10px] ${
                    d.available ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {d.available ? 'Available' : 'Unavailable'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Facility Management Tab ─────────────────────────── */}
        <TabsContent value="facility-management" className="mt-4 space-y-4">
          {facilitySaveFeedback && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{facilitySaveFeedback}</span>
            </div>
          )}

          {/* Facility profile editor */}
          <Card className="border-primary/20">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {t('facilityDetailsLabel', language)}
                  </h3>
                  <p className="text-xs text-muted-foreground">{t('facilityManagementSubtitle', language)}</p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => { populateFacilityForm(); setShowFacilityForm(true); setFacilityFormDirty(false); }}>
                  <Edit3 className="h-3.5 w-3.5" /> {t('facilityManagementTitle', language)}
                </Button>
              </div>

              {showFacilityForm && (
                <FacilityForm
                  hospital={facilityHospital}
                  form={facilityForm}
                  dirty={facilityFormDirty}
                  onUpdate={updated => { setFacilityForm(updated); setFacilityFormDirty(true); }}
                  onCancel={() => setShowFacilityForm(false)}
                  onSave={() => handleSaveFacility()}
                  saving={busy === 'facility'}
                  submitLabel={t('facilitySave', language)}
                  language={language}
                  t={t}
                />
              )}

              {!showFacilityForm && facilityHospital && (
                <FacilityReadonlyCard
                  hospital={facilityHospital}
                  t={t}
                  language={language}
                />
              )}
            </CardContent>
          </Card>

          {/* Status + danger zone */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('facilityStatusLabel', language)}</p>
                    <p className="text-sm font-semibold text-foreground mt-1">{facilityHospital?.status === 'active' ? t('facilityApprovedLabel', language) : t('facilitySuspendedLabel', language)}</p>
                  </div>
                  {facilityHospital && (
                    <Button
                      size="sm"
                      variant={facilityHospital.status === 'active' ? 'outline' : 'default'}
                      className="gap-1.5"
                      onClick={() => { setConfirmToggleStatus(true); setShowFacilityForm(true); populateFacilityForm(); }}
                    >
                      {facilityHospital.status === 'active' ? t('pause', language) : t('resume', language)}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">{t('facilityStatusHint', language)}</p>
              </CardContent>
            </Card>

            <Card className="border-red-200/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('remove', language)}</p>
                      <p className="text-sm font-semibold text-foreground mt-1">{t('facilityRemoveConfirm', language)}</p>
                    </div>
                  </div>
                  {facilityHospital && (
                    <Button size="sm" variant="destructive" onClick={() => setConfirmRemoveFacility(facilityHospital.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('facilityRemove', language)}
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">{t('facilityRemoveHint', language)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Hospital admins serving this facility */}
          {facilityHospital && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t('staffManagement', language)} — {facilityHospital.name}</h3>
                {facilityAdmins.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('noDistrictAdminAssigned', language)}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {facilityAdmins.map(user => (
                      <li key={user.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{user.name}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{user.role}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Facility form modal */}
      {showFacilityForm && facilityHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowFacilityForm(false)} />
          <div className="relative bg-background rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                {t('facilityManagementTitle', language)}
              </h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowFacilityForm(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>

            <FacilityForm
              hospital={facilityHospital}
              form={facilityForm}
              dirty={facilityFormDirty}
              onUpdate={updated => { setFacilityForm(updated); setFacilityFormDirty(true); }}
              onCancel={() => setShowFacilityForm(false)}
              onSave={() => handleSaveFacility()}
              saving={busy === 'facility'}
              submitLabel={t('facilitySave', language)}
              language={language}
              t={t}
            />
          </div>
        </div>
      )}

      {/* Remove facility confirmation */}
      {confirmRemoveFacility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmRemoveFacility(null)} />
          <div className="relative bg-background rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('facilityRemoveConfirm', language)}</h3>
                <p className="text-xs text-muted-foreground">{t('facilityRemoveHint', language)}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmRemoveFacility(null)}>{t('cancel', language)}</Button>
              <Button variant="destructive" className="flex-1" onClick={() => {
                removeHospital(confirmRemoveFacility);
                setConfirmRemoveFacility(null);
                showFeedback(t('facilityRemoved', language));
              }}>{t('facilityRemove', language)}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Medicine Confirmation */}
      {confirmDeleteMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDeleteMed(null)} />
          <div className="relative bg-background rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('removeMedicine', language)}</h3>
                <p className="text-xs text-muted-foreground">{t('cannotBeUndone', language)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <strong>{facilityMeds.find(m => m.id === confirmDeleteMed)?.medicineName}</strong> from inventory?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteMed(null)}>{t('cancel', language)}</Button>
              <Button variant="destructive" className="flex-1" onClick={() => {
                const name = facilityMeds.find(m => m.id === confirmDeleteMed)?.medicineName;
                removeMedicineStock(confirmDeleteMed);
                setConfirmDeleteMed(null);
                setActionFeedback(`Medicine removed: ${name}`);
                setTimeout(() => setActionFeedback(null), 3000);
              }}>{t('remove', language)}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A compact, editable facility form aligned with the existing host form patterns. */
function FacilityForm({
  form, dirty, onUpdate, onCancel, onSave, saving, submitLabel, language,
}: {
  form: typeof facilityForm;
  dirty: boolean;
  onUpdate: (updated: typeof facilityForm) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  submitLabel: string;
  language: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityNameLabel', language)} *</label>
          <Input value={form.name} onChange={e => onUpdate({ ...form, name: e.target.value })} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityTypeLabel', language)}</label>
          <select value={form.type} onChange={e => onUpdate({ ...form, type: e.target.value as typeof form.type })}
            className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm">
            <option value="government">{t('facilityTypeHospital', language)}</option>
            <option value="private">{t('facilityTypePrivate', language)}</option>
            <option value="trust">{t('facilityTypeTrust', language)}</option>
            <option value="charitable">{t('facilityTypeCharitable', language)}</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityAddressLabel', language)}</label>
          <Input value={form.address} onChange={e => onUpdate({ ...form, address: e.target.value })} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityVillageLabel', language)}</label>
          <Input value={form.village} onChange={e => onUpdate({ ...form, village: e.target.value })} className="h-9 text-sm" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityDistrictLabel', language)}</label>
          <Input value={form.district} onChange={e => onUpdate({ ...form, district: e.target.value })} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityStateLabel', language)}</label>
          <Input value={form.state} onChange={e => onUpdate({ ...form, state: e.target.value })} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityPhoneLabel', language)}</label>
          <Input value={form.phone} onChange={e => onUpdate({ ...form, phone: e.target.value })} className="h-9 text-sm" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityEmailLabel', language)}</label>
          <Input type="email" value={form.email} onChange={e => onUpdate({ ...form, email: e.target.value })} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityTotalBedsLabel', language)}</label>
          <Input type="number" min={0} value={form.totalBeds} onChange={e => onUpdate({ ...form, totalBeds: parseInt(e.target.value) || 0 })} className="h-9 text-sm" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityOccupiedBedsLabel', language)}</label>
          <Input type="number" min={0} value={form.occupiedBeds} onChange={e => onUpdate({ ...form, occupiedBeds: parseInt(e.target.value) || 0 })} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">{t('facilityDepartmentLabel', language)}</label>
          <Input value={form.departments} onChange={e => onUpdate({ ...form, departments: e.target.value })} placeholder="e.g. Medicine, Pediatrics" className="h-9 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">{t('facilityServicesLabel', language)}</label>
        <Input value={form.services} onChange={e => onUpdate({ ...form, services: e.target.value })} placeholder="e.g. Emergency, In-patient" className="h-9 text-sm" />
        <p className="text-[10px] text-muted-foreground">{t('facilityStatusHint', language)}</p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>{t('cancel', language)}</Button>
        <Button size="sm" disabled={!dirty || saving} onClick={onSave}>
          {saving ? <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** A read-only summary card for the facility profile. */
function FacilityReadonlyCard({
  hospital, language,
}: {
  hospital: {
    id: string;
    name: string | null | undefined;
    type: string;
    address: string | null | undefined;
    village: string | null | undefined;
    district: string | null | undefined;
    state: string | null | undefined;
    phone: string | null | undefined;
    email: string | null | undefined;
    totalBeds: number;
    occupiedBeds: number;
    departments: string[];
    services: string[];
  };
  language: string;
}) {
  const nameLabel = t('facilityNameLabel', language);
  const typeLabel = t('facilityTypeLabel', language);
  const addressLabel = t('facilityAddressLabel', language);
  const phoneLabel = t('facilityPhoneLabel', language);
  const emailLabel = t('facilityEmailLabel', language);
  const totalBedsLabel = t('facilityTotalBedsLabel', language);
  const occupiedBedsLabel = t('facilityOccupiedBedsLabel', language);
  const departmentLabel = t('facilityDepartmentLabel', language);
  const servicesLabel = t('facilityServicesLabel', language);
  const notProvided = t('notProvided', language);

  const typeKey = `facilityType${hospital.type.charAt(0).toUpperCase() + hospital.type.slice(1)}`;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs text-muted-foreground">{nameLabel}</p>
        <p className="text-sm font-semibold text-foreground">{hospital.name}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{typeLabel}</p>
        <p className="text-sm text-foreground">{t(typeKey, language)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{addressLabel}</p>
        <p className="text-sm text-foreground">{[hospital.address, hospital.village, hospital.district, hospital.state].filter(Boolean).join(', ') || notProvided}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{phoneLabel}</p>
        <p className="text-sm text-foreground">{hospital.phone || notProvided}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{emailLabel}</p>
        <p className="text-sm text-foreground">{hospital.email || notProvided}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{totalBedsLabel}</p>
        <p className="text-sm text-foreground">{hospital.totalBeds} · {hospital.occupiedBeds} {occupiedBedsLabel.toLowerCase()}</p>
      </div>
      {hospital.departments.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">{departmentLabel}</p>
          <p className="text-sm text-foreground">{hospital.departments.join(', ')}</p>
        </div>
      )}
      {hospital.services.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">{servicesLabel}</p>
          <p className="text-sm text-foreground">{hospital.services.join(', ')}</p>
        </div>
      )}
    </div>
  );
}

