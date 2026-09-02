import { BrandMemoryPayloadSchema } from '@sahoda/shared'
import type { BrandMemoryPayload } from '@sahoda/shared'
import type { ChatMessage, FetchLike } from './providers/types'
import { assertServerOnly } from './config'
import { CONTEXT_FETCH_TIMEOUT_MS } from './timeouts'

/** The active Brand Brain rendered as a cache-controlled prefix, plus its version (the cache key). */
export interface BrandContext {
  version: number
  message: ChatMessage
}

export interface BrandContextProvider {
  /** The active Brand Brain prefix for a workspace, or null if none is resolved yet. */
  get(workspaceId: string): Promise<BrandContext | null>
}

/** A failed brand_memory fetch. Carries the HTTP status only — never the service key. */
export class BrandContextError extends Error {
  constructor(readonly status: number) {
    super(`brand_memory fetch failed with HTTP ${status}`)
    this.name = 'BrandContextError'
  }
}

/**
 * Render the Brand Brain into a compact grounding block — the model should write
 * IN this brand, not restate it. Marked `cache: true` so the provider caches these
 * stable prefix tokens (the block only changes on a Brain version bump).
 */
export function buildBrandMessage(payload: BrandMemoryPayload): ChatMessage {
  const { voice, brand_persona, customer_persona, hook, taboo } = payload
  const lines = [
    'BRAND BRAIN — write every line grounded in this brand; do not restate it back.',
    `Voice: ${voice.descriptor} (${voice.formality_label}).`,
    `Signature phrases: ${voice.signature_phrases.join(' · ')}.`,
    voice.banned_phrases.length ? `Never use: ${voice.banned_phrases.join(', ')}.` : '',
    `Brand: ${brand_persona.archetype} — ${brand_persona.one_liner} Values: ${brand_persona.core_values.join(', ')}.`,
    `Customer: ${customer_persona.one_liner} Pain: ${customer_persona.primary_pain_point}. Fear: ${customer_persona.primary_fear}. Wants to feel: ${customer_persona.desired_identity}.`,
    `Hook: ${hook.core_promise} (emotion: ${hook.primary_emotion}).`,
    taboo.red_lines.length ? `Red lines (never cross): ${taboo.red_lines.join('; ')}.` : '',
  ].filter(Boolean)
  return { role: 'system', content: lines.join('\n'), cache: true }
}

export interface PostgrestBrandContextOptions {
  supabaseUrl: string
  /** Service-role key — server-only; never logged, never returned to a client. */
  serviceKey: string
  fetchImpl?: FetchLike
  /** Ceiling on the read, in ms. Defaults to CONTEXT_FETCH_TIMEOUT_MS. */
  timeoutMs?: number
}

interface BrandRow {
  version: number
  payload: unknown
}

/**
 * Fetches the active brand_memory via PostgREST with the service-role key (the
 * table is member-read; jobs/server actions use the service key) and caches the
 * built prefix keyed by `${workspaceId}:${version}` — a Brain version bump yields a
 * new key and refreshes the block. The provider prompt cache (cache:true) is the
 * primary token-cost saver; this in-process cache just skips rebuilding the string.
 * Server-only. A malformed active payload is treated as "no usable brain" (null) so
 * a corrupt row can never inject garbage into a prompt.
 */
export function createPostgrestBrandContext(
  opts: PostgrestBrandContextOptions,
): BrandContextProvider {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init))
  const cache = new Map<string, ChatMessage>()

  return {
    async get(workspaceId: string): Promise<BrandContext | null> {
      assertServerOnly()
      const url =
        `${opts.supabaseUrl}/rest/v1/brand_memory` +
        `?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
        `&status=eq.active&select=version,payload&limit=1`
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          apikey: opts.serviceKey,
          authorization: `Bearer ${opts.serviceKey}`,
          accept: 'application/json',
        },
        // A grounding read is best-effort and a person is waiting on it. Past
        // the ceiling the runner proceeds without this block.
        signal: AbortSignal.timeout(opts.timeoutMs ?? CONTEXT_FETCH_TIMEOUT_MS),
      })
      if (!res.ok) throw new BrandContextError(res.status)

      const rows = (await res.json()) as BrandRow[]
      const row = rows[0]
      if (!row) return null

      const key = `${workspaceId}:${row.version}`
      let message = cache.get(key)
      if (!message) {
        const parsed = BrandMemoryPayloadSchema.safeParse(row.payload)
        if (!parsed.success) return null
        message = buildBrandMessage(parsed.data)
        cache.set(key, message)
      }
      return { version: row.version, message }
    },
  }
}
