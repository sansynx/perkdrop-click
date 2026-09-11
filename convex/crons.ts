import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "clean expired rate limits",
  { hours: 1 },
  internal.lifecycle.cleanupLimits,
);
crons.interval(
  "expire stale resources",
  { hours: 1 },
  internal.lifecycle.processExpiry,
);
crons.cron(
  "discover new resources",
  "0 */3 * * *",
  internal.discovery.runScheduled,
);
crons.interval(
  "revalidate active resources",
  { hours: 12 },
  internal.revalidation.runScheduled,
);
export default crons;
