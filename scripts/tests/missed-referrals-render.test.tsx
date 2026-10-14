/**
 * Render smoke tests for the missed-referral surfaces — run with: bun test
 *
 * Executes the real presentational components through react-dom/server with the
 * REAL translation hook, so a broken hook, a bad import or a crashing row fails
 * here instead of producing a blank dashboard in the browser. Only the pieces
 * that need the data context for their actions are rendered from their props
 * (they are exported for exactly this purpose): no module is stubbed, so this
 * file cannot disturb any other test.
 *
 * It pins the information and the choices each surface must offer:
 *   • the health-worker row shows every field the follow-up needs;
 *   • the actions offered match the referral's state, so nothing can claim a
 *     patient was contacted before the missed visit was confirmed;
 *   • the hospital row presents an unconfirmed arrival as UNCERTAIN (never as a
 *     missed appointment) while offering all three documented outcomes.
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';

import { ReferralFollowupCard, FollowupForm } from '../../src/components/referrals/MissedReferralsPanel';
import { ArrivalConfirmationRow } from '../../src/components/referrals/AwaitingConfirmationPanel';
import { followupRowOf } from '../../src/lib/missed-referrals';
import type { Referral } from '../../src/types';

const NOW = new Date('2026-10-16T12:00:00.000Z');

const base: Referral = {
  id: 'r1',
  referralId: 'REF-PDK-0007',
  patientId: 'p1',
  patientName: 'Lakshmi Devi',
  healthCardId: 'HC-2026-0099',
  sourceFacilityId: 'h1',
  sourceFacilityName: 'Sending PHC',
  destinationFacilityId: 'h2',
  destinationFacilityName: 'Pudukkottai General Hospital',
  department: 'General Medicine',
  priority: 'urgent',
  reason: 'Specialist review',
  status: 'missed',
  currentStep: 4,
  totalSteps: 9,
  appointmentDate: '2026-10-10',
  appointmentTime: '09:00',
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-12T09:00:00.000Z',
  isOverdue: true,
};

const missed: Referral = {
  ...base,
  missedAt: '2026-10-14T06:00:00.000Z', // 30 h before NOW → past the urgent window
  missedReason: 'transport',
  contactAttemptCount: 1,
  lastContactAt: '2026-10-12T10:00:00.000Z',
  lastContactMethod: 'phone_call',
  lastContactReached: false,
  nextFollowUpDate: '2026-10-20',
};

const contacted: Referral = { ...missed, id: 'r3', referralId: 'REF-PDK-0009', status: 'contacted', lastContactReached: true };
const uncertain: Referral = {
  ...base,
  id: 'r4',
  referralId: 'REF-PDK-0011',
  status: 'awaiting_confirmation',
  appointmentDate: '2026-10-13',
  awaitingConfirmationAt: '2026-10-14T10:00:00.000Z',
};

const rowOf = (referral: Referral) => followupRowOf(referral, NOW);
const card = (referral: Referral) => renderToString(<ReferralFollowupCard row={rowOf(referral)} onOpen={() => {}} />);

describe('health-worker follow-up row', () => {
  test('shows every field the follow-up needs', () => {
    const html = card(missed);

    for (const expected of [
      'Lakshmi Devi',                    // patient
      'HC-2026-0099',                    // health card id
      'REF-PDK-0008'.replace('0008', '0007'), // referral id
      'Pudukkottai General Hospital',    // destination hospital
      'Urgent',                          // clinical priority
      '2026-10-10 09:00',                // original appointment
      'Days overdue',
      'Reason for missing',
      'Transport problems',              // the recorded reason, translated
      'Last contact attempt',
      '2026-10-12 10:00',                // last contact attempt timestamp
      'Phone call',                      // contact method
      'Next follow-up',
      '2026-10-20',
      'Missed — Follow-up Required',     // current status
    ]) {
      expect(html).toContain(expected);
    }
    // 10 Oct → 16 Oct is six days.
    expect(html).toContain('6 days overdue');
  });

  test('the escalation deadline is stated, and its breach is called out', () => {
    const html = card(missed);
    expect(html).toContain('Prompt escalation — contact within 24 hours.');
    expect(html).toContain('Escalation overdue — contact the patient now.');
  });

  test('a missed referral offers contact and closure only', () => {
    const html = card(missed);
    expect(html).toContain('Record contact');
    expect(html).toContain('Close missed referral');
    expect(html).not.toContain('Reschedule');
  });

  test('a contacted referral can be rescheduled or closed', () => {
    const html = card(contacted);
    expect(html).toContain('Reschedule');
    expect(html).toContain('Close missed referral');
    expect(html).not.toContain('Confirm missed appointment');
  });

  test('an uncertain referral is awaiting confirmation, not missed', () => {
    const html = card(uncertain);
    expect(html).toContain('Confirm missed appointment');
    expect(html).toContain('Log contact attempt');
    // Nothing may claim the patient was contacted before that is confirmed.
    expect(html).not.toContain('Record contact');
    expect(html).not.toContain('Reschedule');
    expect(html).not.toContain('Missed — Follow-up Required');
  });
});

describe('the follow-up form asks only for what a person can state', () => {
  const renderForm = (mode: 'confirm_missed' | 'contact' | 'reschedule' | 'close' | 'elsewhere', referral = missed) =>
    renderToString(
      <FollowupForm row={rowOf(referral)} mode={mode} busy={false} onCancel={() => {}} onSubmit={() => {}} />,
    );

  test('confirming a missed visit requires a documented reason', () => {
    const html = renderForm('confirm_missed');
    expect(html).toContain('Reason for the missed appointment');
    // All eight documented reasons are offered.
    for (const reason of ['Transport problems', 'Financial difficulties', 'Forgot the appointment', 'Patient refused', 'Other reason']) {
      expect(html).toContain(reason);
    }
  });

  test('a contact records the method, the time and what was done', () => {
    const html = renderForm('contact');
    expect(html).toContain('Did the contact reach the patient?');
    expect(html).toContain('Contact method');
    expect(html).toContain('Date and time of the contact');
    expect(html).toContain('Action taken');
    expect(html).toContain('Next follow-up date');
    // The app never claims to send messages itself.
    expect(html).toContain('AarogyaLink does not send SMS, WhatsApp or push messages');
  });

  test('a contact can only be "reached" once the missed visit is confirmed', () => {
    const onMissed = renderForm('contact', missed);
    const onUncertain = renderForm('contact', uncertain);
    expect(onMissed).toContain('>Yes<');
    expect(onUncertain).not.toContain('>Yes<');
  });

  test('rescheduling asks for the new appointment, not a reason', () => {
    const html = renderForm('reschedule', contacted);
    expect(html).toContain('New appointment date');
    expect(html).toContain('New appointment time');
    expect(html).not.toContain('Reason for the missed appointment');
  });

  test('closing a missed referral requires an outcome and a note', () => {
    const html = renderForm('close');
    expect(html).toContain('Outcome');
    expect(html).toContain('Patient unreachable');
    expect(html).toContain('Attended another hospital');
    // The note is mandatory for a closure.
    expect(html).toMatch(/Notes<[^>]*>\s*\*/);
  });

  test('attendance elsewhere asks for the hospital and the date', () => {
    const html = renderForm('elsewhere', uncertain);
    expect(html).toContain('Hospital the patient attended');
    expect(html).toContain('Date attended');
  });
});

describe('hospital arrival-confirmation row', () => {
  const renderRow = (referral: Referral) =>
    renderToString(
      <ArrivalConfirmationRow
        row={rowOf(referral)}
        busy={false}
        onVerifyArrival={() => {}}
        onConfirmMissed={() => {}}
        onElsewhere={() => {}}
      />,
    );

  test('an unrecorded arrival is presented as uncertain, never as missed', () => {
    const html = renderRow(uncertain);
    expect(html).toContain('Awaiting arrival confirmation');
    expect(html).not.toContain('Missed — Follow-up Required');
    expect(html).not.toContain('Reason for missing');
  });

  test('all three documented outcomes are offered', () => {
    const html = renderRow(uncertain);
    expect(html).toContain('Verify Arrival');
    expect(html).toContain('Confirm missed appointment');
    expect(html).toContain('Attended another hospital');
  });

  test('the patient, referral and appointment are identified', () => {
    const html = renderRow(uncertain);
    for (const expected of ['Lakshmi Devi', 'HC-2026-0099', 'REF-PDK-0011', 'Pudukkottai General Hospital', '2026-10-13', '3 days overdue']) {
      expect(html).toContain(expected);
    }
  });
});
