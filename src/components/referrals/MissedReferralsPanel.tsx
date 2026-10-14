// ============================================================================
// AarogyaLink — Missed Referrals (follow-up queue)
// ----------------------------------------------------------------------------
// The health worker's view of patients who did not attend a referred hospital.
//
// Everything shown here is DERIVED from the stored referrals and their audit
// trail (see src/lib/missed-referrals.ts), so the same patient can never appear
// twice, the list survives a refresh, and another authorized device sees exactly
// the same queue. Nothing on this screen invents a patient response: the reason,
// the contact outcome and the closure are all recorded by the person using it,
// and every action goes through the backend engine, which re-checks the caller's
// scope and the referral's stored state.
//
// Notification honesty: the only notification capability used is the in-app
// audit record. AarogyaLink does not send SMS, WhatsApp or push messages.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, PhoneCall, XCircle } from 'lucide-react';

import { useData } from '@/contexts/DataContext';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { referralStatusKey } from '@/lib/referral-labels';
import {
  CONTACT_METHODS,
  ESCALATION_RULES,
  MISSED_CLOSURE_OUTCOMES,
  MISSED_REASONS,
  followupQueue,
  type FollowupRow,
} from '@/lib/missed-referrals';
import type { ContactMethod, MissedClosureOutcome, MissedReason, Referral } from '@/types';
import type { TranslationKey } from '@/lib/i18n';

/** The filters the follow-up queue offers. */
export type QueueFilter = 'overdue' | 'urgent' | 'emergency' | 'contacted' | 'rescheduled' | 'unresolved';

/** Which follow-up form is open. */
type FollowupMode = 'confirm_missed' | 'contact' | 'reschedule' | 'close' | 'elsewhere';

export function matchesQueueFilter(row: FollowupRow, filter: QueueFilter): boolean {
  switch (filter) {
    case 'urgent':
      return row.referral.priority === 'urgent';
    case 'emergency':
      return row.referral.priority === 'emergency';
    case 'contacted':
      return row.state === 'contacted';
    case 'rescheduled':
      return row.state === 'rescheduled';
    case 'unresolved':
      // A documented missed visit that has not been resolved yet. An uncertain
      // (unconfirmed) referral is NOT counted as missed.
      return row.state === 'missed' || row.state === 'contacted';
    case 'overdue':
    default:
      return true;
  }
}

const FILTER_OPTIONS: { value: QueueFilter; key: TranslationKey }[] = [
  { value: 'overdue', key: 'filterOverdue' },
  { value: 'urgent', key: 'filterUrgent' },
  { value: 'emergency', key: 'filterEmergency' },
  { value: 'contacted', key: 'filterContacted' },
  { value: 'rescheduled', key: 'filterRescheduled' },
  { value: 'unresolved', key: 'filterUnresolved' },
];

/** The state colour of one queue row. */
function stateTone(row: FollowupRow): string {
  if (row.state === 'awaiting_confirmation') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (row.state === 'missed') return 'bg-red-50 text-red-700 border-red-200';
  if (row.state === 'contacted') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function MissedReferralsPanel({ referrals }: { referrals: Referral[] }) {
  const { t } = useTranslation();
  const {
    confirmMissedReferral,
    logContactAttempt,
    recordContact,
    rescheduleReferral,
    closeMissedReferral,
    recordAttendanceElsewhere,
  } = useData();

  const [filter, setFilter] = useState<QueueFilter>('overdue');
  const [open, setOpen] = useState<{ referralId: string; mode: FollowupMode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Keep "days overdue" and the escalation windows honest without refetching.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => followupQueue(referrals, now), [referrals, now]);
  const visible = useMemo(() => rows.filter(row => matchesQueueFilter(row, filter)), [rows, filter]);

  const selected = open ? rows.find(row => row.referral.id === open.referralId) ?? null : null;

  const finish = useCallback((message: string) => {
    setFeedback(message);
    setOpen(null);
    setTimeout(() => setFeedback(null), 5000);
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {t('missedReferrals')}
          <Badge variant="outline" className="text-[10px] ml-1">{rows.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{t('missedReferralsSubtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <SegmentedControl
          ariaLabel={t('missedReferrals')}
          value={filter}
          onChange={value => setFilter(value as QueueFilter)}
          options={FILTER_OPTIONS.map(option => ({ value: option.value, label: t(option.key) }))}
        />

        {feedback && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {feedback}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('missedReferralsEmpty')}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(row => (
              <ReferralFollowupCard
                key={row.referral.id}
                row={row}
                onOpen={mode => setOpen({ referralId: row.referral.id, mode })}
              />
            ))}
          </div>
        )}

        {open && selected && (
          <FollowupForm
            row={selected}
            mode={open.mode}
            busy={busy}
            onCancel={() => setOpen(null)}
            onSubmit={async payload => {
              setBusy(true);
              const { mode } = open;
              const result =
                mode === 'confirm_missed'
                  ? await confirmMissedReferral(selected.referral.id, payload.reason as MissedReason, payload.notes)
                  : mode === 'reschedule'
                    ? await rescheduleReferral(selected.referral.id, payload.date, payload.time, payload.notes)
                    : mode === 'close'
                      ? await closeMissedReferral(
                          selected.referral.id,
                          payload.outcome as MissedClosureOutcome,
                          payload.notes ?? '',
                          payload.otherHospitalName,
                        )
                      : mode === 'elsewhere'
                        ? await recordAttendanceElsewhere(
                            selected.referral.id,
                            payload.otherHospitalName ?? '',
                            payload.attendedDate ?? '',
                            payload.notes,
                          )
                        : payload.reached
                          ? await recordContact(selected.referral.id, {
                              method: payload.method as ContactMethod,
                              reached: true,
                              actionTaken: payload.actionTaken,
                              nextFollowUpDate: payload.nextFollowUpDate,
                              notes: payload.notes,
                              contactAt: payload.contactAt,
                            })
                          : await logContactAttempt(selected.referral.id, {
                              method: payload.method as ContactMethod,
                              reached: false,
                              actionTaken: payload.actionTaken,
                              nextFollowUpDate: payload.nextFollowUpDate,
                              notes: payload.notes,
                              reason: payload.reason as MissedReason | undefined,
                              contactAt: payload.contactAt,
                            });
              setBusy(false);
              finish(result.message);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One patient in the queue: identity, referral, why they missed, what has been
 * tried, and what happens next. Only the information the follow-up needs is
 * shown — no clinical history, no diagnosis.
 */
export function ReferralFollowupCard({ row, onOpen }: { row: FollowupRow; onOpen: (mode: FollowupMode) => void }) {
  const { t } = useTranslation();
  const { referral } = row;
  const rule = ESCALATION_RULES[referral.priority] ?? ESCALATION_RULES.routine;
  const reason = MISSED_REASONS.find(r => r.value === row.reason);
  const method = CONTACT_METHODS.find(m => m.value === row.lastContactMethod);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{referral.patientName}</p>
          <p className="text-xs text-muted-foreground">
            {t('colHealthCard')}: {referral.healthCardId ?? '—'} • {referral.referralId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={referral.priority} />
          <Badge variant="outline" className={`text-[10px] ${stateTone(row)}`}>
            {t(referralStatusKey(referral.status))}
          </Badge>
        </div>
      </div>

      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
        <Field label={t('colDestination')} value={referral.destinationFacilityName} />
        <Field label={t('colAppointmentDate')} value={`${referral.appointmentDate ?? '—'} ${referral.appointmentTime ?? ''}`.trim()} />
        <Field
          label={t('colDaysOverdue')}
          value={row.daysOverdue > 0 ? t('daysOverdueUnit', { count: row.daysOverdue }) : t('notRecorded')}
        />
        <Field label={t('colReason')} value={reason ? t(reason.key as TranslationKey) : t('notRecorded')} />
        <Field
          label={t('colLastContact')}
          value={
            row.lastContactAt
              ? `${row.lastContactAt.slice(0, 16).replace('T', ' ')}${method ? ` • ${t(method.key as TranslationKey)}` : ''} • ${
                  row.lastContactReached ? t('answerYes') : t('answerNo')
                }`
              : t('noContactAttempt')
          }
        />
        <Field label={t('colNextFollowUp')} value={row.nextFollowUpDate ?? t('notRecorded')} />
      </div>

      {referral.missedAt && (
        <p className={`text-[11px] flex items-center gap-1.5 ${row.escalation?.breached ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
          <CalendarClock className="h-3.5 w-3.5" />
          {t(rule.key as TranslationKey, { hours: rule.contactWithinHours })}
          {row.escalation?.breached ? ` ${t('escalationBreached')}` : ` ${t('escalationWithin')}`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {row.state === 'awaiting_confirmation' && (
          <>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onOpen('confirm_missed')}>
              <XCircle className="h-3 w-3" /> {t('confirmMissed')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onOpen('contact')}>
              <PhoneCall className="h-3 w-3" /> {t('logContactAttempt')}
            </Button>
          </>
        )}
        {row.state === 'missed' && (
          <>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onOpen('contact')}>
              <PhoneCall className="h-3 w-3" /> {t('recordContact')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen('close')}>
              {t('closeMissedReferral')}
            </Button>
          </>
        )}
        {row.state === 'contacted' && (
          <>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onOpen('reschedule')}>
              <CalendarClock className="h-3 w-3" /> {t('rescheduleAppointment')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen('close')}>
              {t('closeMissedReferral')}
            </Button>
          </>
        )}
        {row.state === 'rescheduled' && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onOpen('contact')}>
            <PhoneCall className="h-3 w-3" /> {t('logContactAttempt')}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpen('elsewhere')}>
          {t('attendanceElsewhere')}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

interface FollowupPayload {
  reason?: string;
  outcome?: string;
  method?: string;
  reached: boolean;
  notes?: string;
  actionTaken?: string;
  nextFollowUpDate?: string;
  date: string;
  time: string;
  contactAt?: string;
  otherHospitalName?: string;
  attendedDate?: string;
}

const EMPTY_PAYLOAD: FollowupPayload = { reached: false, date: '', time: '' };

/** The follow-up record: exactly the fields the brief asks for, nothing inferred. */
export function FollowupForm({
  row,
  mode,
  busy,
  onCancel,
  onSubmit,
}: {
  row: FollowupRow;
  mode: FollowupMode;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: FollowupPayload) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<FollowupPayload>(EMPTY_PAYLOAD);
  const set = (patch: Partial<FollowupPayload>) => setPayload(prev => ({ ...prev, ...patch }));

  // Timezone-local default for "date and time of the contact".
  const defaultContactAt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const titles: Record<FollowupMode, TranslationKey> = {
    confirm_missed: 'confirmMissed',
    contact: 'recordFollowUp',
    reschedule: 'rescheduleAppointment',
    close: 'closeMissedReferral',
    elsewhere: 'attendanceElsewhere',
  };

  const canSave = (() => {
    if (mode === 'confirm_missed') return !!payload.reason;
    if (mode === 'contact') return !!payload.method;
    if (mode === 'reschedule') return !!payload.date && !!payload.time;
    if (mode === 'close') return !!payload.outcome && !!payload.notes?.trim();
    return !!payload.otherHospitalName?.trim() && !!payload.attendedDate;
  })();

  return (
    <Card className="border-primary/30 bg-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          {t(titles[mode])} — {row.referral.patientName} ({row.referral.referralId})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'confirm_missed' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">{t('missedReasonLabel')} *</span>
              <select
                value={payload.reason ?? ''}
                onChange={e => set({ reason: e.target.value })}
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
              <Input value={payload.notes ?? ''} onChange={e => set({ notes: e.target.value })} className="h-10" />
            </label>
          </div>
        )}

        {mode === 'contact' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">{t('patientReachedQuestion')} *</span>
                <select
                  value={payload.reached ? 'yes' : 'no'}
                  onChange={e => set({ reached: e.target.value === 'yes' })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="no">{t('answerNo')}</option>
                  {/* A patient can only be "reached" once the missed visit is confirmed. */}
                  {row.referral.status === 'missed' && <option value="yes">{t('answerYes')}</option>}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">{t('contactMethodLabel')} *</span>
                <select
                  value={payload.method ?? ''}
                  onChange={e => set({ method: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {CONTACT_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{t(m.key as TranslationKey)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">{t('contactTimeLabel')}</span>
                <Input
                  type="datetime-local"
                  defaultValue={defaultContactAt}
                  onChange={e => set({ contactAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                  className="h-10"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">{t('actionTakenLabel')}</span>
                <Input value={payload.actionTaken ?? ''} onChange={e => set({ actionTaken: e.target.value })} className="h-10" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">{t('nextFollowUpLabel')}</span>
                <Input type="date" value={payload.nextFollowUpDate ?? ''} onChange={e => set({ nextFollowUpDate: e.target.value })} className="h-10" />
              </label>
            </div>
            <label className="space-y-1 text-xs block">
              <span className="font-medium text-foreground">{t('followupNotes')}</span>
              <textarea
                value={payload.notes ?? ''}
                onChange={e => set({ notes: e.target.value })}
                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </label>
            <p className="text-[11px] text-muted-foreground">{t('contactMethodsHint')}</p>
          </>
        )}

        {mode === 'reschedule' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">{t('newAppointmentDate')} *</span>
              <Input type="date" value={payload.date} onChange={e => set({ date: e.target.value })} className="h-10" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">{t('newAppointmentTime')} *</span>
              <Input type="time" value={payload.time} onChange={e => set({ time: e.target.value })} className="h-10" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">{t('nextFollowUpLabel')}</span>
              <Input type="date" value={payload.nextFollowUpDate ?? ''} onChange={e => set({ nextFollowUpDate: e.target.value })} className="h-10" />
            </label>
          </div>
        )}

        {mode === 'close' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">{t('closureOutcomeLabel')} *</span>
                <select
                  value={payload.outcome ?? ''}
                  onChange={e => set({ outcome: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {MISSED_CLOSURE_OUTCOMES.map(o => (
                    <option key={o.value} value={o.value}>{t(o.key as TranslationKey)}</option>
                  ))}
                </select>
              </label>
              {payload.outcome === 'attended_another_hospital' && (
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-foreground">{t('otherHospitalLabel')} *</span>
                  <Input value={payload.otherHospitalName ?? ''} onChange={e => set({ otherHospitalName: e.target.value })} className="h-10" />
                </label>
              )}
            </div>
            <label className="space-y-1 text-xs block">
              <span className="font-medium text-foreground">{t('followupNotes')} *</span>
              <textarea
                value={payload.notes ?? ''}
                onChange={e => set({ notes: e.target.value })}
                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </label>
          </>
        )}

        {mode === 'elsewhere' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">{t('otherHospitalLabel')} *</span>
              <Input value={payload.otherHospitalName ?? ''} onChange={e => set({ otherHospitalName: e.target.value })} className="h-10" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">{t('attendedDateLabel')} *</span>
              <Input type="date" value={payload.attendedDate ?? ''} onChange={e => set({ attendedDate: e.target.value })} className="h-10" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">{t('followupNotes')}</span>
              <Input value={payload.notes ?? ''} onChange={e => set({ notes: e.target.value })} className="h-10" />
            </label>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">{t('inAppOnlyHint')}</p>

        <div className="flex gap-3">
          <Button size="sm" disabled={!canSave || busy} onClick={() => void onSubmit(payload)}>
            {busy ? '…' : t('saveFollowupAction')}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
