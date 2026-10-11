// ============================================================================
// AarogyaLink — Patient Profile
// ----------------------------------------------------------------------------
// Shows the patient's own registered details. Everything here is READ-ONLY:
// identity fields (name, Health Card ID), clinical fields (blood group,
// allergies, chronic conditions) and vitals are entered and verified by the
// healthcare team, and there is no authorized self-service workflow for
// changing them. Rather than faking editable fields, the page says who to ask
// when something is wrong — which is the honest, safe behaviour for a health
// record.
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UnlinkedPatientNotice } from '@/components/shared/UnlinkedPatientNotice';
import { CreditCard, Info, ShieldCheck, User } from 'lucide-react';

export default function PatientProfile() {
  const { currentUser } = useApp();
  const { t } = useTranslation();
  const { patients, getFacilityById } = useData();

  const patient = patients.find(p => p.id === currentUser?.patientId);
  if (!patient) return <UnlinkedPatientNotice />;

  const genderLabel =
    patient.gender === 'female' ? t('genderFemale')
      : patient.gender === 'male' ? t('genderMale')
        : t('genderOther');

  const facility = patient.registeredByFacilityId
    ? getFacilityById(patient.registeredByFacilityId)?.name
    : undefined;

  const rows: { label: string; value: string }[] = [
    { label: t('fullName'), value: patient.name },
    { label: t('healthCardId'), value: patient.healthCardId },
    { label: t('gender'), value: `${genderLabel} • ${t('yearsOld', { age: patient.age })}` },
    { label: t('phone'), value: patient.phone || t('notProvided') },
    { label: t('bloodGroup'), value: patient.bloodGroup || t('notProvided') },
    { label: t('emergencyContact'), value: patient.emergencyContact || t('notProvided') },
    { label: t('address'), value: `${patient.address}, ${patient.village}, ${patient.district}` },
    { label: t('registeredFacility'), value: facility || t('notProvided') },
    { label: t('date'), value: patient.registeredAt },
    { label: t('allergies'), value: patient.allergies?.length ? patient.allergies.join(', ') : t('none') },
    { label: t('conditions'), value: patient.chronicConditions?.length ? patient.chronicConditions.join(', ') : t('none') },
  ].filter(row => row.value !== '');

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <User className="h-6 w-6 text-primary" />
          {t('myProfile')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('profileSubtitle')}</p>
      </div>

      {/* The Health Card id is the identifier a patient is asked for, so it gets
          its own emphasis rather than being one row among many. */}
      <Card className="border-primary/25">
        <CardContent className="flex items-center gap-3 p-5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{patient.name}</p>
            <p className="mt-0.5 font-mono text-sm font-semibold text-primary">{patient.healthCardId}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-[1.125rem] w-[1.125rem] text-primary" />
            {t('yourDetails')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map(row => (
              <div key={row.label} className="rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
                <dd className="break-words text-sm font-medium text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{t('profileReadOnly')}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
