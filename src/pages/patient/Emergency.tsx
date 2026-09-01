// ============================================================================
// Emergency Support
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, MapPin, Ambulance, Shield, AlertTriangle, Navigation } from 'lucide-react';

export default function Emergency() {
  const { language } = useApp();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{t('emergencySupport', language)}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === 'ta' ? 'அவசர உதவிக்கான தொடர்புகள்' :
           language === 'hi' ? 'आपातकालीन सहायता संपर्क' :
           'Emergency contacts and quick actions'}
        </p>
      </div>

      {/* SOS Button */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 text-center">
          <Button variant="destructive" size="lg" className="h-20 w-20 rounded-full text-lg font-bold shadow-lg">
            SOS
          </Button>
          <p className="text-sm text-red-700 mt-3 font-medium">Tap for immediate emergency assistance</p>
        </CardContent>
      </Card>

      {/* Quick contacts */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Ambulance', number: '108', icon: Ambulance, color: 'bg-red-50 text-red-600' },
          { label: 'Health Helpline', number: '104', icon: Phone, color: 'bg-blue-50 text-blue-600' },
          { label: 'Nearest PHC', number: '0452-2345001', icon: MapPin, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Police', number: '100', icon: Shield, color: 'bg-amber-50 text-amber-600' },
        ].map(contact => {
          const Icon = contact.icon;
          return (
            <Card key={contact.label}>
              <CardContent className="p-4 text-center">
                <div className={`h-10 w-10 rounded-full ${contact.color} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">{contact.label}</p>
                <Button variant="outline" size="sm" className="mt-2 h-8 text-xs gap-1">
                  <Phone className="h-3 w-3" />
                  {contact.number}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button variant="outline" className="w-full gap-2">
        <Navigation className="h-4 w-4" />
        {language === 'ta' ? 'அருகிலுள்ள மருத்துவமனைக்கு வழிகாட்டு' :
         language === 'hi' ? 'निकटतम अस्पताल तक नेविगेशन' :
         'Navigate to Nearest Hospital'}
      </Button>
    </div>
  );
}
