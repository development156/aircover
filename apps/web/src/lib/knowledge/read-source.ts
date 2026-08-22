import 'server-only'

import { UnsafeUrlError, parsePage, safeFetch, stripCorpusNoise } from '@sahoda/research'

import { extractPdfText } from './extract-pdf'
import type { KnowledgeFailureCode } from './failure-copy'
import { MAX_UPLOAD_BYTES } from './limits'

/**
 * The three doors, reduced to one answer: text, or a named reason there is none.
 *
 * ── WHY THE DOORS CONVERGE HERE AND NOT LATER ───────────────────────────────
 * A PDF, a pasted note and a web page have nothing in common until they are
 * text. Everything downstream — chunking, indexing, searching, citing — works on
 * text alone and has no business knowing which door a document came through.
 * Keeping the three apart any further would mean three ingestion paths, and the
 * two that were used less would be the two that rotted.
 *
 * ── NOTHING HERE CALLS A MODEL, AND THAT IS THE POINT ───────────────────────
 * The onboarding door hands a PDF to a provider's parser inside a
 * `brand_extract` call. This does not. A library reads many documents,
 * repeatedly, and wants the WORDS rather than an interpretation of them — and a
 * document that has not been quarantined yet has no business being in front of a
 * model. Text goes into the database; only a retrieved, fenced passage ever
 * reaches one. So ingestion costs nothing and there is no price to show before
 * it, which is why `pricing.config.json` gains no entry.
 */

export type SourceRead =
  | { ok: true; text: string; title: string | null; pages?: number }
  | { ok: false; code: KnowledgeFailureCode }

/**
 * Re-exported so a server caller has one import, and DEFINED in `./limits`
 * because this module is `server-only` and the upload dialog is a client
 * component that has to show the cap. Importing a `server-only` module from a
 * client component 500s every route in the app — see the note in `limits.ts`.
 */
export { MAX_UPLOAD_BYTES }

export async function readPdfSource(file: {
  name: string
  size: number
  bytes: ArrayBuffer
}): Promise<SourceRead> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, code: 'too_large' }
  const parsed = await extractPdfText(file.bytes)
  if (!parsed.ok) return { ok: false, code: parsed.code }
  return { ok: true, text: parsed.text, title: titleFromFilename(file.name), pages: parsed.pages }
}

/** Text somebody typed or pasted. Nothing to fetch and nothing to parse. */
export function readTypedSource(text: string): SourceRead {
  if (!/[^\s]/.test(text)) return { ok: false, code: 'no_text' }
  return { ok: true, text, title: null }
}

/**
 * A page, fetched with every hop validated.
 *
 * `safeFetch` is reused rather than reimplemented, and the reason is worth
 * stating: it resolves DNS and checks the address at CONNECT time via
 * `pinnedFetch`, follows redirects manually so hop two is validated as well as
 * hop one, and caps the body. A URL a customer types is the classic SSRF shape —
 * `http://169.254.169.254/` is the cloud metadata endpoint — and the library
 * accepts URLs from exactly the same place the onboarding door does.
 */
export async function readUrlSource(url: string): Promise<SourceRead> {
  let page
  try {
    page = await safeFetch(url)
  } catch (error) {
    // The address itself is refused — private, link-local, too many redirects.
    // A DIFFERENT sentence from "the page did not answer", because this one is
    // a statement about the link and that one is not.
    if (error instanceof UnsafeUrlError) return { ok: false, code: 'fetch_refused' }
    return { ok: false, code: 'fetch_failed' }
  }

  if (page.status >= 400) return { ok: false, code: 'fetch_failed' }
  // `safeFetch` returns empty html for a non-HTML content type rather than
  // reading 2 MB of binary into a string. A PDF at a URL is the upload door.
  if (!page.html) return { ok: false, code: 'not_supported' }

  const parsed = parsePage(page.html, page.url)
  // Stripped before storage, not before display: `stripCorpusNoise` removes the
  // nav, the cookie banner and the link soup, which are the parts of a page that
  // are about the WEB and not about the business.
  const text = stripCorpusNoise(parsed.markdown)
  if (!/[^\s]/.test(text)) return { ok: false, code: 'no_text' }

  return { ok: true, text, title: parsed.title || null }
}

/**
 * "menu-final-FINAL-v3.pdf" is not a name, but it is a better first guess than
 * nothing and the owner can edit it. The extension goes, separators become
 * spaces, and nothing else is touched — a filename with real capitalisation
 * keeps it.
 */
function titleFromFilename(name: string): string | null {
  const base = name
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return base.length > 0 ? base.slice(0, 120) : null
}
