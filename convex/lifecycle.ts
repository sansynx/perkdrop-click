import { internalMutation } from './_generated/server'

export const processExpiry = internalMutation({ args: {}, handler: async (ctx) => {
  const now = Date.now()
  const active = await ctx.db.query('resources').withIndex('by_status', (index) => index.eq('status', 'active')).collect()
  for (const resource of active) if (resource.expiresAt && resource.expiresAt < now) await ctx.db.patch(resource._id, { status: 'expired', archivedAt: now, updatedAt: now })
  return { expired: active.filter((resource) => resource.expiresAt && resource.expiresAt < now).length }
} })
