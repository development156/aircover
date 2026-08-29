import 'server-only'

import { createThenIndex } from '@/lib/knowledge/ingest'
import { reportServerError } from '@/lib/observability/report'

/**
 * The website read at signup becomes the first document in the library.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * MEASURED in production on 2026-08-29: THREE documents across all 33
 * workspaces, in the product's lifetime. Two belong to one workspace and one of
 * those two is an Instagram login wall. The library is not under-used; it is
 * undiscovered, and a library nobody fills cannot ground a single sentence.
 *
 * Signup already reads the customer's website — the door crawls up to five
 * pages and hands the text to `brand_extract`. That text was then thrown away.
 * This keeps it. Nobody is asked, because a step somebody has to find is the
 * thing that produced the three.
 *
 * ── IT REUSES THE READ AND FETCHES NOTHING ──────────────────────────────────
 * The `text` handed here is the crawl the door already paid for, so this costs
 * no request, no model call and no credit. It is also RICHER than the same site
 * added by hand: the library's own URL door fetches one page, the door crawls
 * up to five.
 *
 * ── IT CAN NEVER FAIL SIGNUP ────────────────────────────────────────────────
 * Every outcome is a returned word and nothing throws. A customer whose library
 * seed failed must still reach the end of onboarding with their brand resolved:
 * the seed is a bonus taken from work already done, and a bonus that can break
 * the thing it rides on is not a bonus. The caller ignores the result and the
 * type exists for the tests and the logs.
 *
 * ── AND IT IS NOT A SECOND ROUTE INTO THE LIBRARY ───────────────────────────
 * `createThenIndex` is the same function the three visible doors use, so a
 * document seeded here is indistinguishable from one a person added: same row
 * shape, same passages, same failure codes on the same screen, and `Delete`
 * removes it like any other. Re-running the door re-reads the same address,
 * which `create_knowledge_document` resolves by replacing the existing URL
 * document rather than growing a duplicate.
 */

export type SeedOutcome =
  /** A document row exists and carries passages. */
  | 'seeded'
  /** Nothing was attempted: no address, or too little text to be worth a row. */
  | 'skipped'
  /** It was attempted and did not produce a usable document. */
  | 'failed'

/**
 * The floor, and why it is not the PDF door's 40.
 *
 * `extract-pdf.ts` refuses under 40 characters because that is the boundary
 * between "a picture of a menu" and "text". This is a different question: the
 * text is already known to be text, and the question is whether it is a BUSINESS
 * or a wall. MEASURED, the Instagram document in production is 74 characters —
 * "See everyday moments from your close friends. Log into Instagram" — and a 40
 * floor would have let it through.
 *
 * 200 characters is about three sentences. Below that a page has not said
 * enough about a business to ground a claim, and seeding it would put a
 * confident "Indexed" row in a library on the strength of a login prompt.
 *
 * A person can still add such a page by hand through the library's own door.
 * This is the floor for the seed nobody asked for, which must be more cautious
 * than the one somebody chose.
 */
export const MIN_SEED_CHARS = 200

export interface SeedLibraryInput {
  workspaceId: string
  /** The address the customer gave, already normalised by the door. */
  url: string
  /** The text the door's crawl produced. Not re-fetched. */
  text: string
  /** What to call it. The hostname, when the crawl found nothing better. */
  title?: string | null
}

export async function seedLibraryFromSite(
  input: SeedLibraryInput,
  /** Injected so the test can watch the seam without a database. */
  ingest: typeof createThenIndex = createThenIndex,
): Promise<SeedOutcome> {
  try {
    const url = input.url.trim()
    if (!url) return 'skipped'
    if (input.text.trim().length < MIN_SEED_CHARS) return 'skipped'

    const result = await ingest(
      {
        workspaceId: input.workspaceId,
        title: (input.title ?? '').trim() || hostnameOf(url) || url,
        sourceKind: 'url',
        sourceRef: url,
      },
      async () => ({ ok: true, text: input.text, title: input.title ?? null }),
    )

    return result.ok ? 'seeded' : 'failed'
  } catch (error) {
    /**
     * Swallowed ON PURPOSE, and reported so it is not silent. The alternative
     * is a customer who finished the door, watched their brand resolve, and
     * then saw onboarding break over a library row they never asked for.
     */
    reportServerError(error, {
      action: 'onboarding.seedLibrary',
      workspaceId: input.workspaceId,
    })
    return 'failed'
  }
}

/** "https://trainx.in/about" → "trainx.in". Never throws on a malformed address. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
