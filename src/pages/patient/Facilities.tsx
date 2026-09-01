// ============================================================================
// Facility Finder - Search, filter, and book appointments at nearby facilities
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { facilities, doctors } from '@/lib/mock-data';
import { Link } from 'react-router';
import {
  Search, MapPin, Star, Clock, Bed, Users,
  ChevronRight, Ambulance, TestTube,
  Navigation, Phone
} from 'lucide-react';

const FACILITY_TYPE_LABELS = {
  phc: 'Primary Health Centre',
  chc: 'Community Health Centre',
  dh: 'District Hospital',
  medical_college: 'Medical College Hospital',
  private: 'Private Hospital',
};

const FACILITY_TYPE_COLORS = {
  phc: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  chc: 'bg-blue-50 text-blue-700 border-blue-200',
  dh: 'bg-violet-50 text-violet-700 border-violet-200',
  medical_college: 'bg-amber-50 text-amber-700 border-amber-200',
  private: 'bg-pink-50 text-pink-700 border-pink-200',
};

export default function Facilities() {
  const { language } = useApp();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);

  const filtered = facilities.filter(f => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.village.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || f.type === typeFilter;
    return matchSearch && matchType;
  });

  const facility = selectedFacility ? facilities.find(f => f.id === selectedFacility) : null;
  const facilityDoctors = facility ? doctors.filter(d => d.facilityId === facility.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          {t('facilityFinder', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === 'ta' ? 'அருகிலுள்ள சுகாதார வசதிகளைத் தேடுங்கள்' :
           language === 'hi' ? 'निकटतम स्वास्थ्य सुविधाएं खोजें' :
           'Find and compare healthcare facilities near you'}
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={language === 'ta' ? 'வசதி அல்லது கிராமம் தேடுங்கள்...' :
                         language === 'hi' ? 'सुविधा या गांव खोजें...' :
                         'Search facility or village...'}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all', 'phc', 'chc', 'dh', 'medical_college'].map((type) => (
            <Button
              key={type}
              variant={typeFilter === type ? 'default' : 'outline'}
              size="sm"
              className="text-xs whitespace-nowrap"
              onClick={() => setTypeFilter(type)}
            >
              {type === 'all' ? t('all', language) : FACILITY_TYPE_LABELS[type as keyof typeof FACILITY_TYPE_LABELS]?.split(' ')[0]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Facility List */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.map((f) => (
            <Card
              key={f.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedFacility === f.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedFacility(f.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{f.name}</h3>
                      <Badge className={`text-[10px] px-1.5 py-0 ${FACILITY_TYPE_COLORS[f.type]}`}>
                        {FACILITY_TYPE_LABELS[f.type]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {f.village}, {f.district}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm font-semibold text-primary">
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                      {f.careMatchScore}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{t('careMatchScore', language)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-md bg-muted/50 p-1.5">
                    <Navigation className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
                    <p className="text-xs font-medium">{f.id === 'f1' ? '3.2km' : f.id === 'f2' ? '2.1km' : f.id === 'f3' ? '15km' : f.id === 'f4' ? '5.5km' : '18km'}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-1.5">
                    <Clock className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
                    <p className="text-xs font-medium">{f.averageWaitTime}m</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-1.5">
                    <Bed className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
                    <p className="text-xs font-medium">{f.totalBeds - f.occupiedBeds}/{f.totalBeds}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-1.5">
                    <Users className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
                    <p className="text-xs font-medium">{f.specialistsAvailable}</p>
                  </div>
                </div>

                {f.emergencyAvailable && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                    <Ambulance className="h-3 w-3" />
                    <span>Emergency Available 24/7</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Facility Details Panel */}
        <div className="lg:col-span-1">
          {facility ? (
            <Card className="sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{facility.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{FACILITY_TYPE_LABELS[facility.type]}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{facility.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{facility.address}</span>
                </div>

                {/* CareMatch Score */}
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{t('careMatchScore', language)}</p>
                  <p className="text-3xl font-bold text-primary">{facility.careMatchScore}</p>
                  <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                </div>

                {/* Departments */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Departments</p>
                  <div className="flex flex-wrap gap-1">
                    {facility.departments.map(d => (
                      <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>
                    ))}
                  </div>
                </div>

                {/* Available Doctors */}
                {facilityDoctors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {t('specialists', language)}
                    </p>
                    <div className="space-y-2">
                      {facilityDoctors.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div>
                            <p className="text-xs font-medium">{d.name}</p>
                            <p className="text-[10px] text-muted-foreground">{d.specialization}</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-[10px]">
                            {t('bookAppointment', language)}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diagnostics */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('diagnosticAvail', language)}</p>
                  <div className="flex flex-wrap gap-1">
                    {facility.diagnosticsAvailable.map(d => (
                      <Badge key={d} variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        <TestTube className="h-2.5 w-2.5 mr-1" />
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Link to="/app/appointments">
                  <Button className="w-full h-10">
                    {t('bookAppointment', language)}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="sticky top-20">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {language === 'ta' ? 'வசதியைத் தேர்ந்தெடுக்கவும்' :
                   language === 'hi' ? 'सुविधा चुनें' :
                   'Select a facility to view details'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
