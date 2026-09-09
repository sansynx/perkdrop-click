import { mutation } from './_generated/server'
import { v } from 'convex/values'

function isSafePublicUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    if (url.username || url.password) return false
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname) && !url.hostname.endsWith('.local')
  } catch { return false }
}

export const create = mutation({ args: { url: v.string(), anonymousId: v.string() }, handler: async (ctx, args) => {
  const url = args.url.trim()
  if (url.length > 2048 || !isSafePublicUrl(url)) throw new Error('Enter a valid public URL')
  if (args.anonymousId.length < 16 || args.anonymousId.length > 128) throw new Error('Invalid visitor identifier')
  return ctx.db.insert('submissions', { url, anonymousId: args.anonymousId, status: 'queued', createdAt: Date.now() })
}})
