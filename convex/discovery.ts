import { action } from './_generated/server'
import { v } from 'convex/values'
import { searchForResources } from './lib/firecrawl'

export const run = action({ args: { query: v.string() }, handler: async (_ctx, args) => searchForResources(args.query) })
