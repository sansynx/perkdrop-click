import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const reactionType = v.union(v.literal('claimed'), v.literal('works'), v.literal('expired'), v.literal('needs_card'), v.literal('region_issue'), v.literal('not_free'))

export const add = mutation({ args: { resourceId: v.id('resources'), reactionType, anonymousId: v.string(), country: v.optional(v.string()) }, handler: async (ctx, args) => {
  if (args.anonymousId.length < 16 || args.anonymousId.length > 128) throw new Error('Invalid visitor identifier')
  const existing = await ctx.db.query('resourceReactions').withIndex('by_visitor_reaction', (index) => index.eq('resourceId', args.resourceId).eq('anonymousId', args.anonymousId).eq('reactionType', args.reactionType)).unique()
  if (existing) return existing._id
  return ctx.db.insert('resourceReactions', { ...args, createdAt: Date.now(), updatedAt: Date.now() })
}})

export const getSummary = query({ args: { resourceId: v.id('resources') }, handler: async (ctx, args) => {
  const reactions = await ctx.db.query('resourceReactions').withIndex('by_resource', (index) => index.eq('resourceId', args.resourceId)).collect()
  return reactions.reduce<Record<string, number>>((summary, reaction) => { summary[reaction.reactionType] = (summary[reaction.reactionType] ?? 0) + 1; return summary }, {})
} })
