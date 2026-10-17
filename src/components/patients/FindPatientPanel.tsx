// ============================================================================
// Find Existing Patient — Patient ID lookup + authorized demographic edit
// ----------------------------------------------------------------------------
// The Health Worker workflow:
//
//   Find Existing Patient → Enter Patient ID → Search Patient → Verify details
//   → Edit permitted details → Save Changes → success
//
// A patient registered by Health Worker A is found by Health Worker B through
// the SAME record (the Patient ID is an identifier, not a second register), and
// B's correction is saved to that record with an audit entry naming B.
//
// The presentational parts are exported separately and take everything from
// their props, so they can be rendered in tests (and reused) without the data
// context: a broken hook or a crashing row fails a test instead of producing a
// blank dashboard.
// ============================================================================

import { useState } from 'react';
import { useTranslation, type Translation } from '@/hooks/use-translation';
import { usePatientRegistry, type PatientAccessSource, type PatientLookup, type PatientSaveResult } from '@/hooks/use-patient-registry';
import {
  BLOOD_GROUPS,
  PATIENT_GENDERS,
  registeredByLabel,
  type PatientDraft,
  type PatientEditErrorCode,
  type PatientFieldError,
} from '@/lib/patient-record';
import type { TranslationKey } from '@/lib/i18n';
import type { Patient, PatientEditEntry } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Search, Users, Edit2, Save, AlertCircle, CheckCircle2, ShieldCheck,
  Clock, Info, X, FileText, Activity,
} from 'lucide-react';

/** Readable label for each edited field (history + error targeting). */
const FIELD_LABEL_KEY: Record<string, TranslationKey> = {
  name: 'name',
  age: 'ageLabel',
  gender: 'gender',
  phone: 'phone',
  address: 'address',
  village: 'villageLabel',
  district: 'districtLabel',
  state: 'stateLabel',
  bloodGroup: 'bloodGroup',
  aadhaarLast4: 'aadhaar',
  emergencyContact: 'emergencyContact',
  allergies: 'allergies',
  chronicConditions: 'conditions',
};

const ERROR_KEY: Partial<Record<PatientEditErrorCode, TranslationKey>> = {
  required: 'errorRequired',
  invalid_age: 'errorInvalidAge',
  invalid_gender: 'errorInvalidGender',
  invalid_phone: 'errorInvalidPhone',
  invalid_aadhaar: 'errorInvalidAadhaar',
  invalid_blood_group: 'errorInvalidBloodGroup',
  no_changes: 'errorNoChanges',
  too_long: 'errorTooLong',
  too_many_items: 'errorTooManyItems',
  stale: 'patientConflictHint',
};

const ACCESS_KEY: Record<PatientAccessSource, TranslationKey> = {
  facility_register: 'patientAccessFacility',
  referral: 'patientAccessReferral',
  appointment: 'patientAccessAppointment',
  health_card: 'patientAccessHealthCard',
  platform: 'patientAccessPlatform',
};

function fieldLabel(field: string, t: Translation['t']): string {
  const key = FIELD_LABEL_KEY[field];
  return key ? t(key) : field;
}

function errorText(error: PatientFieldError, t: Translation['t']): string {
  const key = ERROR_KEY[error.code];
  return key ? t(key) : error.message;
}

/** Every field of the edit form, as plain strings. */
interface EditFormState {
  name: string;
  age: string;
  gender: string;
  phone: string;
  address: string;
  village: string;
  district: string;
  state: string;
  bloodGroup: string;
  aadhaarLast4: string;
  emergencyContact: string;
  allergies: string;
  chronicConditions: string;
  reason: string;
}

export function editFormFrom(patient: Patient): EditFormState {
  return {
    name: patient.name ?? '',
    age: typeof patient.age === 'number' ? String(patient.age) : '',
    gender: patient.gender ?? 'other',
    phone: patient.phone ?? '',
    address: patient.address ?? '',
    village: patient.village ?? '',
    district: patient.district ?? '',
    state: patient.state ?? '',
    bloodGroup: patient.bloodGroup ?? '',
    aadhaarLast4: patient.aadhaarLast4 ?? '',
    emergencyContact: patient.emergencyContact ?? '',
    allergies: (patient.allergies ?? []).join(', '),
    chronicConditions: (patient.chronicConditions ?? []).join(', '),
    reason: '',
  };
}

/** The whole enabled form → the patch the backend validates. */
export function editDraftFrom(form: EditFormState): { draft: PatientDraft; reason: string } {
  const list = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
  return {
    draft: {
      name: form.name,
      age: form.age.trim(),
      gender: form.gender,
      phone: form.phone,
      address: form.address,
      village: form.village,
      district: form.district,
      state: form.state,
      bloodGroup: form.bloodGroup,
      aadhaarLast4: form.aadhaarLast4,
      emergencyContact: form.emergencyContact,
      allergies: list(form.allergies),
      chronicConditions: list(form.chronicConditions),
    },
    reason: form.reason,
  };
}

/** `2026-10-15 09:20` — enough to read an audit trail at a glance. */
export function formatEditTime(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : iso;
}

/** The Patient ID / Health Card ID search field. */
export function PatientLookupField({
  value,
  onChange,
  onSubmit,
  isSearching,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSearching: boolean;
}) {
  const { t } = useTranslation();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex-1">
        <label htmlFor="patient-lookup-code" className="mb-1.5 block text-sm font-medium text-foreground">
          {t('patientIdLabel')}
        </label>
        <Input
          id="patient-lookup-code"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={t('patientIdPlaceholder')}
          autoComplete="off"
          className="h-11 font-mono uppercase"
        />
      </div>
      <Button type="submit" className="h-11 gap-1.5" disabled={isSearching}>
        {isSearching ? <Spinner /> : <Search className="h-4 w-4" />}
        {isSearching ? t('searchingPatient') : t('searchPatient')}
      </Button>
    </form>
  );
}

/** Loading / invalid / not-found / permission-denied / failure states. */
export function PatientLookupStatus({ lookup }: { lookup: PatientLookup }) {
  const { t } = useTranslation();

  if (lookup.state === 'found' || lookup.state === 'idle') {
    return lookup.state === 'idle'
      ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{t('patientLookupIdle')}</span>
        </div>
      )
      : null;
  }

  if (lookup.state === 'searching') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Spinner />
        <span>{t('searchingPatient')}</span>
      </div>
    );
  }

  const tone = lookup.state === 'forbidden' || lookup.state === 'error' ? 'red' : lookup.state === 'invalid' ? 'amber' : 'slate';
  const titleKey: TranslationKey =
    lookup.state === 'invalid' ? 'patientIdInvalidTitle'
      : lookup.state === 'forbidden' ? 'patientAccessDeniedTitle'
        : lookup.state === 'error' ? 'patientLookupFailedTitle'
          : 'patientNotFoundTitle';
  const hintKey: TranslationKey =
    lookup.state === 'invalid' ? 'patientIdInvalidHint'
      : lookup.state === 'forbidden' ? 'patientAccessDeniedHint'
        : lookup.state === 'error' ? 'patientLookupFailedHint'
          : 'patientNotFoundHint';

  return (
    <div
      role="alert"
      className={
        tone === 'red' ? 'rounded-lg border border-red-200 bg-red-50 p-4'
          : tone === 'amber' ? 'rounded-lg border border-amber-200 bg-amber-50 p-4'
            : 'rounded-lg border border-border bg-muted/30 p-4'
      }
    >
      <p className={`flex items-center gap-2 text-sm font-semibold ${
        tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-foreground'
      }`}>
        {tone === 'red' ? <AlertCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
        {t(titleKey)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t(hintKey)}</p>
    </div>
  );
}

/** The verified patient record (the "Verify Patient Details" step). */
export function PatientVerificationCard({
  patient,
  canEdit,
  accessSource,
  offline,
  counts,
  onEdit,
}: {
  patient: Patient;
  canEdit: boolean;
  accessSource?: PatientAccessSource;
  offline: boolean;
  counts: { vitals: number; reports: number; referrals: number; appointments: number };
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const detail = (label: string, value: string) => (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground break-words">{value}</p>
    </div>
  );

  return (
    <Card data-slot="patient-verified-card" className="border-emerald-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span className="text-emerald-700">{t('patientVerifiedTitle')}</span>
          <Badge variant="outline" className="font-mono text-[10px]">{patient.id.toUpperCase()}</Badge>
          <Badge variant="outline" className="font-mono text-[10px]">{patient.healthCardId}</Badge>
          {accessSource && <Badge variant="outline" className="text-[10px]">{t('patientRegisterSource')}: {t(ACCESS_KEY[accessSource])}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {offline && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('patientLookupOffline')}</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {detail(t('name'), patient.name)}
          {detail(t('ageLabel'), typeof patient.age === 'number' ? String(patient.age) : t('emptyValue'))}
          {detail(t('gender'), patient.gender === 'female' ? t('genderFemale') : patient.gender === 'male' ? t('genderMale') : t('genderOther'))}
          {detail(t('phone'), patient.phone || t('emptyValue'))}
          {detail(t('bloodGroup'), patient.bloodGroup || t('emptyValue'))}
          {detail(t('emergencyContact'), patient.emergencyContact || t('emptyValue'))}
          {detail(t('address'), `${patient.address || '—'}, ${patient.village}, ${patient.district}`)}
          {detail(t('healthCardId'), patient.healthCardId)}
          {detail(t('aadhaar'), patient.aadhaarLast4 ? `****${patient.aadhaarLast4}` : t('emptyValue'))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(patient.allergies ?? []).map(allergy => (
            <Badge key={allergy} variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-600">
              {t('allergies')}: {allergy}
            </Badge>
          ))}
          {(patient.chronicConditions ?? []).map(condition => (
            <Badge key={condition} variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
              {condition}
            </Badge>
          ))}
        </div>

        {/* Provenance: the ORIGINAL registering worker stays recorded, whoever
            edits the record later. */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{t('registeredByLabel')}: </span>
            {registeredByLabel(patient)}
          </p>
          <p className="mt-0.5">
            <span className="font-medium text-foreground">{t('registeredOnLabel')}: </span>
            {patient.registeredAt || patient.createdAt}
          </p>
          {patient.lastEditedByName && (
            <p className="mt-0.5">
              <span className="font-medium text-foreground">{t('lastEditedByLabel')}: </span>
              {patient.lastEditedByName} · {formatEditTime(patient.lastEditedAt ?? '')}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <FileText className="h-3.5 w-3.5 text-primary" />
            {t('linkedRecordsTitle')}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('linkedRecordsLine', {
              vitals: counts.vitals,
              reports: counts.reports,
              referrals: counts.referrals,
              appointments: counts.appointments,
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canEdit ? (
            <Button onClick={onEdit} className="gap-1.5">
              <Edit2 className="h-4 w-4" />
              {t('editPatientDetails')}
            </Button>
          ) : (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              {t('patientEditPermissionDenied')}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">{t('identityImmutableNotice')}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The outcome of a save: a saved confirmation, or the reason it was refused.
 * Extracted so every state is reachable in a render test.
 */
export function PatientEditResultBanner({
  result,
  onReload,
}: {
  result: PatientSaveResult;
  onReload?: () => void;
}) {
  const { t } = useTranslation();

  if (result.ok) {
    return (
      <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {t('patientSavedTitle')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {result.offline ? t('patientSavedOffline') : result.message}
        </p>
      </div>
    );
  }

  if (!result.conflict) return null;

  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
        <AlertCircle className="h-4 w-4" />
        {t('patientConflictTitle')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('patientConflictHint')}</p>
      {onReload && (
        <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={onReload}>
          {t('reloadRecord')}
        </Button>
      )}
    </div>
  );
}

/** The permitted demographic/contact fields, with validation feedback. */
export function PatientEditForm({
  patient,
  onSave,
  onCancel,
  onReload,
  isSaving,
}: {
  patient: Patient;
  onSave: (draft: PatientDraft, reason: string) => Promise<PatientSaveResult>;
  onCancel: () => void;
  onReload?: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<EditFormState>(() => editFormFrom(patient));
  const [errors, setErrors] = useState<PatientFieldError[]>([]);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<PatientSaveResult | null>(null);

  const update = (field: keyof EditFormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors.length > 0) setErrors([]);
  };

  const errorFor = (field: string) => errors.find(error => error.field === field);

  const field = (
    key: keyof EditFormState,
    labelKey: TranslationKey,
    props: { type?: string; placeholder?: string; className?: string } = {},
  ) => {
    const error = errorFor(key);
    return (
      <div className={props.className}>
        <label htmlFor={`patient-edit-${key}`} className="mb-1.5 block text-xs font-medium text-foreground">{t(labelKey)}</label>
        <Input
          id={`patient-edit-${key}`}
          type={props.type ?? 'text'}
          value={form[key]}
          placeholder={props.placeholder}
          onChange={event => update(key, event.target.value)}
          aria-invalid={error ? true : undefined}
          className="h-10 text-sm"
        />
        {error && <p className="mt-1 text-[11px] text-red-600">{errorText(error, t)}</p>}
      </div>
    );
  };

  const handleSave = async () => {
    setSaved(null);
    const { draft, reason } = editDraftFrom(form);
    const result = await onSave(draft, reason);
    if (result.ok) {
      setErrors([]);
      setConflict(false);
      setSaved(result);
      return;
    }
    setErrors(result.errors ?? []);
    setConflict(result.conflict === true);
  };

  const handleReload = () => {
    setForm(editFormFrom(patient));
    setErrors([]);
    setConflict(false);
    setSaved(null);
    onReload?.();
  };

  return (
    <Card data-slot="patient-edit-form" className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Edit2 className="h-4 w-4 text-primary" />
          {t('editPatientTitle')} — {patient.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('editPatientHint')}</p>

        {conflict && (
          <PatientEditResultBanner result={{ ok: false, message: '', conflict: true }} onReload={handleReload} />
        )}

        {saved && <PatientEditResultBanner result={saved} />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('name', 'name')}
          {field('age', 'ageLabel', { type: 'number' })}
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">{t('gender')}</p>
            <div className="flex gap-2">
              {PATIENT_GENDERS.map(gender => (
                <Button
                  key={gender}
                  type="button"
                  size="sm"
                  variant={form.gender === gender ? 'default' : 'outline'}
                  className="h-10 flex-1"
                  onClick={() => update('gender', gender)}
                >
                  {gender === 'female' ? t('genderFemale') : gender === 'male' ? t('genderMale') : t('genderOther')}
                </Button>
              ))}
            </div>
            {errorFor('gender') && <p className="mt-1 text-[11px] text-red-600">{errorText(errorFor('gender')!, t)}</p>}
          </div>
          {field('phone', 'phone', { type: 'tel' })}
          {field('address', 'address')}
          {field('village', 'villageLabel')}
          {field('district', 'districtLabel')}
          {field('state', 'stateLabel')}
          {field('emergencyContact', 'emergencyContact', { type: 'tel' })}
          {field('aadhaarLast4', 'aadhaar')}
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">{t('bloodGroup')}</p>
            <div className="flex flex-wrap gap-1.5">
              {BLOOD_GROUPS.map(group => (
                <Button
                  key={group}
                  type="button"
                  size="sm"
                  variant={form.bloodGroup === group ? 'default' : 'outline'}
                  className="h-8 px-2.5 text-xs"
                  onClick={() => update('bloodGroup', form.bloodGroup === group ? '' : group)}
                >
                  {group}
                </Button>
              ))}
            </div>
            {errorFor('bloodGroup') && <p className="mt-1 text-[11px] text-red-600">{errorText(errorFor('bloodGroup')!, t)}</p>}
          </div>
          {field('allergies', 'allergies', { placeholder: t('listSeparatorHint') })}
          {field('chronicConditions', 'conditions', { placeholder: t('listSeparatorHint') })}
        </div>

        <div>
          <label htmlFor="patient-edit-reason" className="mb-1.5 block text-xs font-medium text-foreground">
            {t('changeReasonLabel')}
          </label>
          <textarea
            id="patient-edit-reason"
            value={form.reason}
            onChange={event => update('reason', event.target.value)}
            placeholder={t('changeReasonPlaceholder')}
            className="h-16 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Non-field errors (nothing changed, a refused save) still need a home. */}
        {errors.filter(error => error.field === 'form' || error.field === 'immutable').map(error => (
          <p key={`${error.field}-${error.code}`} className="text-xs text-red-600">{errorText(error, t)}</p>
        ))}

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Spinner /> : <Save className="h-4 w-4" />}
            {isSaving ? t('savingChanges') : t('saveChanges')}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSaving} className="gap-1.5">
            <X className="h-4 w-4" />
            {t('cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The audit trail: who changed what, to which value, and when. */
export function PatientEditHistoryList({ history }: { history: PatientEditEntry[] }) {
  const { t } = useTranslation();
  return (
    <Card data-slot="patient-edit-history">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          {t('editHistoryTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('editHistoryEmpty')}</p>
        ) : history.map(entry => (
          <div key={entry.id} className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground">
              {t('editHistoryActor', { name: entry.editedByName, time: formatEditTime(entry.editedAt) })}
            </p>
            {entry.editedByRole && (
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{entry.editedByRole.replace(/_/g, ' ')}</p>
            )}
            <ul className="mt-1.5 space-y-0.5">
              {entry.changes.map(change => (
                <li key={`${entry.id}-${change.field}`} className="text-[11px] text-muted-foreground">
                  {t('changedFromTo', {
                    field: fieldLabel(change.field, t),
                    from: change.from || t('emptyValue'),
                    to: change.to || t('emptyValue'),
                  })}
                </li>
              ))}
            </ul>
            {entry.reason && (
              <p className="mt-1 text-[11px] italic text-muted-foreground">{t('editHistoryReason', { reason: entry.reason })}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export interface PatientRecordCounts {
  vitals: number;
  reports: number;
  referrals: number;
  appointments: number;
}

/**
 * The workflow itself, driven entirely by props: Find Existing Patient → Enter
 * Patient ID → Search Patient → Verify details → Edit permitted details → Save
 * Changes. Taking everything from props keeps it renderable in a test (and
 * reusable), while the container below is what talks to the register.
 */
export function FindPatientWorkflow({
  lookup,
  isSaving,
  recordCounts,
  onSearch,
  onSave,
  onReset,
}: {
  lookup: PatientLookup;
  isSaving: boolean;
  recordCounts: (patientId: string) => PatientRecordCounts;
  onSearch: (code: string) => void;
  onSave: (patient: Patient, draft: PatientDraft, reason: string) => Promise<PatientSaveResult>;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);

  const submit = () => {
    setEditing(false);
    onSearch(code);
  };

  const clear = () => {
    setCode('');
    setEditing(false);
    onReset();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {t('findExistingPatient')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">{t('findExistingPatientHint')}</p>
          <PatientLookupField value={code} onChange={setCode} onSubmit={submit} isSearching={lookup.state === 'searching'} />
          <PatientLookupStatus lookup={lookup} />
          {lookup.state !== 'idle' && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clear}>
              {t('close')}
            </Button>
          )}
        </CardContent>
      </Card>

      {lookup.state === 'found' && lookup.patient && (
        <>
          <PatientVerificationCard
            patient={lookup.patient}
            canEdit={lookup.canEdit}
            accessSource={lookup.accessSource}
            offline={lookup.offline}
            counts={recordCounts(lookup.patient.id)}
            onEdit={() => setEditing(true)}
          />

          {editing && lookup.canEdit && (
            <PatientEditForm
              patient={lookup.patient}
              isSaving={isSaving}
              onCancel={() => setEditing(false)}
              onReload={() => onSearch(code)}
              onSave={(draft, reason) => onSave(lookup.patient as Patient, draft, reason)}
            />
          )}

          <PatientEditHistoryList history={lookup.editHistory} />
        </>
      )}

      {/* The vertical workflow, so the required order is visible at a glance. */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {['findExistingPatient', 'patientIdLabel', 'searchPatient', 'patientVerifiedTitle', 'editPatientDetails', 'saveChanges'].map((key, index) => (
          <span key={key} className="flex items-center gap-1.5">
            {index > 0 && <Activity className="h-3 w-3 opacity-40" />}
            <span className="rounded-full border border-border px-2 py-0.5">{t(key as TranslationKey)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The panel mounted on the Health Worker dashboard: wires the registry hook to
 * the workflow above.
 */
export function FindPatientPanel({
  recordCounts,
}: {
  recordCounts: (patientId: string) => PatientRecordCounts;
}) {
  const { lookup, search, reset, savePatientEdit, isSaving } = usePatientRegistry();
  return (
    <FindPatientWorkflow
      lookup={lookup}
      isSaving={isSaving}
      recordCounts={recordCounts}
      onSearch={search}
      onSave={savePatientEdit}
      onReset={reset}
    />
  );
}
