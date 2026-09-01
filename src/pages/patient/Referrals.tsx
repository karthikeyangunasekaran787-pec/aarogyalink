// ============================================================================
// Patient Referral Tracker - Visual referral timeline and tracking
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReferralTimeline, ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { QRCode } from '@/components/shared/QRCode';
import { useData } from '@/contexts/DataContext';
import {
  FileText,
  AlertTriangle, CheckCircle2, QrCode
} from 'lucide-react';

export default function Referrals() {
  const { referrals, referralEvents, getReferralEvents } = useData();
  const { language } = useApp();
  const [selectedReferral, setSelectedReferral] = useState<string | null>(null);

  const patientReferrals = referrals.filter(r => r.patientId === 'p1');
  const activeReferrals = patientReferrals.filter(r => r.status !== 'closed');
  const completedReferrals = patientReferrals.filter(r => r.status === 'closed');

  const selected = selectedReferral ? patientReferrals.find(r => r.id === selectedReferral) : null;
  const selectedEvents = selected ? referralEvents.filter(e => e.referralId === selected.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          {t('referralTracker', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === 'ta' ? 'உங்கள் பரிந்துரைகளின் நிலையைக் கண்காணிக்கவும்' :
           language === 'hi' ? 'अपने रेफरल की स्थिति ट्रैक करें' :
           'Track the progress of your referrals end-to-end'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{activeReferrals.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Active Referrals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{completedReferrals.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">
              {patientReferrals.filter(r => r.isOverdue).length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Overdue</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Referral List */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            {activeReferrals.length > 0 ? 'Active' : 'All'} Referrals
          </h3>
          {patientReferrals.map((ref) => (
            <div
              key={ref.id}
              className={`rounded-lg border p-3 cursor-pointer transition-all hover:shadow-sm ${
                selectedReferral === ref.id ? 'ring-2 ring-primary bg-primary/5' : 'border-border'
              }`}
              onClick={() => setSelectedReferral(ref.id)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">{ref.referralId}</span>
                {ref.isOverdue ? (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    Overdue
                  </Badge>
                ) : ref.status === 'closed' ? (
                  <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                    Closed
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {ref.department} • {ref.destinationFacilityName}
              </p>
              <ReferralProgressMini
                currentStep={ref.currentStep}
                totalSteps={ref.totalSteps}
                isOverdue={ref.isOverdue}
              />
            </div>
          ))}
        </div>

        {/* Referral Detail */}
        <div className="lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {selected.referralId}
                      <PriorityBadge priority={selected.priority} />
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{selected.reason}</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1">
                    <QrCode className="h-3.5 w-3.5" />
                    QR Code
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* QR Code */}
                <div className="flex justify-center">
                  <QRCode
                    data={selected.referralId}
                    size={140}
                    label={selected.referralId}
                  />
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t('sourceFacility', language)}</p>
                    <p className="font-medium mt-0.5">{selected.sourceFacilityName}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t('destinationFacility', language)}</p>
                    <p className="font-medium mt-0.5">{selected.destinationFacilityName}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t('department', language)}</p>
                    <p className="font-medium mt-0.5">{selected.department}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Doctor</p>
                    <p className="font-medium mt-0.5">{selected.doctorName || 'To be assigned'}</p>
                  </div>
                  {selected.appointmentDate && (
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">{t('date', language)}</p>
                      <p className="font-medium mt-0.5">{selected.appointmentDate} at {selected.appointmentTime}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="font-medium mt-0.5">{new Date(selected.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Visual Timeline */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">
                    {t('referralTimeline', language)}
                  </h4>
                  <ReferralTimeline
                    currentStatus={selected.status}
                    currentStep={selected.currentStep}
                    totalSteps={selected.totalSteps}
                    isOverdue={selected.isOverdue}
                  />
                </div>

                {/* Event History */}
                {selectedEvents.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">Activity History</h4>
                    <div className="space-y-2">
                      {selectedEvents.map((event) => (
                        <div key={event.id} className="flex gap-3 text-sm">
                          <div className="flex flex-col items-center">
                            <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                            <div className="w-px flex-1 bg-border" />
                          </div>
                          <div className="pb-3">
                            <p className="text-foreground">{event.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              by {event.performedBy} • {new Date(event.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {language === 'ta' ? 'ஒரு பரிந்துரையைத் தேர்ந்தெடுக்கவும்' :
                   language === 'hi' ? 'रेफरल चुनें' :
                   'Select a referral to view its timeline and details'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
