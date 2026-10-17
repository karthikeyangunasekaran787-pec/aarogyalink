// ============================================================================
// AarogyaLink — Appointment booking hook (Health Worker → patient → hospital)
// ----------------------------------------------------------------------------
// One hook behind the "Book Appointment for Patient" workflow. All scheduling
// answers come from the backend (src/convex/appAppointment.ts), which derives
// the caller's role, district and patient scope from the STORED session
// binding:
//
//   • bookingHospitals      — hospitals this caller may book into;
//   • hospitalDoctors       — eligible doctors of the SELECTED hospital;
//   • availableSlots        — the real free/taken grid for doctor + date;
//   • appointmentsBookedByMe— the bookings this staff member created;
//   • book / reschedule / cancel — mutations that re-validate everything and
//     only then write the appointment.
//
// There is deliberately NO offline booking: an appointment exists only once the
// hospital's schedule has stored it, so without a backend session the workflow
// explains that instead of pretending to confirm.
// ============================================================================

import { useCallback, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useBackendSession } from '@/hooks/use-backend-session';
import type { Appointment } from '@/types';
import type {
  BookingDoctor,
  BookingError,
  BookingHospital,
  SlotAvailability,
} from '@/lib/appointment-booking';

export type BookingAppointment = Appointment & { referralStatus?: string };

export interface BookingActionResult {
  ok: boolean;
  message: string;
  appointment?: Appointment;
  duplicate?: boolean;
  errors?: BookingError[];
}

interface BookingQueryArgs {
  patientId?: string;
  hospitalId?: string;
  doctorId?: string;
  date?: string;
}

function patientArg(patientId: string | undefined) {
  return patientId ? { patientCode: patientId } : {};
}

/** Hospitals the caller may book into, scoped by the backend. */
export function useBookingHospitals(patientId: string | undefined) {
  const session = useBackendSession();
  const bound = session !== undefined && session !== null;
  const data = useQuery(
    api.appAppointment.bookingHospitals,
    bound ? patientArg(patientId) : 'skip',
  );
  return {
    bound,
    loading: bound && data === undefined,
    hospitals: (data?.hospitals ?? []) as BookingHospital[],
    message: data?.message,
    ok: data?.ok === true,
  };
}

/** Eligible doctors at one hospital, with their consulting days and dates. */
export function useHospitalDoctors(hospitalId: string | undefined, patientId?: string) {
  const session = useBackendSession();
  const bound = session !== undefined && session !== null;
  const data = useQuery(
    api.appAppointment.hospitalDoctors,
    bound && hospitalId ? { hospitalId, ...patientArg(patientId) } : 'skip',
  );
  return {
    bound,
    loading: !!bound && !!hospitalId && data === undefined,
    doctors: (data?.doctors ?? []) as BookingDoctor[],
    hospitalName: data && data.ok ? data.hospital?.name : undefined,
    message: data?.message,
    ok: data?.ok === true,
  };
}

/** The real free/taken slot grid for one doctor and date. */
export function useAppointmentSlots(options: BookingQueryArgs) {
  const session = useBackendSession();
  const bound = session !== undefined && session !== null;
  const ready = !!options.hospitalId && !!options.doctorId && !!options.date;
  const data = useQuery(
    api.appAppointment.availableSlots,
    bound && ready
      ? {
          hospitalId: options.hospitalId as string,
          doctorId: options.doctorId as string,
          date: options.date as string,
          ...patientArg(options.patientId),
        }
      : 'skip',
  );
  return {
    bound,
    loading: !!bound && ready && data === undefined,
    slots: (data?.slots ?? []) as SlotAvailability[],
    doctorAvailable: data?.doctorAvailable === true,
    availableDates: (data && 'availableDates' in data ? data.availableDates : []) as string[],
    message: data?.message,
    ok: data?.ok === true,
  };
}

/** Appointments this staff member booked (the creator sees them anywhere). */
export function useMyBookedAppointments(enabled = true) {
  const session = useBackendSession();
  const bound = session !== undefined && session !== null;
  const data = useQuery(
    api.appAppointment.appointmentsBookedByMe,
    bound && enabled ? {} : 'skip',
  );
  return {
    bound,
    loading: !!bound && enabled && data === undefined,
    appointments: (data?.appointments ?? []) as BookingAppointment[],
    message: data?.message,
  };
}

/** The booking mutations, with their in-flight state. */
export function useAppointmentBookingActions() {
  const bookMutation = useMutation(api.appAppointment.bookAppointmentForPatient);
  const rescheduleMutation = useMutation(api.appAppointment.rescheduleAppointment);
  const cancelMutation = useMutation(api.appAppointment.cancelAppointment);
  const session = useBackendSession();
  const bound = session !== undefined && session !== null;

  const [isBooking, setIsBooking] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const book = useCallback(
    async (input: {
      patientId: string;
      hospitalId: string;
      doctorId: string;
      date: string;
      time: string;
      reason: string;
      referralId?: string;
      idempotencyKey: string;
    }): Promise<BookingActionResult> => {
      if (!bound) {
        return {
          ok: false,
          message:
            'Reconnect to book — an appointment is only confirmed once the hospital’s schedule saves it.',
        };
      }
      setIsBooking(true);
      try {
        const result = (await bookMutation({
          patientCode: input.patientId,
          hospitalId: input.hospitalId,
          doctorId: input.doctorId,
          date: input.date,
          time: input.time,
          reason: input.reason,
          referralId: input.referralId,
          idempotencyKey: input.idempotencyKey,
        })) as unknown as BookingActionResult;
        return result;
      } catch {
        return {
          ok: false,
          message: 'Network unavailable — the appointment was not booked. Reconnect and try again.',
        };
      } finally {
        setIsBooking(false);
      }
    },
    [bound, bookMutation],
  );

  const reschedule = useCallback(
    async (input: { appointmentId: string; date: string; time: string; reason?: string }): Promise<BookingActionResult> => {
      if (!bound) {
        return { ok: false, message: 'Reconnect to reschedule this appointment.' };
      }
      setIsMutating(true);
      try {
        return (await rescheduleMutation(input)) as unknown as BookingActionResult;
      } catch {
        return { ok: false, message: 'Network unavailable — the appointment was not rescheduled.' };
      } finally {
        setIsMutating(false);
      }
    },
    [bound, rescheduleMutation],
  );

  const cancel = useCallback(
    async (input: { appointmentId: string; reason?: string }): Promise<BookingActionResult> => {
      if (!bound) {
        return { ok: false, message: 'Reconnect to cancel this appointment.' };
      }
      setIsMutating(true);
      try {
        return (await cancelMutation(input)) as unknown as BookingActionResult;
      } catch {
        return { ok: false, message: 'Network unavailable — the appointment was not cancelled.' };
      } finally {
        setIsMutating(false);
      }
    },
    [bound, cancelMutation],
  );

  return { bound, isBooking, isMutating, book, reschedule, cancel };
}
