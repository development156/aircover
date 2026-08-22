import 'server-only'

import { extractText, getDocumentProxy } from 'unpdf'

/**
 * PDF → plain text, LOCALLY, with no model call and no money spent.
 *
 * ── WHY THIS IS NOT THE DOOR'S PDF PATH ─────────────────────────────────────
 * `lib/brand/url-door.ts` sends a PDF to OpenRouter as a `file` content part and
 * lets the provider's parser read it inside a `brand_extract` call. That is the
 * right shape THERE: onboarding reads one document, once, and needs the fields
 * out of it in the same breath.
 *
 * A library is the opposite. It reads many documents, repeatedly, and wants the
 * WORDS rather than an interpretation of them. Routing each upload through a
 * model would mean paying per document, waiting on a provider to store a menu,
 * and — the part that actually matters — handing an untrusted file to a model
 * before anything has quarantined it. Reading the text here keeps the document
 * as data all the way into the database, and the only thing a model ever sees is
 * a quarantined passage retrieved from it.
 *
 * ── WHY THIS FILE IS ALONE, AND SMALL ───────────────────────────────────────
 * `unpdf` bundles a serverless build of pdf.js. It is the one dependency this
 * feature adds, and a bundler that cannot resolve it takes the whole build down.
 * Keeping the import in a single file means the blast radius of that is a single
 * file — everything else in `packages/research/src/knowledge/` is pure and needs
 * no dependency at all.
 *
 * Every route that reaches this declares `runtime = 'nodejs'`; pdf.js has no
 * place on an edge runtime.
 */

/** What went wrong, in the vocabulary `knowledge_documents.failure_code` accepts. */
export type PdfFailure = 'no_text' | 'unreadable'

export interface PdfText {
  ok: true
  text: string
  pages: number
}

export interface PdfFailed {
  ok: false
  code: PdfFailure
}

/**
 * BELOW THIS, A "PDF" IS A DESIGN AND NOT A DOCUMENT.
 *
 * Measured on the onboarding door 2026-08-12: a design-heavy brochure returned
 * almost nothing from a free text-layer parse because its words live inside the
 * artwork. That is a real and common shape — a restaurant menu laid out in
 * Illustrator has no text layer at all — and it must be reported as what it is
 * rather than as an empty document.
 *
 * 40 characters, not zero: a parse of a scanned page often yields a handful of
 * stray glyphs from a logo or a page number, and calling that "text" would put a
 * document in the library whose only searchable content is "3".
 */
const MIN_USEFUL_CHARS = 40

export async function extractPdfText(bytes: ArrayBuffer): Promise<PdfText | PdfFailed> {
  let pages = 0
  let text = ''
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    // `mergePages: true` is an overload that pins `text` to a single string —
    // the alternative returns one entry per page. A defensive
    // `typeof … === 'string' ? … : text.join('\n')` here does not compile: the
    // else branch narrows to `never`, which is the type system saying the
    // fallback can never run. One page-joined string is what a chunker wants
    // anyway, since a passage worth citing frequently spans a page break.
    const result = await extractText(pdf, { mergePages: true })
    pages = result.totalPages
    text = result.text
  } catch {
    // The file did not open as a PDF. Not the same as opening and finding no
    // words, and the screen says something different for each.
    return { ok: false, code: 'unreadable' }
  }

  if (text.replace(/\s+/g, '').length < MIN_USEFUL_CHARS) {
    return { ok: false, code: 'no_text' }
  }
  return { ok: true, text, pages }
}
