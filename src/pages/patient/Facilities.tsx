// ============================================================================
// Facility Finder - Search, filter, and book appointments at nearby facilities
// ----------------------------------------------------------------------------
// Every distance on this screen is computed from the patient's own position
// (device location, else their registered village, else their district) — the
// numbers are never written into the markup, so two patients in different
// villages see different distances to the same hospital, and the list can be
// ordered nearest-first. When a position cannot be resolved the distance is
// shown as unavailable rather than guessed.
// ============================================================================

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented-control';
import { useData } from '@/contexts/DataContext';
import { useTranslation } from '@/hooks/use-translation';
import { usePatientLocation } from '@/hooks/use-patient-location';
import { distanceToFacilityKm, estimateTravelMinutes, formatDistanceKm } from '@/lib/geo';
import type { TranslationKey } from '@/lib/i18n';
import { Link } from 'react-router';
import {
  Search, MapPin, Star, Clock, Bed, Users,
  ChevronRight, Ambulance, TestTube, ArrowUpDown, Compass, Locate,
  Navigation, Phone,
} from 'lucide-react';

type FacilityType = 'phc' | 'chc' | 'dh' | 'medical_college' | 'private';
type TypeFilter = FacilityType | 'all';

/** Facility types are translated, so the filter segments read in each language. */
const FACILITY_TYPE_LABEL_KEY: Record<FacilityType, TranslationKey> = {
  phc: 'facilityTypePhc',
  chc: 'facilityTypeChc',
  dh: 'facilityTypeDh',
  medical_college: 'facilityTypeMedicalCollege',
  private: 'facilityTypePrivate',
};

const FACILITY_TYPE_COLORS: Record<FacilityType, string> = {
  phc: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  chc: 'bg-blue-50 text-blue-700 border-blue-200',
  dh: 'bg-violet-50 text-violet-700 border-violet-200',
  medical_college: 'bg-amber-50 text-amber-700 border-amber-200',
  private: 'bg-pink-50 text-pink-700 border-pink-200',
};

export default function Facilities() {
  const { facilities, doctors } = useData();
  const { t } = useTranslation();
  const location = usePatientLocation();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const [nearestFirst, setNearestFirst] = useState(true);

  // Distance from the patient to each facility, recomputed whenever the
  // patient's position changes (e.g. they share their live location).
  const located = useMemo(
    () =>
      facilities.map(f => ({
        facility: f,
        distanceKm: distanceToFacilityKm(location.coords, f),
      })),
    [facilities, location.coords],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = located.filter(({ facility: f }) => {
      const matchSearch =
        !query || f.name.toLowerCase().includes(query) || f.village.toLowerCase().includes(query);
      const matchType = typeFilter === 'all' || f.type === typeFilter;
      return matchSearch && matchType;
    });

    if (!nearestFirst) return matches;
    // Nearest first; a facility whose location is unknown sorts last rather
    // than pretending to be far away.
    return [...matches].sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }, [located, search, typeFilter, nearestFirst]);

  const nearestId = useMemo(() => {
    const known = located
      .filter(entry => entry.distanceKm !== null)
      .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number));
    return known.length > 0 ? known[0].facility.id : null;
  }, [located]);

  const facility = selectedFacility ? facilities.find(f => f.id === selectedFacility) : null;
  const facilityDoctors = facility ? doctors.filter(d => d.facilityId === facility.id) : [];
  const facilityDistanceKm = facility ? distanceToFacilityKm(location.coords, facility) : null;
  const facilityTravelMinutes = estimateTravelMinutes(facilityDistanceKm);

  const typeOptions: ReadonlyArray<SegmentedOption<TypeFilter>> = [
    { value: 'all', label: t('all') },
    { value: 'phc', label: t('facilityTypePhc') },
    { value: 'chc', label: t('facilityTypeChc') },
    { value: 'dh', label: t('facilityTypeDh') },
    { value: 'medical_college', label: t('facilityTypeMedicalCollege') },
  ];

  // Where the distances are measured from, stated plainly under the heading.
  const originLabel =
    location.source === 'device'
      ? t('distanceFromYourLocation')
      : location.placeName
        ? t('distanceFromPlace', { place: location.placeName })
        : t('distanceUnavailable');

  const mapsUrl = (name: string, village: string, district: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${village}, ${district}`)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MapPin}
        title={t('facilityFinder')}
        subtitle={t('facilitiesSubtitle')}
        actions={
          location.source !== 'device' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={location.requestDeviceLocation}
              disabled={location.isLocating}
            >
              <Locate className="h-3.5 w-3.5" />
              {location.isLocating ? t('locating') : t('useMyLocation')}
            </Button>
          )
        }
      />

      {/* Distance origin — the patient's own location, not a fixed number. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Compass className="h-3.5 w-3.5 text-primary" />
          {originLabel}
        </span>
        <span className="text-[11px] text-muted-foreground">{t('distanceStraightLine')}</span>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchFacilityPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button
          variant={nearestFirst ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 self-start whitespace-nowrap sm:self-auto"
          aria-pressed={nearestFirst}
          onClick={() => setNearestFirst(value => !value)}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {t('nearestFirst')}
        </Button>
      </div>

      {/* Facility type filter — equal-width segments, aligned across the row. */}
      <SegmentedControl
        options={typeOptions}
        value={typeFilter}
        onChange={setTypeFilter}
        ariaLabel={t('filter')}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Facility List */}
        <div className="space-y-3 lg:col-span-2">
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('noResultsFound')}
              </CardContent>
            </Card>
          )}

          {filtered.map(({ facility: f, distanceKm }) => (
            <Card
              key={f.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedFacility === f.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedFacility(f.id)}
            >
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{f.name}</h3>
                      <Badge className={`px-1.5 py-0 text-[10px] ${FACILITY_TYPE_COLORS[f.type]}`}>
                        {t(FACILITY_TYPE_LABEL_KEY[f.type])}
                      </Badge>
                      {nearestFirst && f.id === nearestId && distanceKm !== null && (
                        <Badge variant="outline" className="border-primary/30 px-1.5 py-0 text-[10px] text-primary">
                          {t('nearestFirst')}
                        </Badge>
                      )}
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {f.village}, {f.district}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center gap-1 text-sm font-semibold text-primary">
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                      {f.careMatchScore ?? '—'}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{t('careMatchScore')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <a
                    href={mapsUrl(f.name, f.village, f.district)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={distanceKm === null ? t('distanceUnavailable') : t('navigateToHospital')}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-muted/50 p-2 transition-colors hover:bg-primary/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Navigation className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-medium tabular-nums text-primary">
                      {distanceKm === null ? '—' : formatDistanceKm(distanceKm)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{t('distance')}</p>
                  </a>
                  <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-muted/50 p-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium tabular-nums">{f.averageWaitTime}m</p>
                    <p className="text-[10px] text-muted-foreground">{t('waitTime')}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-muted/50 p-2">
                    <Bed className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium tabular-nums">
                      {f.totalBeds - f.occupiedBeds}/{f.totalBeds}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{t('bedsAvailable')}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-muted/50 p-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium tabular-nums">{f.specialistsAvailable}</p>
                    <p className="text-[10px] text-muted-foreground">{t('specialists')}</p>
                  </div>
                </div>

                {f.emergencyAvailable && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                    <Ambulance className="h-3 w-3" />
                    <span>{t('emergencyAvailable247')}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Facility Details Panel */}
        <div className="lg:col-span-1">
          {facility ? (
            <Card className="lg:sticky lg:top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{facility.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t(FACILITY_TYPE_LABEL_KEY[facility.type])}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Distance from THIS patient, with the rough travel time. */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-primary/10 bg-primary/5 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">{t('distance')}</p>
                    <p className="text-xl font-bold tabular-nums text-primary">
                      {facilityDistanceKm === null ? '—' : formatDistanceKm(facilityDistanceKm)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{t('distanceStraightLine')}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">{t('travelTime')}</p>
                    <p className="text-xl font-bold tabular-nums text-foreground">
                      {facilityTravelMinutes === null ? '—' : `${facilityTravelMinutes}m`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">~35 km/h</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{facility.phone}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{facility.address}</span>
                </div>

                {/* Facility readiness score (stored district metric) */}
                <div className="rounded-lg border border-primary/10 bg-primary/5 p-3 text-center">
                  <p className="mb-1 text-xs text-muted-foreground">{t('careMatchScore')}</p>
                  <p className="text-3xl font-bold tabular-nums text-primary">
                    {facility.careMatchScore ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('outOf100')}</p>
                </div>

                {/* Departments */}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{t('departments')}</p>
                  <div className="flex flex-wrap gap-1">
                    {facility.departments.map(d => (
                      <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>
                    ))}
                  </div>
                </div>

                {/* Available Doctors */}
                {facilityDoctors.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {t('specialists')}
                    </p>
                    <div className="space-y-2">
                      {facilityDoctors.map(d => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 p-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{d.name}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{d.specialization}</p>
                          </div>
                          <Link to={`/patient/book-appointment?facility=${facility.id}&doctor=${d.id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-[10px]">
                              {t('bookAppointment')}
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diagnostics */}
                {facility.diagnosticsAvailable.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t('diagnosticAvail')}</p>
                    <div className="flex flex-wrap gap-1">
                      {facility.diagnosticsAvailable.map(d => (
                        <Badge key={d} variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                          <TestTube className="mr-1 h-2.5 w-2.5" />
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <a
                  href={mapsUrl(facility.name, facility.village, facility.district)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="h-10 w-full gap-2">
                    <Navigation className="h-4 w-4" />
                    {t('navigateToHospital')}
                  </Button>
                </a>
                {/* Only pre-select the facility when a doctor practises there;
                    otherwise the booking screen opens with nothing selected and
                    the patient picks a staffed location. */}
                <Link to={facilityDoctors.length > 0
                  ? `/patient/book-appointment?facility=${facility.id}`
                  : '/patient/book-appointment'}>
                  <Button className="h-10 w-full">
                    {t('bookAppointment')}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="lg:sticky lg:top-20">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <MapPin className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t('selectFacility')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
