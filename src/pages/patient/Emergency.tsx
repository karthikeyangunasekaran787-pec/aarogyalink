// ============================================================================
// Emergency Support
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, MapPin, Ambulance, Shield, AlertTriangle, Navigation } from 'lucide-react';

export default function Emergency() {
  const { language } = useApp();

  const handleSOS = () => {
    window.location.href = 'tel:108';
  };

  const handleCall = (number: string) => {
    window.location.href = `tel:${number}`;
  };

  const handleNavigate = () => {
    window.open('https://www.google.com/maps/search/nearby+hospital+emergency+near+me', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{t('emergencySupport', language)}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('emergencyContactsSubtitle', language)}
        </p>
      </div>

      {/* SOS Button */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 text-center">
          <Button
            variant="destructive"
            size="lg"
            className="h-20 w-20 rounded-full text-lg font-bold shadow-lg cursor-pointer"
            onClick={handleSOS}
          >
            SOS
          </Button>
          <p className="text-sm text-red-700 mt-3 font-medium">{t('tapForEmergencyAssistance', language)}</p>
        </CardContent>
      </Card>

      {/* Quick contacts */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t('callAmbulance', language), number: '108', icon: Ambulance, color: 'bg-red-50 text-red-600' },
          { label: t('callHealthHelpline', language), number: '104', icon: Phone, color: 'bg-blue-50 text-blue-600' },
          { label: t('callNearestPhc', language), number: '04522345001', icon: MapPin, color: 'bg-emerald-50 text-emerald-600' },
          { label: t('callPolice', language), number: '100', icon: Shield, color: 'bg-amber-50 text-amber-600' },
        ].map(contact => {
          const Icon = contact.icon;
          return (
            <Card key={contact.label}>
              <CardContent className="p-4 text-center">
                <div className={`h-10 w-10 rounded-full ${contact.color} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">{contact.label}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 text-xs gap-1 cursor-pointer"
                  onClick={() => handleCall(contact.number)}
                >
                  <Phone className="h-3 w-3" />
                  {contact.number}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button variant="outline" className="w-full gap-2 h-11 cursor-pointer" onClick={handleNavigate}>
        <Navigation className="h-4 w-4" />
        {t('navigateToNearestHospital', language)}
      </Button>
    </div>
  );
}
