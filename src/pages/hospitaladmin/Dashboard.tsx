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
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { ReferralClosureStats } from '@/components/shared/ReferralClosureStats';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { useReferralEngine } from '@/hooks/use-referral-engine';
import {
  Inbox, CheckCircle2, ScanLine, Package, XCircle, Trash2, Plus,
  Users, Building2, Clock, Calendar, Search, Stethoscope
} from 'lucide-react';

export default function HospitalAdminDashboard() {
  const { language, currentUser } = useApp();
  const {
    referrals, referralEvents, facilities, hospitals, medicineStock, diagnostics, doctors,
    acceptReferral, rejectReferral, scheduleReferral,
    addMedicineStock, removeMedicineStock
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

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  // Doctors who actually belong to THIS hospital (the engine re-checks this).
  const facilityDoctors = doctors.filter(d => d.facilityId === facility.id);

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

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Welcome'}, Hospital Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Building2 className="h-4 w-4" />
          {facility.name}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Inbox className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingReferrals.length}</p>
                <p className="text-xs text-muted-foreground">Pending Acceptance</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{closedReferrals.length}</p>
                <p className="text-xs text-muted-foreground">{t('closed', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{facilityMeds.filter(m => m.status !== 'out_of_stock').length}/{facilityMeds.length}</p>
                <p className="text-xs text-muted-foreground">{t('medicineStock', language)}</p>
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
                <p className="text-2xl font-bold text-foreground">{'specialistsAvailable' in facility ? facility.specialistsAvailable : 0}</p>
                <p className="text-xs text-muted-foreground">{t('specialists', language)} On Duty</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="referrals">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="referrals">{t('referralInbox', language)}</TabsTrigger>
          <TabsTrigger value="qr"><ScanLine className="h-4 w-4 mr-1" /> QR Scan</TabsTrigger>
          <TabsTrigger value="meds">{t('medicineStock', language)}</TabsTrigger>
          <TabsTrigger value="diags">{t('diagnosticAvail', language)}</TabsTrigger>
        </TabsList>

        {/* ── Referrals Tab ──────────────────────────────── */}
        <TabsContent value="referrals" className="mt-4 space-y-4">
          {/* Closure engine metrics for this hospital — computed from stored data */}
          <ReferralClosureStats referrals={facilityReferrals} events={referralEvents} />

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by patient, referral ID, or department..."
                className="pl-9"
              />
            </div>
          </div>

          {filteredReferrals.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No referrals found</CardContent></Card>
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
                          <Button size="sm" className="h-7 text-xs" disabled={busy === `schedule-${ref.id}`} onClick={() => handleSchedule(ref.id)}>Confirm</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSchedulingRef(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setSchedulingRef(ref.id)}>
                          <Clock className="h-3 w-3" /> Schedule Appointment
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
              <p className="text-sm font-medium text-foreground mb-1">QR Scan — Patient Arrival Verification</p>
              <p className="text-xs text-muted-foreground mb-6">Enter or scan the patient's referral ID to confirm arrival</p>
              <div className="flex items-center gap-2 max-w-md mx-auto">
                <Input
                  value={scannedRef}
                  onChange={(e) => setScannedRef(e.target.value)}
                  placeholder="Enter referral ID or health card (e.g. REF-PDK-0006)"
                  className="flex-1"
                />
                <Button onClick={handleConfirmArrival} disabled={!scannedRef || busy === 'qr'}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Verify Arrival
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
              <Plus className="h-3.5 w-3.5" /> Add Medicine
            </Button>
          </div>

          {/* Add Medicine Form */}
          {showMedForm && (
            <Card className="border-primary/20">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Medicine Name *</label>
                    <Input value={medForm.medicineName} onChange={e => setMedForm(f => ({ ...f, medicineName: e.target.value }))} placeholder="e.g. Paracetamol" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Quantity *</label>
                    <Input type="number" value={medForm.quantity} onChange={e => setMedForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Unit</label>
                    <select value={medForm.unit} onChange={e => setMedForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm">
                      <option value="tablets">Tablets</option>
                      <option value="capsules">Capsules</option>
                      <option value="ml">ml</option>
                      <option value="bottles">Bottles</option>
                      <option value="strips">Strips</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Expiry Date</label>
                    <Input type="date" value={medForm.expiryDate} onChange={e => setMedForm(f => ({ ...f, expiryDate: e.target.value }))} className="h-9 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowMedForm(false)}>Cancel</Button>
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
      </Tabs>

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
                <h3 className="text-sm font-semibold text-foreground">Remove Medicine</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <strong>{facilityMeds.find(m => m.id === confirmDeleteMed)?.medicineName}</strong> from inventory?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteMed(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => {
                const name = facilityMeds.find(m => m.id === confirmDeleteMed)?.medicineName;
                removeMedicineStock(confirmDeleteMed);
                setConfirmDeleteMed(null);
                setActionFeedback(`Medicine removed: ${name}`);
                setTimeout(() => setActionFeedback(null), 3000);
              }}>Remove</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
