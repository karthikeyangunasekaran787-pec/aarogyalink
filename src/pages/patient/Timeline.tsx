// ============================================================================
// Patient Health Timeline - Longitudinal medical history + treatments
// ============================================================================

import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { Clock, FileText, FlaskConical, Pill, Syringe, ArrowUpRight, Stethoscope, ClipboardList } from 'lucide-react';

const TYPE_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  consultation: { icon: FileText, color: 'bg-blue-100 text-blue-600', label: 'Consultation' },
  lab_report: { icon: FlaskConical, color: 'bg-purple-100 text-purple-600', label: 'Lab Report' },
  prescription: { icon: Pill, color: 'bg-emerald-100 text-emerald-600', label: 'Prescription' },
  vaccination: { icon: Syringe, color: 'bg-amber-100 text-amber-600', label: 'Vaccination' },
  referral: { icon: ArrowUpRight, color: 'bg-red-100 text-red-600', label: 'Referral' },
  treatment: { icon: Stethoscope, color: 'bg-teal-100 text-teal-600', label: 'Treatment' },
};

type TimelineEntry = {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  facilityName?: string;
  doctorName?: string;
  prescription?: string[];
  source: 'healthRecord' | 'consultation';
};

export default function Timeline() {
  const { healthRecords, getConsultationsForPatient, doctors, facilities } = useData();
  const { language, currentUser } = useApp();

  const patientId = currentUser?.patientId;

  // Build unified timeline from health records + consultations
  const timelineEntries = useMemo((): TimelineEntry[] => {
    const entries: TimelineEntry[] = [];

    // Add health records
    if (patientId) {
      healthRecords
        .filter(r => r.patientId === patientId)
        .forEach(r => {
          entries.push({
            id: r.id,
            date: r.date,
            type: r.type,
            title: r.title,
            description: r.description,
            facilityName: r.facilityName,
            doctorName: r.doctorName,
            source: 'healthRecord',
          });
        });
    }

    // Add consultations (treatments from doctors)
    if (patientId) {
      const consultations = getConsultationsForPatient(patientId);
      consultations.forEach(c => {
        const doctor = doctors.find(d => d.id === c.doctorId);
        const facility = doctor ? facilities.find(f => f.id === doctor.facilityId) : null;
        entries.push({
          id: c.id,
          date: c.createdAt,
          type: 'treatment',
          title: `Treatment — ${c.diagnosis}`,
          description: c.notes || 'Consultation completed',
          facilityName: facility?.name,
          doctorName: doctor?.name,
          prescription: c.prescription,
          source: 'consultation',
        });
      });
    }

    // Sort by date descending
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [patientId, healthRecords, getConsultationsForPatient, doctors, facilities]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          {t('myTimeline', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your complete medical history and treatments in chronological order
        </p>
      </div>

      {timelineEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No medical records yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your health records and treatments will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-4">
            {timelineEntries.map((entry) => {
              const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.consultation;
              const Icon = config.icon;
              return (
                <div key={entry.id} className="relative flex gap-4 pl-2">
                  <div className={`relative z-10 h-9 w-9 rounded-full ${config.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <Card className="flex-1">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="text-sm font-semibold text-foreground">{entry.title}</h4>
                        <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{entry.description}</p>
                      {entry.prescription && entry.prescription.length > 0 && (
                        <div className="mb-2 p-2 bg-emerald-50/50 rounded-lg border border-emerald-200/50">
                          <p className="text-[10px] text-emerald-700 font-medium uppercase mb-1 flex items-center gap-1">
                            <Pill className="h-3 w-3" /> Prescription
                          </p>
                          <ul className="space-y-0.5">
                            {entry.prescription.map((med, i) => (
                              <li key={i} className="text-xs text-emerald-800">• {med}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{entry.date}</span>
                        {entry.facilityName && <span>• {entry.facilityName}</span>}
                        {entry.doctorName && <span>• {entry.doctorName}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
