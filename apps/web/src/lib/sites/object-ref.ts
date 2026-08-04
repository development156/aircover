import { randomUUID } from 'node:crypto'

/**
 * Fresh ref for one `site_generate` charge (100 credits). **Server-derived
 * only**, fresh per invocation — a stable ref would replay a spent HOLD+DEBIT
 * (free generation) while still running the paid model call. Mirrors
 * `lib/posts/object-ref.ts`, where the full reasoning lives.
 */
export function newSiteGenerateRef(workspaceId: string): string {
  return `${workspaceId}:site_generate:${randomUUID()}`
}
