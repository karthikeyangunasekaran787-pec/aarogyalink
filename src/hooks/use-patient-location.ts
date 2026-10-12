// ============================================================================
// AarogyaLink — where the patient is, for distance calculations
// ----------------------------------------------------------------------------
// One hook answers "how far is this hospital from me?" for the whole app. The
// origin is resolved in this order:
//
//   1. the device's own position, when the patient has shared it,
//   2. the coordinates of the village they are registered in,
//   3. their district headquarters.
//
// So two patients see different distances to the same hospital, and a patient
// sees different distances as they travel. Nothing here invents a position: if
// none of the three can be resolved, `coords` stays null and callers show that
// the distance is unknown.
//
// The patient's district is passed as a hint when resolving a village, because
// some names repeat across districts (there is an Alangudi in both Madurai and
// Pudukkottai, a hundred kilometres apart).
//
// The device position is only requested when the browser already has
// permission, or when the patient taps a button — never as a surprise prompt on
// page load.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { coordsForPlace, coordsForPlaceIn, isUsableCoordinates, type Coordinates } from '@/lib/geo';

export type PatientLocationSource = 'device' | 'registered' | 'district' | 'unknown';

export interface PatientLocation {
  /** Origin for distance calculations, or null when nothing could be resolved. */
  coords: Coordinates | null;
  source: PatientLocationSource;
  /** The village or district the fallback origin describes (for the label). */
  placeName: string | null;
  /** True while a device position is being requested. */
  isLocating: boolean;
  /** True when the device could not provide a position (denied or unplugged). */
  deviceUnavailable: boolean;
  /** Ask the device for its position. Needs a user gesture in most browsers. */
  requestDeviceLocation: () => void;
}

interface GeolocationState {
  coords: Coordinates | null;
  isLocating: boolean;
  deviceUnavailable: boolean;
}

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 300000,
};

function hasGeolocation(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && !!navigator.geolocation;
}

/**
 * True only when the browser says the patient has already granted location
 * access. Without the Permissions API we stay quiet and wait for the button, so
 * an unprompted permission dialog never appears.
 */
async function hasLocationPermission(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions) return false;
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

export function usePatientLocation(): PatientLocation {
  const { currentUser } = useApp();
  const { patients } = useData();

  const [device, setDevice] = useState<GeolocationState>({
    coords: null,
    isLocating: false,
    deviceUnavailable: false,
  });
  // A fix that arrives after the screen is gone must not set state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The registered origin belongs to THIS patient only. An unlinked account
  // falls through to the district, never to another patient's village.
  const registered = useMemo(() => {
    const patient = patients.find(p => p.id === currentUser?.patientId);
    const place = patient?.village || patient?.district || currentUser?.districtName || null;
    const district = patient?.district || currentUser?.districtName || null;
    return { place, district };
  }, [patients, currentUser?.patientId, currentUser?.districtName]);

  const districtPlace = currentUser?.districtName ?? null;

  const requestDeviceLocation = useCallback(() => {
    if (!hasGeolocation()) {
      setDevice(prev => ({ ...prev, isLocating: false, deviceUnavailable: true }));
      return;
    }
    setDevice(prev => ({ ...prev, isLocating: true }));
    navigator.geolocation.getCurrentPosition(
      position => {
        if (!mountedRef.current) return;
        setDevice({
          coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          isLocating: false,
          deviceUnavailable: false,
        });
      },
      () => {
        if (!mountedRef.current) return;
        setDevice(prev => ({ ...prev, isLocating: false, deviceUnavailable: true }));
      },
      GEOLOCATION_OPTIONS,
    );
  }, []);

  // Ask once, without a prompt, when access was granted on a previous visit
  // (a health worker re-opening the app at the same village gets live distances).
  useEffect(() => {
    let cancelled = false;
    if (!hasGeolocation()) return;
    void hasLocationPermission().then(granted => {
      if (cancelled || !granted || !mountedRef.current) return;
      requestDeviceLocation();
    });
    return () => {
      cancelled = true;
    };
  }, [requestDeviceLocation]);

  return useMemo<PatientLocation>(() => {
    if (isUsableCoordinates(device.coords)) {
      return {
        coords: device.coords,
        source: 'device',
        placeName: null,
        isLocating: device.isLocating,
        deviceUnavailable: device.deviceUnavailable,
        requestDeviceLocation,
      };
    }

    const registeredCoords = coordsForPlaceIn(registered.district, registered.place);
    if (registeredCoords) {
      return {
        coords: registeredCoords,
        source: 'registered',
        placeName: registered.place,
        isLocating: device.isLocating,
        deviceUnavailable: device.deviceUnavailable,
        requestDeviceLocation,
      };
    }

    const districtCoords = coordsForPlace(districtPlace);
    if (districtCoords) {
      return {
        coords: districtCoords,
        source: 'district',
        placeName: districtPlace,
        isLocating: device.isLocating,
        deviceUnavailable: device.deviceUnavailable,
        requestDeviceLocation,
      };
    }

    return {
      coords: null,
      source: 'unknown',
      placeName: null,
      isLocating: device.isLocating,
      deviceUnavailable: device.deviceUnavailable,
      requestDeviceLocation,
    };
  }, [device, registered, districtPlace, requestDeviceLocation]);
}
