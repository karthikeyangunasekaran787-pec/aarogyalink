// ============================================================================
// Privacy and Consent Center
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTranslation } from '@/hooks/use-translation';
import type { TranslationKey } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/DataContext';
import { downloadTextFile, safeFilePart } from '@/lib/download';
import { Shield, Eye, FileText, Users, Lock, Download, Trash2 } from 'lucide-react';

interface ConsentItem {
  id: string;
  label: TranslationKey;
  description: TranslationKey;
  icon: typeof Users;
  defaultOn: boolean;
}

const consentItems: ConsentItem[] = [
  { id: 'data_sharing', label: 'consentDataSharing', description: 'consentDataSharingHint', icon: Users, defaultOn: true },
  { id: 'treatment', label: 'consentTreatment', description: 'consentTreatmentHint', icon: FileText, defaultOn: true },
  { id: 'research', label: 'consentResearch', description: 'consentResearchHint', icon: Eye, defaultOn: false },
];

export default function Privacy() {
  const { currentUser } = useApp();
  const { t } = useTranslation();
  const {
    patients, vitals, healthRecords, consultations, referrals, appointments, followups, addNotification,
  } = useData();
  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(consentItems.map(c => [c.id, c.defaultOn]))
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const patientId = currentUser?.patientId;
  const patient = patients.find(p => p.id === patientId);
  const own = <T extends { patientId: string }>(records: T[]) => records.filter(r => r.patientId === patientId);

  /** Export exactly the records this patient owns — the right to data portability. */
  const handleDownloadData = () => {
    if (!patient) {
      setFeedback(t('noPatientRecordLinked'));
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      generatedBy: 'AarogyaLink',
      patient,
      vitals: own(vitals),
      healthRecords: own(healthRecords),
      consultations: own(consultations),
      referrals: own(referrals),
      appointments: own(appointments),
      followups: own(followups),
    };
    downloadTextFile(
      `aarogyalink-health-data-${safeFilePart(patient.healthCardId)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
    setFeedback(t('dataDownloaded'));
  };

  /** Log the deletion request in the patient's own record trail. */
  const handleRequestDeletion = () => {
    if (!patientId) {
      setFeedback(t('noPatientRecordLinked'));
      return;
    }
    const reference = `DEL-${Date.now().toString().slice(-6)}`;
    addNotification({
      userId: `u-${patientId}`,
      title: t('deletionRequestTitle'),
      message: t('deletionRequestBody', { ref: reference }),
      type: 'warning',
      read: false,
    });
    setFeedback(t('deletionRequestLogged', { ref: reference }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          {t('consentCenter')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('privacySubtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            {t('dataConsent')}
          </CardTitle>
          <CardDescription>{t('dataConsentHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {consentItems.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t(item.label)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t(item.description)}</p>
                  </div>
                </div>
                <Switch
                  checked={consents[item.id]}
                  onCheckedChange={(checked) => setConsents(prev => ({ ...prev, [item.id]: checked }))}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('yourDataRights')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleDownloadData}>
            <Download className="h-4 w-4" />
            {t('downloadMyData')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                {t('requestDataDeletion')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deletionConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('deletionConfirmBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleRequestDeletion}>{t('logRequest')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {feedback && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {feedback}
        </p>
      )}

      <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
        <p className="font-medium mb-1">{t('auditActivity')}</p>
        <p>{t('auditActivityHint')}</p>
      </div>
    </div>
  );
}
