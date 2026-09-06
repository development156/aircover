import type { ChatMessage, FetchLike } from './providers/types'
import { assertServerOnly } from './config'
import { CONTEXT_FETCH_TIMEOUT_MS } from './timeouts'

/**
 * WHAT SAHODA HAS NOTICED — the Marketing Brain, handed to a task as a third
 * grounded block beside the Brand Brain and the knowledge library.
 *
 * ── WHY A THIRD PROVIDER AND NOT A FOURTH FIELD ON THE BRAND BRAIN ──────────
 * docs/51 settled the split: the Brand Brain holds who a business SAYS it is,
 * the Marketing Brain holds what its numbers SHOW. Both are grounding, and they
 * are grounding of opposite kinds — one is a founder's own words and may never
 * be overwritten by a job, the other is arithmetic and is rewritten every week.
 * Folding the second into the first would put a weekly computation inside the
 * block that is cached per brand version, which is both wrong for the cache and
 * wrong for the guarantee.
 *
 * ── AND WHY IT IS NOT LIKE knowledge-context EITHER ─────────────────────────
 * There is no query. Knowledge passages are chosen from the brief because a
 * library has thousands of chunks and five of them are relevant; a workspace has
 * a handful of observations in total and every one of them bears on what to
 * write next. So this reads the latest few and hands them over whole — no
 * tsquery, no ranking, and none of the recall problem `buildKnowledgeQuery`
 * exists to work around.
 *
 * ── THE TENANT BOUNDARY IS THE FILTER, NOT RLS ──────────────────────────────
 * This reads with the SERVICE-ROLE key, which bypasses row-level security. The
 * `workspace_id=eq.` term in the URL is the ONLY thing keeping one business's
 * observations out of another's plan. Anything that edits this query is a
 * tenant-isolation change and is reviewed as one.
 */

/**
 * How many observations reach a prompt.
 *
 * Six, because that is more than a workspace has: the weekly pass writes at most
 * one row per subject per Sunday, and there is one subject today. The limit is a
 * ceiling against a future where six kinds all fire at once, not a selection
 * rule — if it ever starts truncating, the thing to add is an ordering that says
 * WHICH six, not a bigger number.
 */
export const MARKET_OBSERVATION_LIMIT = 6

/** A failed observation fetch. Carries the HTTP status only — never the service key. */
export class MarketContextError extends Error {
  constructor(readonly status: number) {
    super(`marketing_observations fetch failed with HTTP ${status}`)
    this.name = 'MarketContextError'
  }
}

export interface MarketContextProvider {
  /** What Sahoda has noticed, or null when it has noticed nothing. */
  get(workspaceId: string): Promise<ChatMessage | null>
}

/** One row, as this provider needs it. */
export interface ObservationLine {
  claim: string
  computedOn: string
}

/**
 * Observations → the grounding block.
 *
 * ── THE INSTRUCTION MATTERS MORE THAN THE CLAIMS ────────────────────────────
 * Handed a sentence like "you have stopped using exclamation marks", a model's
 * instinct is to REPEAT it back to the customer inside whatever it writes. That
 * would be Sahoda's own analysis leaking into a caption meant for the public.
 * The block therefore says what the claims are FOR — shaping what gets written —
 * and forbids the two failure modes explicitly: quoting them, and inventing new
 * ones. A model asked to write a plan from observations will otherwise happily
 * add a sixth observation of its own, phrased identically to the five real ones,
 * and nothing downstream can tell them apart.
 */
export function buildMarketMessage(rows: readonly ObservationLine[]): ChatMessage | null {
  if (rows.length === 0) return null
  const content = [
    'WHAT SAHODA HAS MEASURED about this business, computed from its own published',
    'posts. Let these shape what you plan and how you write it.',
    '',
    ...rows.map((row) => `- (${row.computedOn}) ${row.claim}`),
    '',
    'Do not quote these back to the reader: they are notes about the business, not',
    'copy for its audience. Do not state any other fact about how this business has',
    'performed. If it is not in the list above, it has not been measured.',
  ].join('\n')
  // Deliberately not `cache: true`: these are rewritten weekly, so a cached
  // prefix here would be a prefix that is never hit again.
  return { role: 'system', content }
}

export interface PostgrestMarketContextOptions {
  supabaseUrl: string
  /** Service-role key — server-only; never logged, never returned to a client. */
  serviceKey: string
  fetchImpl?: FetchLike
  /** Ceiling on the read, in ms. Defaults to CONTEXT_FETCH_TIMEOUT_MS. */
  timeoutMs?: number
}

interface ObservationRow {
  claim: string
  computed_on: string
}

export function createPostgrestMarketContext(
  opts: PostgrestMarketContextOptions,
): MarketContextProvider {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init))

  return {
    async get(workspaceId: string): Promise<ChatMessage | null> {
      assertServerOnly()
      const url =
        `${opts.supabaseUrl}/rest/v1/marketing_observations` +
        // THE TENANT BOUNDARY. See the header: RLS is bypassed by the service key.
        `?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
        `&select=claim,computed_on` +
        `&order=computed_on.desc` +
        `&limit=${MARKET_OBSERVATION_LIMIT}`
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
      if (!res.ok) throw new MarketContextError(res.status)

      const rows = (await res.json()) as ObservationRow[]
      return buildMarketMessage(
        rows.map((row) => ({ claim: row.claim, computedOn: row.computed_on })),
      )
    },
  }
}
