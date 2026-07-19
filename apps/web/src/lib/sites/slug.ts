import { randomBytes } from 'node:crypto'
import { slugify } from '@sahoda/sites'

/**
 * Draft slug: `slugify(name)` + a random hex suffix. `sites.slug` is GLOBALLY
 * unique but RLS only shows this workspace's rows, so `resolveSlug`'s
 * taken-walk cannot work from the member client — and probing other tenants'
 * slugs would be an information leak even if it could. A 6-hex suffix makes
 * collisions negligible without probing anything. Pretty tenant-chosen slugs
 * need a service-side uniqueness RPC (filed in REQUESTS.md) and only matter at
 * DEPLOY time — this slug names a draft preview.
 */
export function draftSlug(name: string): string {
  const base = slugify(name) || 'site'
  return `${base}-${randomBytes(3).toString('hex')}`
}
