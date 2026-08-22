/**
 * A document's text → the passages a search returns and a model is shown.
 *
 * PURE. No dependency, no network, no filesystem — this is the half of ingestion
 * that can be reasoned about completely, and it is deliberately kept away from
 * the PDF reader (which needs `unpdf`) and the URL fetcher (which needs a socket).
 *
 * ── WHY A PASSAGE AND NOT A FILE ────────────────────────────────────────────
 * A file list is not a knowledge library. "Show me the menu" is not the question
 * anybody has; "what does a masala dosa cost" is. Answering the second means
 * storing units small enough that one of them can be the answer — and small
 * enough that a citation points at a paragraph rather than at forty pages.
 */

/**
 * ── WHERE THESE NUMBERS COME FROM ───────────────────────────────────────────
 * Not from a round number, and this repo has been burned exactly here before:
 * `ExtractedFieldWire`'s note in packages/shared records extraction failing its
 * schema FIVE TIMES IN SIX, always by truncation at max_tokens, after a ceiling
 * somebody picked.
 *
 * So these are derived from what the receiving task actually has room for:
 *
 *   · `packages/research/src/quarantine.ts` budgets MAX_CHARS_PER_PAGE = 6000
 *     per crawled page, and `MAX_PAGES` bounds a crawl at five. So the largest
 *     corpus `brand_extract` is known to handle is ~30,000 characters, and that
 *     is the ceiling an evidence set drawn from this library must respect too —
 *     it is the same task, reading the same shape of quarantined blocks.
 *   · A page is a poor unit for a citation, so the library's unit is smaller.
 *     TARGET is a quarter of a page: roughly two paragraphs, ~200 words, which
 *     is the smallest span that still reads as a statement about the business
 *     rather than as a fragment.
 *   · 30,000 / 1,200 = 25 blocks in a full evidence set, which is what
 *     MAX_EVIDENCE_CHUNKS below records.
 *
 * `MAX` is the hard stop for a paragraph that will not divide — a table of
 * prices with no sentence punctuation, most often — and is set at one and a half
 * times TARGET so that an ordinary long paragraph is kept whole rather than cut.
 */
export const CHUNK_TARGET_CHARS = 1200
export const CHUNK_MAX_CHARS = 1800

/**
 * How many passages one evidence set may carry into a model call.
 *
 * 25 × 1,200 ≈ the 30,000-character corpus a five-page crawl already produces —
 * see above. This is a ceiling on what is SHOWN, never on what is stored.
 */
export const MAX_EVIDENCE_CHUNKS = 25

/**
 * The most passages one document may hold.
 *
 * NOT A SILENT TRUNCATION. `index_knowledge_document` writes every passage in
 * one transaction, which is what makes a half-written index impossible; batching
 * would trade that guarantee away. So a document past this ceiling is REFUSED,
 * with `too_large` and a sentence naming the size, rather than quietly stored
 * with its second half missing.
 *
 * 2,000 passages is roughly 2.4 million characters — a 900-page book. No menu,
 * rate card or policy this product is for comes close, and a file that does is
 * something the owner should be told about rather than half-read.
 */
export const MAX_CHUNKS_PER_DOCUMENT = 2000

/**
 * Tidy the text without editing it.
 *
 * Every rule here removes something a parser ADDED — Windows line endings, the
 * trailing spaces pdf.js leaves at a line break, the run of blank lines a page
 * boundary produces. Nothing removes a word, changes punctuation or alters a
 * number, because the stored passage has to be quotable back to the owner as
 * what their document says.
 */
export function normaliseDocumentText(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      // A soft hyphen is invisible and breaks a search for the word it splits.
      .replace(/­/g, '')
      // Non-breaking and other exotic spaces read as text to a human and as a
      // different character to `to_tsvector`.
      .replace(/[   ]/g, ' ')
      // Trailing AND leading whitespace on a line. pdf.js emits both — the first
      // at a soft line break, the second from a left margin or an indented list —
      // and neither is a character the author typed.
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Has at least one character that is not whitespace — the DB asks the same question. */
function hasContent(text: string): boolean {
  return /[^\s]/.test(text)
}

/**
 * Split a paragraph too long to keep whole, at sentence ends where there are any.
 *
 * The lookbehind keeps the punctuation ON the sentence it belongs to, so a price
 * list broken here still reads as prices rather than as fragments starting with
 * a full stop.
 */
function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[.!?।])\s+/)
  const out: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (current && current.length + 1 + sentence.length > CHUNK_MAX_CHARS) {
      out.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }

    // A single "sentence" longer than the hard cap — a price table with no
    // punctuation at all. Cut it, because the alternative is a passage nothing
    // downstream can budget for.
    while (current.length > CHUNK_MAX_CHARS) {
      out.push(current.slice(0, CHUNK_MAX_CHARS))
      current = current.slice(CHUNK_MAX_CHARS)
    }
  }

  if (hasContent(current)) out.push(current)
  return out
}

/**
 * The text of one document, as passages.
 *
 * PARAGRAPHS ARE THE JOIN, not a fixed character window. A window cuts the price
 * away from the dish; a paragraph boundary is where the author already decided
 * one thought ended. Paragraphs are accumulated up to TARGET so that a document
 * of one-line entries does not become one row per line.
 *
 * NO OVERLAP between passages, deliberately. Overlap improves recall for a
 * phrase that straddles a boundary and costs a duplicate of every overlapping
 * span — stored twice, searched twice, and shown to a model twice, where the
 * same sentence arriving under two citations is exactly the kind of thing that
 * makes a count of evidence dishonest. `post.channels` in this codebase has
 * already produced three shipped defects from a collection read as a set;
 * duplicated evidence is the same shape.
 */
export function chunkDocumentText(raw: string): string[] {
  const text = normaliseDocumentText(raw)
  if (!hasContent(text)) return []

  const paragraphs = text.split(/\n{2,}/).filter(hasContent)
  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (hasContent(current)) chunks.push(current.trim())
    current = ''
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_MAX_CHARS) {
      flush()
      for (const piece of splitLongParagraph(paragraph)) {
        if (hasContent(piece)) chunks.push(piece.trim())
      }
      continue
    }
    if (current && current.length + 2 + paragraph.length > CHUNK_TARGET_CHARS) {
      flush()
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  flush()

  return chunks
}

/** Why a document could not be turned into passages, in the DB's own vocabulary. */
export type ChunkRefusal = { code: 'no_text' | 'too_large'; chunks: number }

/**
 * Chunk, or say why not — the shape the ingestion path actually calls.
 *
 * Both refusals are states `knowledge_documents.failure_code` already has words
 * for, so nothing here invents a fifth vocabulary for a failure.
 */
export function chunkForIngestion(
  raw: string,
): { ok: true; chunks: string[] } | ({ ok: false } & ChunkRefusal) {
  const chunks = chunkDocumentText(raw)
  if (chunks.length === 0) return { ok: false, code: 'no_text', chunks: 0 }
  if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
    return { ok: false, code: 'too_large', chunks: chunks.length }
  }
  return { ok: true, chunks }
}
