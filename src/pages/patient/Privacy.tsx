// ============================================================================
// Privacy and Consent Center
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Shield, Eye, FileText, Users, Lock, Download, Trash2 } from 'lucide-react';

const consentItems = [
  { id: 'data_sharing', label: 'Share health data with referred facilities', description: 'Allow your health records to be shared with doctors you are referred to', icon: Users, defaultOn: true },
  { id: 'treatment', label: 'Treatment consent', description: 'Allow healthcare providers to access your records for treatment purposes', icon: FileText, defaultOn: true },
  { id: 'research', label: 'Anonymous research data', description: 'Contribute anonymized data for healthcare research (never personally identifiable)', icon: Eye, defaultOn: false },
];

export default function Privacy() {
  const { language } = useApp();
  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(consentItems.map(c => [c.id, c.defaultOn]))
  );

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
          <Button variant="outline" className="w-full justify-start gap-2">
            <Download className="h-4 w-4" />
            Download my health data
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
            Request data deletion
          </Button>
        </CardContent>
      </Card>

      <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
        <p className="font-medium mb-1">Audit Activity</p>
        <p>Your data access and sharing history is logged for transparency. All healthcare providers accessing your records are recorded with timestamps.</p>
      </div>
    </div>
  );
}
