import 'server-only'

import { crawlSite, quarantineCorpus, type CrawlFailureReason } from '@sahoda/research'
import type { CrawlOutcome, FirecrawlClient } from '@sahoda/research'
import { attachProvenance, attachSingleSource } from '@sahoda/shared'
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
    input: {
      corpus?: string
      name: string
      file?: { filename: string; dataUrl: string }
      annotations?: unknown[]
    },
    ctx: MeshContext,
  ): Promise<{ ok: true; data: BrandExtractOutput; annotations?: unknown[] } | { ok: false }>
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

  // The model cited page INDICES; provenance is resolved from our own list, so
  // a source_url can never be one the model remembered rather than read.
  const sources = outcome.pages.map((page) => page.url)
  return {
    ok: true,
    fields: attachProvenance(result.data.fields, sources),
    instructionAttempts: result.data.instruction_attempts,
    gaps: result.data.gaps,
    pagesRead: sources,
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


// ── the UPLOAD door ───────────────────────────────────────────────────────────

/**
 * Why an upload door at all: doc 18 §5 lists three doors, and upload is the one
 * for "brands with a brand book; agencies inheriting one". A brand book states
 * red lines explicitly — the load-bearing half — where a website only implies
 * them.
 */

/** Same shape as the crawl's failure taxonomy, for the same reason: each arm is a different sentence. */
export type UploadFailureReason =
  | 'no_file'
  | 'not_pdf'
  | 'too_large'
  | 'unreadable'
  | 'extract_failed'

export type UploadDoorOutcome =
  | {
      ok: true
      fields: ExtractedField[]
      instructionAttempts: string[]
      gaps: string[]
      /**
       * The provider's record of the parse. Replaying it on a later call makes
       * the provider reuse the parse instead of charging to read the same book
       * again — so a re-resolve is free. NOTE: free per SESSION only. Persisting
       * it needs a store that does not exist yet, and brand_memory is the wrong
       * home for it.
       */
      annotations: unknown[]
    }
  | { ok: false; reason: UploadFailureReason; message: string }

/**
 * A brand book is not a web page: 40 pages of parsed text arrives through the
 * provider's annotation and bypasses `MAX_CHARS_PER_PAGE` entirely. Capping the
 * INPUT is the only lever we hold — both a cost line (~25k input tokens on a
 * long book) and the same context-flooding surface a long web page has.
 */
export const MAX_UPLOAD_BYTES = 8_000_000

export interface UploadDoorOptions {
  extract: ExtractRunner
  ctx: MeshContext
  /** A prior parse of THIS file, if we already have one. */
  annotations?: unknown[]
}

/** `data:application/pdf;base64,…` — the shape OpenRouter's file_data expects. */
function isPdfDataUrl(dataUrl: string): boolean {
  return /^data:application\/pdf;base64,/i.test(dataUrl)
}

/** Base64 expands ~4/3; estimate the decoded size without decoding it. */
function approximateBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const payload = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length
  return Math.floor((payload * 3) / 4)
}

export async function openUploadDoor(
  file: { filename: string; dataUrl: string } | null,
  name: string,
  opts: UploadDoorOptions,
): Promise<UploadDoorOutcome> {
  if (!file || file.dataUrl.length === 0) {
    return { ok: false, reason: 'no_file', message: 'No document to read — we will ask you instead.' }
  }
  if (!isPdfDataUrl(file.dataUrl)) {
    // A DOCX or a scan-as-JPEG is a different door, and pretending otherwise
    // would spend a model call to learn we cannot read it.
    return {
      ok: false,
      reason: 'not_pdf',
      message: 'That file is not a PDF — upload a PDF, or tell us in your own words instead.',
    }
  }
  if (approximateBytes(file.dataUrl) > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      message: 'That document is too large to read — send a shorter one, or tell us in your own words.',
    }
  }

  const result = await opts.extract.run(
    { name, file, ...(opts.annotations ? { annotations: opts.annotations } : {}) },
    opts.ctx,
  )

  if (!result.ok) {
    return {
      ok: false,
      reason: 'extract_failed',
      message: 'Read your document, but could not turn it into a brand just now — tell us in your own words instead.',
    }
  }

  // ONE source, so the model's page number is not resolved against anything —
  // see `attachSingleSource`. Using `attachProvenance` here dropped every field
  // of a perfectly good text-layer PDF, because the model cites the document's
  // page 1 and a one-element array has only index 0.
  const fields = attachSingleSource(result.data.fields, file.filename)

  // NOW this means what it says. `result.data.fields` is what the MODEL
  // returned, so an empty list here is genuinely "nothing was readable in that
  // document" — a scan with no text layer, which is what the copy claims. It is
  // no longer reachable by a provenance fault on our side, and that distinction
  // is the whole point: a parse error blamed on the customer's file sends them
  // to re-scan a document that was fine.
  if (fields.length === 0) {
    return {
      ok: false,
      reason: 'unreadable',
      message: 'Could not find any text in that document — if it is a scan, tell us in your own words instead.',
    }
  }

  return {
    ok: true,
    fields,
    instructionAttempts: result.data.instruction_attempts,
    gaps: result.data.gaps,
    annotations: result.annotations ?? [],
  }
}
