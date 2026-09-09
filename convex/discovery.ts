import { action, internalAction } from './_generated/server'
import { v } from 'convex/values'
import { searchForResources } from './lib/firecrawl'

export const run = action({ args: { query: v.string() }, handler: async (_ctx, args) => searchForResources(args.query) })
export const runScheduled = internalAction({ args: {}, handler: async () => ({ ok: true }) })
