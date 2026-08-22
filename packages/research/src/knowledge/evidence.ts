import { MAX_EVIDENCE_CHUNKS } from './chunk'
import { quarantineBlock, quarantinePreamble } from '../quarantine'
import type { NeutralizedSpan } from '../quarantine'

/**
 * Library passages → a quarantined evidence set a model may be shown.
 *
 * ── THE ONE PROPERTY THIS FILE EXISTS TO HOLD ───────────────────────────────
 * Text that came out of a customer's uploaded document reaches a model ONLY
 * through here, and here it arrives fenced, indexed, and declared to be evidence.
 * `packages/research/CLAUDE.md` states the same rule for crawled pages, and the
 * reason is the same: this package acquires and quarantines, and it never calls
 * a model.
 *
 * The fence is `quarantineBlock`'s, not a second one. A different fence would be
 * a fence `neutralize` does not rewrite, which is the whole hole.
 *
 * ── AND THE ONE IT DOES NOT ─────────────────────────────────────────────────
 * It does not make a hostile document safe. The note at the top of
 * `quarantine.ts` records why nobody can: a 2025 joint OpenAI / Anthropic /
 * Google DeepMind team bypassed twelve published prompt-injection defences with
 * over 90% success. What holds is architectural — the task reading this has no
 * tools, cannot reach a credit or a publish, and emits a schema with no way to
 * express confirmation. A field it proposes is a guess until a person says
 * otherwise, whatever the document told it to think.
 *
 * What this file adds on top of that is CITABILITY. Every block carries an index,
 * and `sources[index]` is filled in HERE, from the rows we retrieved — so a model
 * naming a document is a model choosing from a list we built, and a number
 * outside that list resolves to nothing. See `attachProvenance` in
 * packages/shared, which already works exactly this way for crawled pages.
 */

/** One retrieved passage, as the store hands it over. */
export interface EvidenceChunk {
  id: string
  documentId: string
  documentTitle: string
  ordinal: number
  text: string
}

/** Where a cited field actually came from — resolved by us, never by the model. */
export interface EvidenceCitation {
  /** `document:<uuid>` — the value stamped into `FieldMeta.source`. */
  source: string
  documentId: string
  documentTitle: string
  chunkId: string
  ordinal: number
}

/** A span `neutralize` rewrote, and which document it was in. */
export interface AddressedSpan extends NeutralizedSpan {
  documentId: string
  documentTitle: string
}

export interface EvidenceSet {
  /** The user turn, ready to send. Empty when there was nothing to show. */
  corpus: string
  /**
   * `sources[i]` for `ExtractedFieldWire.page === i`. Parallel to `citations`.
   * A model citing an index past the end of this resolves to nothing and its
   * field is dropped — which is the point of an index rather than a name.
   */
  sources: string[]
  citations: EvidenceCitation[]
  /**
   * Every span `neutralize` actually rewrote, with the document it was in.
   *
   * An OBSERVATION and never a verdict. Empty means this pass changed nothing,
   * which is a fact about the pass and not a claim about the documents.
   */
  addressed: AddressedSpan[]
  /**
   * Passages left out because the set was full.
   *
   * NAMED, never silent. A top-N that says nothing reads as "we showed it
   * everything you have" when it did not, and this codebase has the rule written
   * down in `packages/research/CLAUDE.md` for the crawler's own page cap.
   */
  dropped: number
}

/**
 * Build the evidence set.
 *
 * Order is the caller's — a search hands them over by relevance, a whole-document
 * read by position — and it is preserved, because `index` is what a citation
 * points at and re-sorting here would silently repoint every one of them.
 */
export function buildEvidenceSet(
  chunks: readonly EvidenceChunk[],
  limit: number = MAX_EVIDENCE_CHUNKS,
): EvidenceSet {
  const shown = chunks.slice(0, Math.max(0, limit))
  const dropped = Math.max(0, chunks.length - shown.length)

  if (shown.length === 0) {
    return { corpus: '', sources: [], citations: [], addressed: [], dropped }
  }

  const sources: string[] = []
  const citations: EvidenceCitation[] = []
  const addressed: AddressedSpan[] = []
  const blocks: string[] = []

  shown.forEach((chunk, index) => {
    const block = quarantineBlock(
      {
        // The TITLE and the position, never the document id: an id is a handle
        // for us and noise to a model, and every extra token in a header is a
        // token not spent on the passage.
        attributes: { document: chunk.documentTitle, passage: chunk.ordinal },
        text: chunk.text,
      },
      index,
    )
    blocks.push(block.text)
    sources.push(`document:${chunk.documentId}`)
    citations.push({
      source: `document:${chunk.documentId}`,
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      chunkId: chunk.id,
      ordinal: chunk.ordinal,
    })
    for (const change of block.changes) {
      addressed.push({
        ...change,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
      })
    }
  })

  const corpus = [
    quarantinePreamble('TEXT COPIED FROM DOCUMENTS THIS BUSINESS UPLOADED', 'document'),
    '',
    ...blocks,
  ].join('\n')

  return { corpus, sources, citations, addressed, dropped }
}

/**
 * The citation for a model's `page` index, or nothing.
 *
 * `undefined` for any index we did not supply — negative, fractional, past the
 * end, or a number the model invented outright. The caller drops the field, the
 * same way `attachProvenance` does.
 */
export function citationFor(set: EvidenceSet, page: number): EvidenceCitation | undefined {
  if (!Number.isInteger(page) || page < 0) return undefined
  return set.citations[page]
}
