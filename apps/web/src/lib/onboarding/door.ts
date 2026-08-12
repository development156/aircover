/**
 * Screen 2 — the door. Three ways in, one winner.
 *
 * PDF beats URL beats sentence. The order is not arbitrary and it is not about
 * how much text each yields: it is about how much of it the BUSINESS wrote. A
 * deck or a menu is a document someone chose every word of. A website is
 * mostly navigation, cookie banners and a theme's boilerplate. A sentence typed
 * into a box is true but thin.
 *
 * The rule only bites when a user fills more than one — which they will, because
 * a filled field looks like progress. So the losing input is never silently
 * dropped: `ignored` is what the UI says out loud.
 */

export type DoorKind = 'pdf' | 'url' | 'sentence'

/** What the user put in. The PDF is described, not carried — this stays pure. */
export interface DoorInput {
  pdfName?: string | null
  url?: string | null
  sentence?: string | null
}

export type DoorChoice =
  | { kind: 'pdf'; label: string; ignored: DoorKind[] }
  | { kind: 'url'; url: string; label: string; ignored: DoorKind[] }
  | { kind: 'sentence'; sentence: string; label: string; ignored: DoorKind[] }
  | { kind: 'none'; ignored: [] }

/** A sentence shorter than this is not a description, it is a placeholder. */
export const MIN_SENTENCE_CHARS = 12

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/**
 * Normalise what someone types into a URL box. People type `acme.com`, paste
 * `https://acme.com/about?utm_source=x`, and occasionally paste a whole
 * sentence. Returns the canonical absolute URL, or `null` if it is not one.
 *
 * Only http/https survive: `javascript:`, `data:` and `file:` are all valid to
 * `new URL()` and none of them are a website.
 */
export function normaliseUrl(raw: string | null | undefined): string | null {
  const value = clean(raw)
  if (!value || /\s/.test(value)) return null

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // A hostname with no dot is a bare word ("bakery"), not a domain. Left in,
    // it would send the fetcher at an intranet name.
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Apply the precedence. Every input the user filled but that lost is listed in
 * `ignored`, strongest-first, so the UI can name it.
 */
export function pickDoor(input: DoorInput): DoorChoice {
  const pdfName = clean(input.pdfName)
  const url = normaliseUrl(input.url)
  const sentence = clean(input.sentence)
  const hasSentence = sentence.length >= MIN_SENTENCE_CHARS

  // Built explicitly rather than by ranking a list, so each arm carries the
  // narrowing that proves its own payload is present.
  if (pdfName) {
    const ignored: DoorKind[] = []
    if (url) ignored.push('url')
    if (hasSentence) ignored.push('sentence')
    return { kind: 'pdf', label: pdfName, ignored }
  }
  if (url) {
    const ignored: DoorKind[] = hasSentence ? ['sentence'] : []
    return { kind: 'url', url, label: new URL(url).hostname, ignored }
  }
  if (hasSentence) return { kind: 'sentence', sentence, label: 'what you typed', ignored: [] }
  return { kind: 'none', ignored: [] }
}

const KIND_NOUN: Record<DoorKind, string> = {
  pdf: 'your PDF',
  url: 'your website',
  sentence: 'what you typed',
}

/**
 * Why the winner won — stated in its own terms. A single reason string would
 * have to fit both "a document beats a website" and "a website beats a
 * sentence", and the one that fits both ("you wrote every word of it") is
 * plainly false of the second: they did write the sentence.
 */
const KIND_REASON: Record<DoorKind, string> = {
  pdf: 'a document is the closest thing to how you already describe yourself',
  url: 'your site says more about you than one sentence can',
  sentence: 'it is what you gave us',
}

/**
 * The line screen 2 shows once a winner exists. `null` when nothing lost, so
 * the common single-input case carries no explanation it does not need.
 */
export function precedenceNote(choice: DoorChoice): string | null {
  if (choice.kind === 'none' || choice.ignored.length === 0) return null

  const dropped = choice.ignored.map((kind) => KIND_NOUN[kind])
  const list = dropped.length === 1 ? dropped[0] : `${dropped[0]} and ${dropped[1]}`
  return `We're reading ${KIND_NOUN[choice.kind]} and ignoring ${list} — ${KIND_REASON[choice.kind]}.`
}
