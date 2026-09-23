import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "reconcile abandoned profile image uploads",
  { hours: 24 },
  internal.profileImageCleanup.reconcileExpired,
  {},
);

export default crons;
