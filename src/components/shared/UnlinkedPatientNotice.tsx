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
import { useTranslation } from '@/hooks/use-translation';

/**
 * The `language` prop is accepted for backwards compatibility with existing
 * callers but ignored: the text now comes from the shared dictionaries, so an
 * inline conditional copy of the wording cannot drift from the selector.
 */
export function UnlinkedPatientNotice(_props: { language?: string } = {}) {
  const { t } = useTranslation();
  const title = t('unlinkedTitle');
  const body = t('unlinkedBody');

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
            {t('unlinkedAction')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
