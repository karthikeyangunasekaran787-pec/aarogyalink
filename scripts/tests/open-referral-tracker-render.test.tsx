/**
 * Render smoke test for the Open Referral Tracker — run with: bun test
 *
 * Executes the real component through react-dom/server with the REAL
 * translation hook and the real next-action rules, so a broken import, a bad
 * hook or a crash in a row fails here instead of producing a blank dashboard.
 *
 * It pins what the panel promises:
 *   • every open referral shows the ONE step it waits for, and who owes it;
 *   • an overdue step is called out as overdue;
 *   • finished referrals are absent, and an empty scope says so.
 *
 * The dates are relative to the real clock because the component reads "now"
 * itself — that is exactly the wiring under test.
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';

import { OpenReferralTracker } from '../../src/components/shared/OpenReferralTracker';
import type { Referral, ReferralEvent } from '../../src/types';

const isoDate = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 864e5).toISOString().slice(0, 10);

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
  status: 'scheduled',
  currentStep: 4,
  totalSteps: 9,
  appointmentDate: isoDate(-2),
  appointmentTime: '09:00',
  createdAt: new Date(Date.now() - 5 * 864e5).toISOString(),
  updatedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
  isOverdue: true,
};

const events: ReferralEvent[] = [
  {
    id: 'e1',
    referralId: 'r1',
    status: 'scheduled',
    newStatus: 'scheduled',
    timestamp: new Date(Date.now() - 4 * 864e5).toISOString(),
    description: '',
    performedBy: 'Admin',
  },
];

const render = (referrals: Referral[]) =>
  renderToString(<OpenReferralTracker referrals={referrals} events={events} />);

describe('open referral tracker panel', () => {
  test('shows the referral, its next step, who owes it and that it is overdue', () => {
    const html = render([base]);

    expect(html).toContain('Lakshmi Devi');
    expect(html).toContain('REF-PDK-0007');
    expect(html).toContain('Pudukkottai General Hospital');
    // The step comes from the canonical workflow, not from a local guess.
    expect(html).toContain('Next step');
    expect(html).toContain('Verify Arrival');
    expect(html).toContain('Waiting on');
    expect(html).toContain('Destination hospital');
    expect(html).toContain('Overdue');
    // The next step is not a step the engine would refuse here.
    expect(html).not.toContain('Complete consultation');
  });

  test('a referral still inside its appointment window is on track', () => {
    const html = render([{ ...base, appointmentDate: isoDate(2), isOverdue: false }]);
    expect(html).toContain('Verify Arrival');
    expect(html).not.toContain('Overdue');
  });

  test('a missed referral waits on contacting the patient', () => {
    const html = render([{
      ...base,
      id: 'r2',
      referralId: 'REF-PDK-0008',
      status: 'missed',
      missedAt: new Date(Date.now() - 2 * 864e5).toISOString(),
      missedReason: 'transport',
      appointmentDate: isoDate(-3),
    }]);
    expect(html).toContain('Record contact');
    expect(html).toContain('Either hospital');
    expect(html).toContain('Follow-up queue');
  });

  test('only open referrals are listed', () => {
    const closed: Referral = { ...base, id: 'r9', referralId: 'REF-PDK-0009', patientName: 'Meena Kumari', status: 'closed' };
    const html = render([closed]);
    expect(html).not.toContain('Meena Kumari');
    expect(html).toContain('No active referrals');
  });

  test('a scope with nothing waiting says so instead of showing numbers', () => {
    const html = render([]);
    expect(html).toContain('No active referrals');
    expect(html).not.toContain('Next step');
  });
});
