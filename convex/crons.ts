import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "reconcile abandoned profile image uploads",
  { hours: 24 },
  internal.profileImageCleanup.reconcileExpired,
  {},
);

crons.interval("prune expired privacy data", { hours: 1 }, internal.retention.prune, {});

crons.interval(
  "erase overdue accounts",
  { hours: 1 },
  internal.accountErasure.eraseDueAccounts,
  {},
);

export default crons;
