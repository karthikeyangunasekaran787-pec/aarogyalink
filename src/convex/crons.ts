// ============================================================================
// AarogyaLink — scheduled jobs
// ----------------------------------------------------------------------------
// The missed-referral sweep only ever marks an overdue appointment as AWAITING
// CONFIRMATION (never "missed"), and it is idempotent, so running it on a
// schedule cannot produce duplicate records or repeated notifications.
// ============================================================================

import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval(
  'missed-referral-sweep',
  { minutes: 15 },
  internal.appFollowup.sweepOverdueReferrals,
  {},
);

export default crons;
