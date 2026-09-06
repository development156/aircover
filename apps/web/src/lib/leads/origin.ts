import { platformLabel } from '@/components/inbox/platform-label'

/**
 * WHERE A LEAD CAME FROM, READ OUT OF `leads.source` AND NEVER GUESSED.
 *
 * ── THE DOOR IS NAMED FROM `kind` AND FROM NOTHING ELSE ──────────────────────
 * `lib/leads/read.ts` has always refused to assign a door to a row that does not
 * declare one, and that refusal stays exactly as strict here: only `kind` may
 * produce the sentence "Your site" or "Your inbox". Every lead in this table
 * predates both doors, so a default would be a guess presented as a fact.
 *
 * ── AND THE DETAILS ARE SHOWN WHETHER OR NOT THE DOOR IS NAMED ───────────────
 * That refusal used to throw away the rest of the row with it: a source holding
 * a page and a campaign rendered as the four words "Came from: Not recorded",
 * which is a claim that nothing was recorded when in fact quite a lot was. So
 * the two are separated. The door is a CONCLUSION and needs `kind`; a page, a
 * form name and a campaign are FACTS already written down, and printing a fact
 * is not inferring a door from it.
 *
 * ── WHAT `lead_submit` ACTUALLY WRITES ───────────────────────────────────────
 * MEASURED 2026-09-06 against `20260821000100_lead_doors.sql`: `kind`,
 * `site_slug`, `site_status` and `url`. There is no `form` key and no `page`
 * key, so for every row this codebase creates the page comes from parsing `url`
 * and the form name is ABSENT — see `formOf`. Older rows seeded outside this
 * repository carry `page`, `form` and `utm_source` directly, and those are read
 * first when present.
 */

/** Which door a row DECLARES. `unrecorded` is a real answer, not a fallback. */
export type LeadDoor = 'site_form' | 'inbox' | 'unrecorded'

export interface LeadOrigin {
  readonly door: LeadDoor
  /** The door in the reader's words. "Your inbox · Instagram", never the raw key. */
  readonly from: string
  /** The raw platform key an inbox lead arrived on, or null. */
  readonly channel: string | null
  /** Zernio's own id for the conversation, when the row records one. */
  readonly conversationRef: string | null
  /** The page a visitor was on when they filled the form in. */
  readonly page: string | null
  /** Which form on that page, when the row says. */
  readonly form: string | null
  /** The campaign that brought them, from `utm_source`. */
  readonly campaign: string | null
}

function stringAt(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  if (typeof value !== 'string') return null
  const clean = value.trim()
  return clean === '' ? null : clean
}

/**
 * The path a visitor was on.
 *
 * `page` when the row carries one; otherwise the pathname of `url`. A stored URL
 * is whatever a browser reported, so it may be absolute, relative, or not a URL
 * at all — the parse falls back to trimming the query off by hand rather than
 * throwing, and answers null when there is nothing path-shaped left.
 */
export function pageOf(source: Record<string, unknown>): string | null {
  const declared = stringAt(source, 'page')
  if (declared !== null) return declared

  const url = stringAt(source, 'url')
  if (url === null) return null
  try {
    return new URL(url).pathname
  } catch {
    const path = url.split(/[?#]/)[0] ?? ''
    return path.startsWith('/') ? path : null
  }
}

/**
 * The campaign, from `utm_source`.
 *
 * Read from the row's own key first, then from the query string of the stored
 * URL — which is where it really lives, because `lead_submit` stores the whole
 * address a visitor was on and nothing splits it up.
 */
export function campaignOf(source: Record<string, unknown>): string | null {
  const declared = stringAt(source, 'utm_source') ?? stringAt(source, 'utm')
  if (declared !== null) return declared

  const url = stringAt(source, 'url')
  if (url === null) return null
  try {
    const value = new URL(url).searchParams.get('utm_source')?.trim()
    return value ? value : null
  } catch {
    return null
  }
}

/**
 * Which form on the page.
 *
 * NOTHING IN THIS CODEBASE WRITES IT. `lead_submit` records the site, the site's
 * status and the URL, and a page may carry two forms without either of them
 * saying which one was sent. Rows seeded before that function existed do carry
 * the key, so it is read; a row without it prints no form name at all rather
 * than an empty pair of brackets.
 */
export function formOf(source: Record<string, unknown>): string | null {
  return stringAt(source, 'form')
}

/**
 * Zernio's platform names are not ours, in the two places they differ.
 *
 * `source.channel` on an inbox lead is whatever `ZernioMessage.platform` said —
 * the inbox thread page passes it straight through — while `connections.platform`
 * holds this product's own vocabulary. Looking a conversation's account up by the
 * unmapped key finds nothing for X and for Google Business Profile, forever, and
 * the failure reads as "no longer connected" rather than as a spelling mismatch.
 *
 * Written out here rather than imported: the shared copy lives under
 * `lib/inbox`, which this lane does not own, and a two-entry map is cheaper to
 * duplicate than a boundary is to cross. `origin.test.ts` pins both entries.
 */
const OUR_PLATFORM: Readonly<Record<string, string>> = Object.freeze({
  twitter: 'x',
  googlebusiness: 'gbp',
})

/** The `connections.platform` value that would hold the account this arrived on. */
export function connectionPlatformFor(channel: string): string {
  return OUR_PLATFORM[channel] ?? channel
}

export function leadOrigin(source: unknown): LeadOrigin {
  const empty: LeadOrigin = {
    door: 'unrecorded',
    from: 'Not recorded',
    channel: null,
    conversationRef: null,
    page: null,
    form: null,
    campaign: null,
  }
  if (typeof source !== 'object' || source === null) return empty

  const row = source as Record<string, unknown>
  const kind = row.kind
  const channel = stringAt(row, 'channel')

  if (kind === 'inbox') {
    return {
      door: 'inbox',
      // `platformLabel` renders an unmodelled platform verbatim, which is what a
      // person reporting a problem needs — better than "Unknown platform" and
      // very much better than the lowercase key this line used to print.
      from: channel === null ? 'Your inbox' : `Your inbox · ${platformLabel(channel)}`,
      channel,
      conversationRef: stringAt(row, 'conversation_ref'),
      page: null,
      form: null,
      campaign: null,
    }
  }

  // A row that declares no door keeps "Not recorded" as its door and still
  // reports the page, form and campaign it wrote down. See the header.
  return {
    door: kind === 'site_form' ? 'site_form' : 'unrecorded',
    from: kind === 'site_form' ? 'Your site' : 'Not recorded',
    channel: null,
    conversationRef: null,
    page: pageOf(row),
    form: formOf(row),
    campaign: campaignOf(row),
  }
}

/**
 * The origin as one line a person reads.
 *
 * "Your site · /pricing (enquiry) · campaign spring-sale". Each half is dropped
 * when it is absent rather than dashed: a dash means "we looked and found
 * nothing", and a form name that was never recorded is not a measurement that
 * came back empty.
 */
export function originWords(origin: LeadOrigin): string {
  const parts: string[] = [origin.from]
  if (origin.page !== null) {
    parts.push(origin.form === null ? origin.page : `${origin.page} (${origin.form})`)
  } else if (origin.form !== null) {
    parts.push(origin.form)
  }
  if (origin.campaign !== null) parts.push(`campaign ${origin.campaign}`)
  return parts.join(' · ')
}
