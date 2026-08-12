import 'server-only'

import { crawlSite, quarantineCorpus, type CrawlFailureReason } from '@sahoda/research'
import type { CrawlOutcome, FirecrawlClient } from '@sahoda/research'
import type { BrandExtractOutput, ExtractedField, MeshContext, ResolveInput } from '@sahoda/shared'

/**
 * The URL door, composed (doc 18 §5): crawl → quarantine → extract.
 *
 * Composition lives here rather than in either package because it is the only
 * place that legitimately knows about both: `@sahoda/research` acquires and
 * never calls a model; `@sahoda/mesh` calls models and never fetches a page.
 *
 * Everything this returns is UNCONFIRMED. Nothing here writes a Brand Brain,
 * and nothing here decides that an extracted sentence is true — that is the
 * founder's to do, on a screen that shows them what we read and where.
 */

export type UrlDoorOutcome =
  | {
      ok: true
      fields: ExtractedField[]
      /** Verbatim page text that tried to address the system. Telemetry, not a control. */
      instructionAttempts: string[]
      gaps: string[]
      pagesRead: string[]
      pagesSkipped: string[]
      firecrawlCredits: number
    }
  | {
      ok: false
      reason: CrawlFailureReason | 'extract_failed'
      /** Founder-facing. Always falls back to asking; never invents a voice. */
      message: string
      firecrawlCredits: number
    }

/** Just enough of the mesh to run one task — injected so this is testable. */
export interface ExtractRunner {
  run(
    input: { corpus: string; name: string },
    ctx: MeshContext,
  ): Promise<{ ok: true; data: BrandExtractOutput } | { ok: false }>
}

export interface UrlDoorOptions {
  client: FirecrawlClient
  extract: ExtractRunner
  ctx: MeshContext
  /** Injected only by tests that need to assert on a pre-built crawl. */
  crawl?: (url: string) => Promise<CrawlOutcome>
}

export async function openUrlDoor(
  url: string,
  name: string,
  opts: UrlDoorOptions,
): Promise<UrlDoorOutcome> {
  const crawl = opts.crawl ?? ((target: string) => crawlSite(target, { client: opts.client }))
  const outcome = await crawl(url)

  if (!outcome.ok) {
    // Pass the crawl's own sentence through unchanged. Each reason is a
    // different thing to say, and flattening them here would undo that.
    return {
      ok: false,
      reason: outcome.reason,
      message: outcome.message,
      firecrawlCredits: outcome.creditsUsed,
    }
  }

  const corpus = quarantineCorpus(outcome.pages)
  const result = await opts.extract.run({ corpus, name }, opts.ctx)

  if (!result.ok) {
    // The pages were readable and the model was not. Say that, and ask — a
    // fallback payload here would be the invented voice doc 18 §5 forbids.
    return {
      ok: false,
      reason: 'extract_failed',
      message:
        'Read your website, but could not turn it into a brand just now — tell us in your own words instead.',
      firecrawlCredits: outcome.creditsUsed,
    }
  }

  return {
    ok: true,
    fields: result.data.fields,
    instructionAttempts: result.data.instruction_attempts,
    gaps: result.data.gaps,
    pagesRead: outcome.pages.map((page) => page.url),
    pagesSkipped: outcome.skipped,
    firecrawlCredits: outcome.creditsUsed,
  }
}

/**
 * Fold extracted fields into a ResolveInput.
 *
 * READ THIS BEFORE CALLING IT. `ResolveInput` is the frozen intake contract and
 * it has NO home for a `confirmed` flag — every field in it looks alike once it
 * is in there. So the moment extracted text lands in `source.one_liner` it is
 * indistinguishable from a sentence the founder typed, and a Brain resolved off
 * it will read `moderate` with no record that no human ever agreed.
 *
 * That is a fake-confirmation state, so this function is NOT wired into the
 * resolve path. It exists for (a) the arm-D measurement and (b) the screen that
 * will show extracted fields for approval, which must call it only with fields
 * a human has ticked. Passing raw extractor output to a real signup would
 * launder a guess into a fact.
 */
export function applyExtractedFields(
  base: ResolveInput,
  fields: readonly ExtractedField[],
): ResolveInput {
  // Immutable: build a new input, never mutate the caller's.
  const next: ResolveInput = {
    source: { ...base.source },
    customer: { ...base.customer },
    brand: { ...base.brand },
    hook: { ...base.hook },
    voice: { ...base.voice },
    taboo: { ...base.taboo },
  }

  for (const field of fields) {
    const channel = next[field.channel] as Record<string, unknown>
    // Only fill keys the frozen contract actually has, and never overwrite
    // something a human already wrote — founder input outranks a crawl.
    if (!(field.key in channel)) continue
    const current = channel[field.key]
    if (typeof current !== 'string' || current.length > 0) continue
    channel[field.key] = field.value
  }

  return next
}
