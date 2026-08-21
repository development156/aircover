/**
 * Reference links, parsed by HOST — and nothing beyond the host.
 *
 * The source is explicit about the line this file may not cross:
 *
 *   "We label what a link IS, from its host — that much is knowable without
 *    fetching anything. We do NOT label its visual style, because nothing has
 *    looked at it yet. 'Queued for analysis' is the honest version of the
 *    mock-up's 'Minimal / Editorial'."
 *
 * So `kindOf` returns a NOUN for the platform and never an adjective for the
 * taste. The mock-up's version reads better and is a fabrication: it is a
 * verdict on a page no request has been made for.
 */

/** Shown on every reference card. Not a status — a statement of intent. */
export const REF_PENDING_NOTE = 'queued for analysis'

/**
 * The hostname, or the raw text when it is not a URL at all.
 *
 * A bare `@handle` is not a URL and must not be forced into one: `new URL()`
 * would make `https://@handle` parse with an EMPTY hostname, so the card would
 * render a blank title and a `?` avatar. The `@` is stripped and the handle is
 * shown as typed, which is what the person put in.
 */
export function hostOf(raw: string): string {
  const text = raw.trim()
  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`)
    // An empty hostname means it never was a URL — fall through to the handle.
    if (url.hostname) return url.hostname.replace(/^www\./, '')
  } catch {
    // Not a URL. The raw text is the honest label.
  }
  return text.replace(/^@/, '')
}

/** What the link IS. Host only — see the header. */
export function kindOf(host: string): string {
  const h = host.toLowerCase()
  if (h.includes('instagram')) return 'Instagram account'
  if (h.includes('pinterest')) return 'Pinterest board'
  if (h.includes('behance') || h.includes('dribbble')) return 'Design reference'
  if (h.includes('tiktok')) return 'TikTok account'
  if (h.includes('youtube')) return 'YouTube channel'
  if (h.includes('linkedin')) return 'LinkedIn page'
  return 'Website'
}

/** First letter of the host, for the card's stand-in favicon. */
export function initialOf(host: string): string {
  return host[0] ? host[0].toUpperCase() : '?'
}

/**
 * File size for the upload rows. Rounds UP to 1 KB rather than down to 0 —
 * "0 KB" on a file the user can see reads as a failed upload.
 */
export function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  return bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export interface KnowledgeSource {
  key: string
  icon: string
  detail: string
}

/** Step 06's grid. Keys and copy are the source's, verbatim. */
export const SOURCES: readonly KnowledgeSource[] = [
  { key: 'Website', icon: 'i-globe', detail: 'Crawl your pages' },
  { key: 'Instagram', icon: 'i-at', detail: 'Read your posts' },
  { key: 'Brand guidelines', icon: 'i-file', detail: 'Use uploaded files' },
  { key: 'Product catalog', icon: 'i-bag', detail: 'Names, prices, copy' },
  { key: 'Notion', icon: 'i-grid', detail: 'Selected pages' },
  { key: 'Google Drive', icon: 'i-db', detail: 'Selected folders' },
  { key: 'Shopify', icon: 'i-bag', detail: 'Products and orders' },
  { key: 'Manual upload', icon: 'i-up', detail: 'PDFs and docs' },
]

/** Step 02's chips. */
export const CATEGORIES = [
  'SaaS',
  'E-commerce',
  'Agency',
  'Creator',
  'Local business',
  'Other',
] as const
