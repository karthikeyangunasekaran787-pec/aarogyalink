// ============================================================================
// AarogyaLink — Patient "My Reports"
// ----------------------------------------------------------------------------
// The patient's own longitudinal report history: newest first, grouped by year,
// with the report-type filters and search. Reports are added by authorized
// hospital staff and are never overwritten, so nothing here can change history —
// this page only reads it.
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { ReportList } from '@/components/reports/ReportList';
import { UnlinkedPatientNotice } from '@/components/shared/UnlinkedPatientNotice';
import { FileText } from 'lucide-react';

export default function PatientReports() {
  const { currentUser } = useApp();
  const { t } = useTranslation();
  const { patients, getReportsForPatient } = useData();

  // Never fall back to another patient's record (private health data).
  const patient = patients.find(p => p.id === currentUser?.patientId);
  if (!patient) return <UnlinkedPatientNotice />;

  const reports = getReportsForPatient(patient.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileText className="h-6 w-6 text-primary" />
            {t('myReports')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('reportsSubtitle')}</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-xs text-muted-foreground">{t('myHealthCard')}</p>
          <p className="font-mono text-sm font-semibold text-primary">{patient.healthCardId}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <ReportList reports={reports} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t('reportsPrivacyNote')}</p>
    </div>
  );
}
