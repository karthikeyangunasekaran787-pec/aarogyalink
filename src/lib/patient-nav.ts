// ============================================================================
// AarogyaLink — patient navigation
// ----------------------------------------------------------------------------
// The patient's destinations, kept in their own module so the set can be
// asserted in tests without rendering the authenticated layout.
//
// Six primary items, in the order a patient needs them: home, the Health Card
// they carry, the care they are being referred for, the reports filed for them,
// their appointments and their own details. Secondary pages follow under a
// single "More" heading, so no feature is listed twice.
//
// Labels are translation KEYS, never English text: navigation follows the
// selected language.
// ============================================================================

import type { TranslationKey } from '@/lib/i18n';
import {
  Bell, Calendar, Clock, CreditCard, FileHeart, FileText, Home, MapPin,
  Pill, Shield, TestTube, Users, type LucideIcon,
} from 'lucide-react';

export interface PatientNavItem {
  label: TranslationKey;
  path: string;
  icon: LucideIcon;
}

/** The six primary patient destinations. */
export const PATIENT_NAV: PatientNavItem[] = [
  { label: 'home', path: '/patient/dashboard', icon: Home },
  { label: 'navHealthCard', path: '/patient/health-card', icon: CreditCard },
  { label: 'myReferrals', path: '/patient/referrals', icon: FileText },
  { label: 'myReports', path: '/patient/reports', icon: FileHeart },
  { label: 'myAppointments', path: '/patient/appointments', icon: Calendar },
  { label: 'myProfile', path: '/patient/profile', icon: Users },
];

/** Secondary patient pages, grouped under one "More" heading. */
export const PATIENT_MORE_NAV: PatientNavItem[] = [
  { label: 'findFacilities', path: '/patient/facilities', icon: MapPin },
  { label: 'medicines', path: '/patient/medicines', icon: Pill },
  { label: 'diagnostics', path: '/patient/diagnostics', icon: TestTube },
  { label: 'myTimeline', path: '/patient/timeline', icon: Clock },
  { label: 'followUpReminders', path: '/patient/followups', icon: Bell },
  { label: 'consentCenter', path: '/patient/privacy', icon: Shield },
];
