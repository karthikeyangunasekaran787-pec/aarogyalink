// ============================================================================
// Hospital Admin Dashboard
// ============================================================================


import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import { referrals, facilities, medicineStock, diagnostics } from '@/lib/mock-data';
import {
  Inbox, CheckCircle2, ScanLine, Package,
  Users, Building2
} from 'lucide-react';

export default function HospitalAdminDashboard() {
  const { language } = useApp();
  const facility = facilities[2]; // Madurai District Hospital
  const facilityReferrals = referrals.filter(r => r.destinationFacilityId === facility.id);
  const incomingReferrals = facilityReferrals.filter(r => r.status === 'created' || r.status === 'accepted');
  const closedReferrals = facilityReferrals.filter(r => r.status === 'closed');
  const facilityMeds = medicineStock.filter(m => m.facilityId === facility.id);
  const facilityDiags = diagnostics.filter(d => d.facilityId === facility.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Welcome'}, Hospital Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Building2 className="h-4 w-4" />
          {facility.name}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Inbox className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{incomingReferrals.length}</p>
                <p className="text-xs text-muted-foreground">{t('referralInbox', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{closedReferrals.length}</p>
                <p className="text-xs text-muted-foreground">{t('closed', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{facilityMeds.length}</p>
                <p className="text-xs text-muted-foreground">{t('medicineStock', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{facility.specialistsAvailable}</p>
                <p className="text-xs text-muted-foreground">{t('specialists', language)} On Duty</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="referrals">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="referrals">{t('referralInbox', language)}</TabsTrigger>
          <TabsTrigger value="qr"><ScanLine className="h-4 w-4 mr-1" /> QR Scan</TabsTrigger>
          <TabsTrigger value="meds">{t('medicineStock', language)}</TabsTrigger>
          <TabsTrigger value="diags">{t('diagnosticAvail', language)}</TabsTrigger>
        </TabsList>

        <TabsContent value="referrals" className="mt-4 space-y-3">
          {facilityReferrals.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No referrals found</CardContent></Card>
          ) : facilityReferrals.map(ref => {
            return (
              <Card key={ref.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{ref.patientName}</p>
                        <PriorityBadge priority={ref.priority} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ref.referralId} • {ref.department} • From: {ref.sourceFacilityName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ref.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{ref.status.replace(/_/g, ' ')}</Badge>
                      {(ref.status === 'created') && (
                        <Button size="sm" className="h-7 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Accept
                        </Button>
                      )}
                    </div>
                  </div>
                  <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="qr" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <ScanLine className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">QR Scan - Patient Arrival</p>
              <p className="text-xs text-muted-foreground mb-4">Scan the patient's referral QR code to verify arrival</p>
              <Button className="gap-2">
                <ScanLine className="h-4 w-4" />
                Open Camera Scanner
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meds" className="mt-4 space-y-3">
          {facilityMeds.map(ms => (
            <Card key={ms.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{ms.medicineName}</p>
                  <p className="text-xs text-muted-foreground">Expires: {ms.expiryDate}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{ms.quantity} {ms.unit}</p>
                  <Badge className={`text-[10px] ${
                    ms.status === 'in_stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    ms.status === 'low_stock' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {ms.status === 'in_stock' ? 'In Stock' : ms.status === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="diags" className="mt-4 space-y-3">
          {facilityDiags.map(d => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.category} • ₹{d.cost}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{d.waitTime}d wait</span>
                  <Badge className={`text-[10px] ${
                    d.available ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {d.available ? 'Available' : 'Unavailable'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
