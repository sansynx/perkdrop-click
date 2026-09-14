import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "clean expired rate limits",
  { hours: 1 },
  internal.lifecycle.cleanupLimits,
);
crons.interval(
  "clean expired admin sessions",
  { hours: 1 },
  internal.lifecycle.cleanupSessions,
);
crons.interval(
  "expire stale resources",
  { hours: 1 },
  internal.lifecycle.processExpiry,
);
crons.interval(
  "mark ending soon offers",
  { hours: 1 },
  internal.lifecycle.markEndingSoon,
);
crons.interval(
  "trim discovery and check history",
  { hours: 1 },
  internal.lifecycle.cleanupHistory,
);
crons.cron(
  "discover new resources",
  "0 */3 * * *",
  internal.discovery.runScheduled,
);
crons.interval(
  "revalidate active resources",
  { hours: 2 },
  internal.revalidation.runScheduled,
);
export default crons;
