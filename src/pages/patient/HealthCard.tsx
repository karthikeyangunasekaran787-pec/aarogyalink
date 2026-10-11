// ============================================================================
// Digital Health Card with QR Code
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { QRCode } from '@/components/shared/QRCode';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { UnlinkedPatientNotice } from '@/components/shared/UnlinkedPatientNotice';
import { useData } from '@/contexts/DataContext';
import { downloadTextFile, safeFilePart, shareText } from '@/lib/download';
import { healthCardQrPayload } from '@/lib/health-card';
import { downloadHealthCardPdf } from '@/lib/health-card-pdf';
import { CreditCard, Download, Share2, Droplets, Phone, AlertTriangle, Shield, FileDown } from 'lucide-react';

export default function HealthCard() {
  const { patients, getFacilityById } = useData();
  const { currentUser } = useApp();
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<string | null>(null);
  // Never fall back to another patient's record (private health data).
  const patient = patients.find(p => p.id === currentUser?.patientId);
  if (!patient) return <UnlinkedPatientNotice />;

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
    setFeedback(t('healthCardDownloaded'));
  };

  // The printable card is a real PDF built on the device (offline-friendly).
  const handleDownloadPdf = async () => {
    setFeedback(t('healthCardPreparing'));
    try {
      await downloadHealthCardPdf({
        // The card artwork itself stays identity-neutral; only the fields the
        // card is specified to carry are written.
        name: patient.name,
        healthCardId: patient.healthCardId,
        age: patient.age,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup,
        facilityName: patient.registeredByFacilityId ? getFacilityById(patient.registeredByFacilityId)?.name : undefined,
        phone: patient.phone,
        emergencyContact: patient.emergencyContact,
        village: patient.village,
        district: patient.district,
      });
      setFeedback(t('healthCardDownloadedPdf'));
    } catch {
      setFeedback(t('healthCardPdfFailed'));
    }
  };

  const handleShare = async () => {
    const outcome = await shareText('AarogyaLink Health Card', cardText);
    setFeedback(
      outcome === 'shared' ? t('healthCardShared')
        : outcome === 'copied' ? t('healthCardCopied')
          : t('sharingUnsupported'),
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" />
          {t('healthCardTitle')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('healthCardSubtitle')}</p>
      </div>

      {/* Health Card */}
      <div className="rounded-2xl overflow-hidden shadow-lg border border-border">
        {/* Card Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 p-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <BrandLogo size={26} />
              </div>
              <div>
                <p className="text-lg font-bold">AarogyaLink</p>
                <p className="text-xs text-primary-foreground/80">{t('healthCardIssuer')}</p>
              </div>
            </div>
            {/* The QR carries the Health Card reference only — no medical data. */}
            <QRCode data={healthCardQrPayload(patient.healthCardId)} size={80} />
          </div>
        </div>

        {/* Card Body */}
        <div className="bg-white p-5 space-y-4">
          <div className="text-center pb-4 border-b border-border">
            <h2 className="text-xl font-bold text-foreground">{patient.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {patient.gender === 'female' ? t('genderFemale') : t('genderMale')} •{' '}
              {t('yearsOld', { age: patient.age })}
            </p>
            <p className="text-xs font-mono font-bold text-primary mt-2">
              {t('healthCardId')}: {patient.healthCardId}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('bloodGroup')}</p>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                <Droplets className="h-3.5 w-3.5 text-red-400" />
                {patient.bloodGroup || t('na')}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('aadhaar')}</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                ****{patient.aadhaarLast4 || 'XXXX'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('phone')}</p>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {patient.phone}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('emergencyContact')}</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {patient.emergencyContact || t('na')}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">{t('address')}</p>
            <p className="text-sm text-foreground mt-0.5">{patient.address}, {patient.village}, {patient.district}</p>
          </div>

          {patient.allergies && patient.allergies.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t('allergies')}
              </p>
              <p className="text-sm text-red-800 mt-1">{patient.allergies.join(', ')}</p>
            </div>
          )}

          {patient.chronicConditions && patient.chronicConditions.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                {t('conditions')}
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
      <Button className="w-full gap-2" onClick={() => void handleDownloadPdf()}>
        <FileDown className="h-4 w-4" />
        {t('downloadHealthCard')} · PDF
      </Button>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          {t('download')}
        </Button>
        <Button variant="outline" className="flex-1 gap-2" onClick={() => void handleShare()}>
          <Share2 className="h-4 w-4" />
          {t('share')}
        </Button>
      </div>
    </div>
  );
}
