// ============================================================================
// Digital Health Card with QR Code
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { QRCode } from '@/components/shared/QRCode';
import { UnlinkedPatientNotice } from '@/components/shared/UnlinkedPatientNotice';
import { useData } from '@/contexts/DataContext';
import { downloadTextFile, safeFilePart, shareText } from '@/lib/download';
import { CreditCard, Download, Share2, Heart, Droplets, Phone, AlertTriangle, Shield } from 'lucide-react';

export default function HealthCard() {
  const { patients } = useData();
  const { language, currentUser } = useApp();
  const [feedback, setFeedback] = useState<string | null>(null);
  // Never fall back to another patient's record (private health data).
  const patient = patients.find(p => p.id === currentUser?.patientId);
  if (!patient) return <UnlinkedPatientNotice language={language} />;

  // Everything the card shows, in the order it is printed — also what Download
  // saves and Share offers, so all three views can never disagree.
  const cardText = [
    'AarogyaLink — Digital Health Card',
    'Government of Tamil Nadu',
    `Health Card ID: ${patient.healthCardId}`,
    `Patient ID: ${patient.id}`,
    `Name: ${patient.name}`,
    `Age / Gender: ${patient.age} / ${patient.gender}`,
    `Blood Group: ${patient.bloodGroup || 'N/A'}`,
    `Phone: ${patient.phone}`,
    `Emergency Contact: ${patient.emergencyContact || 'N/A'}`,
    `Address: ${patient.address}, ${patient.village}, ${patient.district}`,
    `Allergies: ${patient.allergies?.length ? patient.allergies.join(', ') : 'None recorded'}`,
    `Existing Conditions: ${patient.chronicConditions?.length ? patient.chronicConditions.join(', ') : 'None recorded'}`,
  ].join('\n');

  const handleDownload = () => {
    downloadTextFile(`health-card-${safeFilePart(patient.healthCardId)}.txt`, cardText);
    setFeedback('Health card downloaded');
  };

  const handleShare = async () => {
    const outcome = await shareText('AarogyaLink Health Card', cardText);
    setFeedback(
      outcome === 'shared' ? 'Health card shared'
        : outcome === 'copied' ? 'Health card copied to clipboard'
          : 'Sharing is not supported on this device — use Download instead',
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" />
          {t('healthCardTitle', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === 'ta' ? 'உங்கள் டிஜிட்டல் சுகாதார அட்டை' :
           language === 'hi' ? 'आपका डिजिटल स्वास्थ्य कार्ड' :
           'Your digital health identity card'}
        </p>
      </div>

      {/* Health Card */}
      <div className="rounded-2xl overflow-hidden shadow-lg border border-border">
        {/* Card Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 p-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Heart className="h-5 w-5" fill="currentColor" />
              </div>
              <div>
                <p className="text-lg font-bold">AarogyaLink</p>
                <p className="text-xs text-primary-foreground/80">Government of Tamil Nadu · Digital Health Card</p>
              </div>
            </div>
            <QRCode data={`AAROGYALINK|${patient.healthCardId}|${patient.id}`} size={80} />
          </div>
        </div>

        {/* Card Body */}
        <div className="bg-white p-5 space-y-4">
          <div className="text-center pb-4 border-b border-border">
            <h2 className="text-xl font-bold text-foreground">{patient.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {patient.gender === 'female' ? 'Female' : 'Male'} • {patient.age} years
            </p>
            <p className="text-xs font-mono font-bold text-primary mt-2">Health Card: {patient.healthCardId}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('bloodGroup', language)}</p>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                <Droplets className="h-3.5 w-3.5 text-red-400" />
                {patient.bloodGroup || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('aadhaar', language)}</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                ****{patient.aadhaarLast4 || 'XXXX'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('phone', language)}</p>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {patient.phone}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('emergencyContact', language)}</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {patient.emergencyContact || 'N/A'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">{t('address', language)}</p>
            <p className="text-sm text-foreground mt-0.5">{patient.address}, {patient.village}, {patient.district}</p>
          </div>

          {patient.allergies && patient.allergies.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t('allergies', language)}
              </p>
              <p className="text-sm text-red-800 mt-1">{patient.allergies.join(', ')}</p>
            </div>
          )}

          {patient.chronicConditions && patient.chronicConditions.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                {t('conditions', language)}
              </p>
              <p className="text-sm text-amber-800 mt-1">{patient.chronicConditions.join(', ')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {feedback && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {feedback}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          {language === 'ta' ? 'பதிவிறக்கு' : language === 'hi' ? 'डाउनलोड' : 'Download'}
        </Button>
        <Button variant="outline" className="flex-1 gap-2" onClick={() => void handleShare()}>
          <Share2 className="h-4 w-4" />
          {language === 'ta' ? 'பகிர்' : language === 'hi' ? 'शेयर' : 'Share'}
        </Button>
      </div>
    </div>
  );
}
