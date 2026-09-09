import { query } from './_generated/server'
import { v } from 'convex/values'

export const list = query({ args: { search: v.optional(v.string()), category: v.optional(v.string()), audience: v.optional(v.string()), limit: v.optional(v.number()) }, handler: async (ctx, args) => {
  const rows = await ctx.db.query('resources').withIndex('by_status', (index) => index.eq('status', 'active')).order('desc').take(args.limit ?? 30)
  const search = args.search?.trim().toLowerCase()
  return rows.filter((resource) => (!args.category || args.category === 'Everything' || resource.category === args.category) && (!search || `${resource.title} ${resource.description} ${resource.category} ${resource.resourceType}`.toLowerCase().includes(search)))
}})

export const get = query({ args: { slug: v.string() }, handler: async (ctx, args) => ctx.db.query('resources').withIndex('by_slug', (index) => index.eq('slug', args.slug)).unique() })
