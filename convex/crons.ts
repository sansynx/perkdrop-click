import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()
crons.interval('expire stale resources', { hours: 1 }, internal.lifecycle.processExpiry)
crons.interval('discover new resources', { hours: 6 }, internal.discovery.runScheduled)
crons.interval('revalidate active resources', { hours: 12 }, internal.revalidation.runScheduled)
export default crons
