import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "reconcile abandoned profile image uploads",
  { hours: 24 },
  internal.profileImageCleanup.reconcileExpired,
  {},
);
crons.interval(
  "reconcile abandoned profile media uploads",
  { hours: 24 },
  internal.profileMediaCleanup.reconcileExpired,
  {},
);

export default crons;
