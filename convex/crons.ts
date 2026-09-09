import { cronJobs } from 'convex/server'

const crons = cronJobs()
crons.interval('expire stale resources', { hours: 1 }, { internalFunction: 'lifecycle:processExpiry' })
crons.interval('discover new resources', { hours: 6 }, { internalFunction: 'discovery:runScheduled' })
crons.interval('revalidate active resources', { hours: 12 }, { internalFunction: 'revalidation:runScheduled' })
export default crons
