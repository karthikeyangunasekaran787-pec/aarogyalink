// ============================================================================
// AarogyaLink — Awaiting arrival confirmation (receiving hospital)
// ----------------------------------------------------------------------------
// The reception desk's work list: referrals whose expected appointment time has
// passed without an arrival being recorded.
//
// The wording and the actions both matter here. A missing hospital update is NOT
// evidence that the patient stayed away, so these referrals are presented as
// UNCERTAIN and the desk can record whichever of the three things happened:
//
//   • the patient arrived (late)      → arrival verified, care continues
//   • the patient did not attend      → confirmed missed, follow-up opens
//   • the patient attended elsewhere  → documented, closed with that outcome
//
// Confirming a missed visit requires a documented reason, and every action is
// written to the referral's audit trail with the caller's STORED identity by the
// backend engine — the UI never writes a status of its own.
// ============================================================================

import { useMemo, useState } from 'react';
import { AlertTriangle, Car, CheckCircle2, XCircle } from 'lucide-react';

import { useData } from '@/contexts/DataContext';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { MISSED_REASONS, followupQueue, type FollowupRow } from '@/lib/missed-referrals';
import type { MissedReason, Referral } from '@/types';
import type { TranslationKey } from '@/lib/i18n';

type Mode = 'confirm_missed' | 'elsewhere';

/**
 * One uncertain arrival. It is presented as UNCERTAIN on purpose: a hospital
 * that has not recorded anything is exactly what this panel exists for, and the
 * desk decides which of the three documented outcomes actually happened.
 */
export function ArrivalConfirmationRow({
  row,
  busy,
  onVerifyArrival,
  onConfirmMissed,
  onElsewhere,
}: {
  row: FollowupRow;
  busy: boolean;
  onVerifyArrival: () => void;
  onConfirmMissed: () => void;
  onElsewhere: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{row.referral.patientName}</p>
          <p className="text-xs text-muted-foreground">
            {t('colHealthCard')}: {row.referral.healthCardId ?? '—'} • {row.referral.referralId} •{' '}
            {row.referral.destinationFacilityName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={row.referral.priority} />
          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
            {t('awaitingConfirmation')}
          </Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('colAppointmentDate')}: {row.referral.appointmentDate ?? '—'} {row.referral.appointmentTime ?? ''} •{' '}
        {t('daysOverdueUnit', { count: row.daysOverdue })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-7 text-xs gap-1" disabled={busy} onClick={onVerifyArrival}>
          <CheckCircle2 className="h-3 w-3" /> {t('verifyArrival')}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onConfirmMissed}>
          <XCircle className="h-3 w-3" /> {t('confirmMissed')}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onElsewhere}>
          <Car className="h-3 w-3" /> {t('attendanceElsewhere')}
        </Button>
      </div>
    </div>
  );
}

export function AwaitingConfirmationPanel({ referrals }: { referrals: Referral[] }) {
  const { t } = useTranslation();
  const { confirmArrival, confirmMissedReferral, recordAttendanceElsewhere } = useData();

  const [open, setOpen] = useState<{ referralId: string; mode: Mode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reason, setReason] = useState<MissedReason | ''>('');
  const [notes, setNotes] = useState('');
  const [otherHospital, setOtherHospital] = useState('');
  const [attendedDate, setAttendedDate] = useState('');

  const rows = useMemo(
    () => followupQueue(referrals, new Date()).filter(row => row.state === 'awaiting_confirmation'),
    [referrals],
  );

  const reset = () => {
    setOpen(null);
    setReason('');
    setNotes('');
    setOtherHospital('');
    setAttendedDate('');
  };

  const finish = (message: string) => {
    setFeedback(message);
    reset();
    setTimeout(() => setFeedback(null), 5000);
  };

  const recordArrival = async (referralId: string) => {
    setBusy(true);
    const result = await confirmArrival(referralId);
    setBusy(false);
    finish(result.message);
  };

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    const result =
      open.mode === 'confirm_missed'
        ? await confirmMissedReferral(open.referralId, reason as MissedReason, notes)
        : await recordAttendanceElsewhere(open.referralId, otherHospital.trim(), attendedDate, notes);
    setBusy(false);
    finish(result.message);
  };

  const canSave =
    open?.mode === 'confirm_missed'
      ? reason !== ''
      : otherHospital.trim().length > 0 && attendedDate.length > 0;

  const selected = open ? rows.find(row => row.referral.id === open.referralId) ?? null : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {t('awaitingConfirmation')}
          <Badge variant="outline" className="text-[10px] ml-1">{rows.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{t('awaitingConfirmationHint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {feedback}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('missedReferralsEmpty')}</p>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <ArrivalConfirmationRow
                key={row.referral.id}
                row={row}
                busy={busy}
                onVerifyArrival={() => void recordArrival(row.referral.id)}
                onConfirmMissed={() => { reset(); setOpen({ referralId: row.referral.id, mode: 'confirm_missed' }); }}
                onElsewhere={() => { reset(); setOpen({ referralId: row.referral.id, mode: 'elsewhere' }); }}
              />
            ))}
          </div>
        )}

        {open && selected && (
          <Card className="border-primary/30 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t(open.mode === 'confirm_missed' ? 'confirmMissed' : 'attendanceElsewhere')} —{' '}
                {selected.referral.patientName} ({selected.referral.referralId})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {open.mode === 'confirm_missed' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="font-medium text-foreground">{t('missedReasonLabel')} *</span>
                    <select
                      value={reason}
                      onChange={e => setReason(e.target.value as MissedReason)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">—</option>
                      {MISSED_REASONS.map(r => (
                        <option key={r.value} value={r.value}>{t(r.key as TranslationKey)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium text-foreground">{t('followupNotes')}</span>
                    <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-10" />
                  </label>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-xs">
                    <span className="font-medium text-foreground">{t('otherHospitalLabel')} *</span>
                    <Input value={otherHospital} onChange={e => setOtherHospital(e.target.value)} className="h-10" />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium text-foreground">{t('attendedDateLabel')} *</span>
                    <Input type="date" value={attendedDate} onChange={e => setAttendedDate(e.target.value)} className="h-10" />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium text-foreground">{t('followupNotes')}</span>
                    <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-10" />
                  </label>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">{t('inAppOnlyHint')}</p>

              <div className="flex gap-3">
                <Button size="sm" disabled={!canSave || busy} onClick={() => void submit()}>
                  {busy ? '…' : t('saveFollowupAction')}
                </Button>
                <Button size="sm" variant="outline" onClick={reset}>{t('cancel')}</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
