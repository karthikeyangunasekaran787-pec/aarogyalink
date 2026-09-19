// ============================================================================
// UnlinkedPatientNotice — shown when a signed-in patient account has no linked
// patient record yet.
// ----------------------------------------------------------------------------
// Previously these pages fell back to `patients[0]`, which showed ONE PATIENT
// ANOTHER PATIENT'S health card, vitals and timeline. Showing nothing (plus a
// clear reason) is the only safe behaviour for private health data.
// ============================================================================

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, UserPlus } from 'lucide-react';

export function UnlinkedPatientNotice({ language }: { language: string }) {
  const title =
    language === 'ta' ? 'சுகாதார அட்டை இணைக்கப்படவில்லை'
    : language === 'hi' ? 'स्वास्थ्य कार्ड लिंक नहीं है'
    : 'No Health Record Linked';

  const body =
    language === 'ta'
      ? 'உங்கள் கணக்குடன் இன்னும் ஒரு சுகாதார அட்டை இணைக்கப்படவில்லை. உங்கள் கிராம சுகாதார பணியாளரை அணுகி பதிவு செய்யுங்கள்.'
      : language === 'hi'
      ? 'आपके खाते से अभी तक कोई स्वास्थ्य कार्ड लिंक नहीं है। कृपया अपने ग्राम स्वास्थ्य कार्यकर्ता से पंजीकरण कराएं।'
      : 'Your account is not linked to a patient record yet. A Health Worker must register you and issue your Health Card ID before your health data can be shown.';

  return (
    <div className="max-w-lg mx-auto">
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="py-10 text-center space-y-3">
          <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-7 w-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">{body}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 pt-1">
            <UserPlus className="h-3.5 w-3.5" />
            Health Worker → Register Patient
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
