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
  /** What the tile asks for once it is picked. */
  ask: string
  placeholder: string
}

/**
 * Step 06's grid — only the sources this product can actually read.
 *
 * ── WHAT WAS REMOVED, AND WHY IT IS NOT HIDDEN SOMEWHERE ────────────────────
 * Notion, Google Drive and Shopify were on this grid and are gone. Each needs
 * an OAuth handshake and an adapter, and `knowledge-step.tsx` said so in its own
 * header before this change: "for Notion, Drive and Shopify no adapter exists at
 * all". A tile that records an intention it cannot act on is a promise, and the
 * grid gave no way to tell those three apart from the ones that work.
 *
 * They are listed in `UNBUILT_SOURCES` rather than deleted, so the next person
 * knows they were considered and why they are absent.
 *
 * ── EVERY SOURCE HERE TAKES A URL ────────────────────────────────────────────
 * Because `addUrlDocument` is the write path, and it takes an address, fetches
 * it and indexes what comes back. Brand guidelines and Manual upload were file
 * tiles; they are not in this list yet, because `DocFile` in the store carries
 * `{ name, size }` and no bytes, so wiring them needs real file plumbing
 * through to `addPdfDocument`. Offering an upload that records a filename and
 * discards the file is the defect this change exists to remove, so they wait
 * for the commit that can carry them.
 */
export const SOURCES: readonly KnowledgeSource[] = [
  {
    key: 'Website',
    icon: 'i-globe',
    detail: 'Read your pages',
    ask: 'Which address should Sahoda read?',
    placeholder: 'yourbakery.in',
  },
  {
    key: 'Instagram',
    icon: 'i-at',
    detail: 'Read your profile',
    ask: 'Which profile should Sahoda read?',
    placeholder: 'instagram.com/yourbakery',
  },
  {
    key: 'Product catalog',
    icon: 'i-bag',
    detail: 'Names, prices, copy',
    ask: 'Which page lists what you sell?',
    placeholder: 'yourbakery.in/menu',
  },
]

/**
 * Considered and not offered. Each needs an OAuth handshake and an adapter that
 * does not exist. Restoring one means building that first, not adding a tile.
 */
export const UNBUILT_SOURCES = ['Notion', 'Google Drive', 'Shopify'] as const

/**
 * File-backed sources, waiting on real upload plumbing rather than on a
 * decision. See the note above `SOURCES`.
 */
export const FILE_SOURCES_PENDING = ['Brand guidelines', 'Manual upload'] as const

/** Step 02's chips. */
export const CATEGORIES = [
  'SaaS',
  'E-commerce',
  'Agency',
  'Creator',
  'Local business',
  'Other',
] as const
