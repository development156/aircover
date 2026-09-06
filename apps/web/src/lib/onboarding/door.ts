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

/**
 * A PDF larger than this is rejected BEFORE its bytes are copied out of the
 * request and BEFORE they are base64-encoded.
 *
 * Said exactly, because the previous sentence here ("before its bytes are read
 * into memory") was not true: the route awaited `file.arrayBuffer()` and only
 * then compared the size. Two guards now hold it. The route compares
 * `content-length` to `MAX_DOOR_BODY_BYTES` (`door-request.ts`) before calling
 * `request.formData()`, which is the call that buffers the multipart body; and
 * `read-door.ts` compares `size` to this cap before calling `read()`, which is
 * the copy. A body that lies about its length still gets buffered once by the
 * platform, and that copy is not ours to skip.
 *
 * `openUploadDoor` has its own `MAX_UPLOAD_BYTES` (8MB) but can only check it
 * after the file has been buffered AND base64-encoded — which is exactly the
 * work worth not doing. This is the earlier, cheaper guard, and deliberately the
 * tighter of the two: 4MB of PDF is already ~17k input tokens, held against the
 * workspace's credits on the PDF arm.
 *
 * It lives here rather than in `onboarding-door.ts` because that module is
 * `'use server'`, where every export is a callable endpoint and only async
 * functions are legal.
 *
 * ── 6 MB WAS A NUMBER THE PLATFORM NEVER LET US KEEP ─────────────────────────
 * MEASURED 2026-09-03. This route is `runtime = 'nodejs'`, so Vercel's ~4.5 MB
 * request ceiling applies to it exactly as it does to a server action — the
 * request is refused at the edge before this module runs, which is why every
 * local test passed. `PLATFORM_REQUEST_CAP_BYTES` in `lib/posts/media-constants.ts`
 * is the same limit, found the same way when media uploads between 4.5 and 8 MB
 * failed only in production; `bodySizeLimit` in `next.config.ts` fixed that path
 * and could not reach this one, because this is a route handler and not an action.
 *
 * So a 5 MB PDF was refused by the platform while the screen said 6 MB was fine.
 * The customer was not stranded — `door-transport-failure.ts` maps the 413 to a
 * true sentence with a working remedy — but the ceiling we PRINTED was a promise
 * we could not keep, and `PDF_TOO_LARGE_MESSAGE` was unreachable copy for
 * everything between 4.5 and 6 MB.
 *
 * 4 MB is under the platform cap once the multipart envelope is added, and the
 * refusal sentence interpolates this constant, so it now reads "over 4MB" with no
 * copy edit. Raising it again needs a direct-to-storage upload, not a bigger
 * number: `door-request.test.ts` asserts the whole body stays under the cap.
 */
export const MAX_PDF_BYTES = 4_000_000

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
  return `We're reading ${KIND_NOUN[choice.kind]} and ignoring ${list}, because ${KIND_REASON[choice.kind]}.`
}
