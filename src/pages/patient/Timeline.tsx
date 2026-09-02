// ============================================================================
// Patient Health Timeline - Longitudinal medical history
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { Clock, FileText, FlaskConical, Pill, Syringe, ArrowUpRight } from 'lucide-react';

const TYPE_CONFIG = {
  consultation: { icon: FileText, color: 'bg-blue-100 text-blue-600', label: 'Consultation' },
  lab_report: { icon: FlaskConical, color: 'bg-purple-100 text-purple-600', label: 'Lab Report' },
  prescription: { icon: Pill, color: 'bg-emerald-100 text-emerald-600', label: 'Prescription' },
  vaccination: { icon: Syringe, color: 'bg-amber-100 text-amber-600', label: 'Vaccination' },
  referral: { icon: ArrowUpRight, color: 'bg-red-100 text-red-600', label: 'Referral' },
};

export default function Timeline() {
  const { healthRecords } = useData();
  const { language, currentUser } = useApp();
  const records = healthRecords.filter(r => r.patientId === currentUser?.patientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          {t('myTimeline', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your complete medical history in chronological order
        </p>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-4">
          {records.map((record) => {
            const config = TYPE_CONFIG[record.type];
            const Icon = config.icon;
            return (
              <div key={record.id} className="relative flex gap-4 pl-2">
                <div className={`relative z-10 h-9 w-9 rounded-full ${config.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <Card className="flex-1">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="text-sm font-semibold text-foreground">{record.title}</h4>
                      <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{record.description}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{record.date}</span>
                      {record.facilityName && <span>• {record.facilityName}</span>}
                      {record.doctorName && <span>• {record.doctorName}</span>}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
