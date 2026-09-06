import 'server-only'
import { BrandMemoryPayloadSchema, type BrandMemoryPayload } from '@sahoda/shared'

/**
 * A resolved Brand Brain, parked server-side until the customer confirms it.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * `resolveOnboarding` runs a real model call and hands the result to the
 * browser; `use-build.ts` saves it only after the reveal, through
 * `saveBrandMemory`. Close the tab, refresh, or lose the connection in between
 * and the output is gone. MEASURED 2026-09-05 (docs/51 Q-01): three
 * `ai_provider_logs` rows with status ok, zero `brand_memory` rows, and then
 * the daily free limit refused a fourth build with "try again tomorrow". A
 * phone tab that Android kills does exactly what the harness did.
 *
 * ── WHY A KEY-VALUE ENTRY AND NOT A `draft` ROW ──────────────────────────────
 * `brand_memory.status` admits `draft`, but every write to that table goes
 * through `resolve_brand_memory`, a definer RPC that only knows how to mint an
 * ACTIVE version, and a new RPC is a migration that production has to apply
 * before this fix does anything. The pending brain is transient by nature: it
 * exists between a build and its confirm, and a confirm makes it an active row
 * the ordinary way. Upstash already fronts this app (`lib/ops/rate-limit.ts`),
 * so the same REST pipeline holds it for a day, keyed by workspace.
 *
 * ── FAIL-SOFT, IN THE SAME DIRECTION AS THE RATE LIMIT ──────────────────────
 * No Upstash, a network error, or a value that no longer parses all read as
 * "nothing pending" and write as a no-op. That is today's behaviour exactly,
 * so a missing key can never make onboarding worse than it was; it can only
 * decline to make it better. Every miss is logged, never thrown.
 */

export type PendingBrainSource = 'resolved'

export interface PendingBrain {
  brain: BrandMemoryPayload
  source: PendingBrainSource
}

/** A day: long enough to come back tomorrow, short enough to forget a brand nobody claimed. */
export const PENDING_BRAIN_TTL_SECONDS = 86_400

function keyFor(workspaceId: string): string {
  return `sahoda:onboarding:pending-brain:${workspaceId}`
}

interface Upstash {
  url: string
  token: string
}

function upstash(env: Readonly<Record<string, string | undefined>> = process.env): Upstash | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

async function pipeline(store: Upstash, commands: unknown[][]): Promise<unknown[] | null> {
  const response = await fetch(`${store.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${store.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    cache: 'no-store',
  })
  if (!response.ok) return null
  const results: unknown = await response.json()
  return Array.isArray(results) ? results : null
}

/**
 * Whether a parked brain can exist at all in this deployment.
 *
 * The paid re-resolve is charged once per brain version and replayed for free
 * on a retry; the parked brain is what turns that replay into "hand back the
 * result" instead of "run the model again for nothing". Without the store the
 * guard silently allowed (BR-16). Money fails closed: the caller refuses a paid
 * run when this is false.
 */
export function hasPendingBrainStore(env?: Readonly<Record<string, string | undefined>>): boolean {
  return upstash(env) !== null
}

/** Park a freshly resolved brain. A no-op without a store; never throws. */
export async function savePendingBrain(workspaceId: string, pending: PendingBrain): Promise<void> {
  const store = upstash()
  if (!store) return
  try {
    await pipeline(store, [
      ['SET', keyFor(workspaceId), JSON.stringify(pending), 'EX', PENDING_BRAIN_TTL_SECONDS],
    ])
  } catch (error) {
    console.error('[pending-brain] save failed', error instanceof Error ? error.message : 'unknown')
  }
}

/** The parked brain for this workspace, or null: none, no store, or unparseable. */
export async function readPendingBrain(workspaceId: string): Promise<PendingBrain | null> {
  const store = upstash()
  if (!store) return null
  try {
    const results = await pipeline(store, [['GET', keyFor(workspaceId)]])
    const raw = (results?.[0] as { result?: unknown } | undefined)?.result
    if (typeof raw !== 'string' || raw === '') return null
    const parsed = JSON.parse(raw) as { brain?: unknown; source?: unknown }
    const brain = BrandMemoryPayloadSchema.safeParse(parsed.brain)
    if (!brain.success || parsed.source !== 'resolved') return null
    return { brain: brain.data, source: 'resolved' }
  } catch (error) {
    console.error('[pending-brain] read failed', error instanceof Error ? error.message : 'unknown')
    return null
  }
}

/** Forget the parked brain, once it has become an active row or been abandoned. */
export async function clearPendingBrain(workspaceId: string): Promise<void> {
  const store = upstash()
  if (!store) return
  try {
    await pipeline(store, [['DEL', keyFor(workspaceId)]])
  } catch (error) {
    console.error(
      '[pending-brain] clear failed',
      error instanceof Error ? error.message : 'unknown',
    )
  }
}
