// ============================================================================
// Privacy and Consent Center
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
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

const consentItems = [
  { id: 'data_sharing', label: 'Share health data with referred facilities', description: 'Allow your health records to be shared with doctors you are referred to', icon: Users, defaultOn: true },
  { id: 'treatment', label: 'Treatment consent', description: 'Allow healthcare providers to access your records for treatment purposes', icon: FileText, defaultOn: true },
  { id: 'research', label: 'Anonymous research data', description: 'Contribute anonymized data for healthcare research (never personally identifiable)', icon: Eye, defaultOn: false },
];

export default function Privacy() {
  const { language, currentUser } = useApp();
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
      setFeedback('No patient record is linked to this account yet.');
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
    setFeedback('Your health data has been downloaded.');
  };

  /** Log the deletion request in the patient's own record trail. */
  const handleRequestDeletion = () => {
    if (!patientId) {
      setFeedback('No patient record is linked to this account yet.');
      return;
    }
    const reference = `DEL-${Date.now().toString().slice(-6)}`;
    addNotification({
      userId: `u-${patientId}`,
      title: 'Data Deletion Request Logged',
      message: `Your request ${reference} has been recorded and will be reviewed by the district health authority before any data is removed.`,
      type: 'warning',
      read: false,
    });
    setFeedback(`Deletion request ${reference} logged. Your health worker will review it.`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          {t('consentCenter', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your data sharing preferences and privacy settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Data Consent
          </CardTitle>
          <CardDescription>Control how your health data is used and shared</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {consentItems.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
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
          <CardTitle className="text-base">Your Data Rights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleDownloadData}>
            <Download className="h-4 w-4" />
            Download my health data
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                Request data deletion
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Request deletion of your health data?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your request is logged in your record trail and reviewed by the district health authority.
                  Medical records that are legally required to be retained are never removed while a referral
                  or follow-up is still open.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRequestDeletion}>Log request</AlertDialogAction>
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
        <p className="font-medium mb-1">Audit Activity</p>
        <p>Your data access and sharing history is logged for transparency. All healthcare providers accessing your records are recorded with timestamps.</p>
      </div>
    </div>
  );
}
