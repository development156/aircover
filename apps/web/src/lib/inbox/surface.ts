import type { ZernioInboxMeta } from '@sahoda/publishing'

import {
  INBOX_SURFACES,
  classifyInboxResult,
  couldNotAsk,
  neverConnected,
  notRead,
  type InboxEmptiness,
  type InboxSurfaceKey,
} from './emptiness'

/**
 * Deciding what an inbox surface may claim, before any of it reaches a screen.
 *
 * Pure on purpose: the interesting decisions here are about what we are entitled to
 * SAY, and those must be testable without a database or a Zernio key.
 */

/**
 * Which `connections.platform` values feed each surface.
 *
 * NOTE the vocabulary gap, which is real and not a typo: Zernio calls it
 * `googlebusiness`, our `connections.platform` CHECK calls it `gbp`. The mapping lives
 * here, in the layer that talks to the database, rather than leaking either name into
 * @sahoda/shared.
 *
 * ── VERIFIED AGAINST THE WRITE PATH, NOT ASSUMED ─────────────────────────────
 * `upsert_zernio_connection`
 * (packages/db/supabase/migrations/20260804010000_zernio_all_channels.sql:68) stores
 * `p_platform in ('instagram','x','gbp','linkedin')` and always writes
 * `jsonb_build_object('id', …, 'profileId', …)`. So the value on a Zernio-backed Google
 * row really is `gbp` — matching on `googlebusiness` would find nothing, forever, and
 * `accountsQueried` would be vacuously 0 rather than measured.
 *
 * That same list is why `facebook` and `whatsapp` below cannot match a row TODAY: the
 * RPC refuses them, so no Zernio connection for either can exist yet. They are listed
 * anyway because the surface is theirs the moment the RPC admits them, and a mapping
 * that silently omits a platform is harder to notice than one that matches nothing.
 *
 * Platform is only HALF the filter, and the weaker half. A `gbp` row can come from the
 * direct Google OAuth handler, which writes no `external_account.profileId`; only a
 * Zernio-backed connection has one. `countAccounts` therefore requires that key as well,
 * and it is the part that actually makes the count mean "accounts Zernio could be asked
 * about". Getting this wrong inverts the reviews empty state for any workspace that
 * connected GBP for publishing.
 */
export const SURFACE_CONNECTION_PLATFORMS = {
  conversations: ['instagram', 'facebook', 'whatsapp'],
  comments: ['instagram', 'facebook'],
  reviews: ['gbp'],
  // A single thread is fed by the same connections as the list it came from.
  thread: ['instagram', 'facebook', 'whatsapp'],
} as const satisfies Record<InboxSurfaceKey, readonly string[]>

/**
 * Why a read produced no answer. Three causes, three sentences — conflating them is
 * how "we did not look" gets rendered as "there is nothing there".
 */
export type ReadFailure =
  /** No `ZERNIO_API_KEY` in this environment. No request went out. */
  | 'no_reader'
  /** No Zernio profile is mapped to this workspace — nothing has ever been connected. */
  | 'no_profile'
  /** A request went out and did not come back with an answer. */
  | 'call_failed'

export interface SurfaceDecision {
  state: InboxEmptiness
  /** True only when there is a real reason to render rows. */
  showList: boolean
}

export interface DecideInput {
  surface: InboxSurfaceKey
  /** Active `connections` rows Zernio could be asked about. A real count, never a guess. */
  connectedAccounts: number
  /** Set when no read happened. Mutually exclusive with `result`. */
  failure?: ReadFailure
  /** Present only when a read actually happened. */
  result?: { rows: number; meta: ZernioInboxMeta | undefined }
}

/**
 * Resolve one surface into the single honest thing it can say.
 *
 * The failure branches come first because they describe a question that was never
 * answered, and no shape of `meta` can express that — there is no `meta`.
 */
export function decideSurface({
  surface,
  connectedAccounts,
  failure,
  result,
}: DecideInput): SurfaceDecision {
  const spec = INBOX_SURFACES[surface]

  if (failure === 'no_profile') {
    // Nothing to address a read TO. Genuinely never connected, and the only failure
    // the customer can act on.
    return { state: neverConnected(spec), showList: false }
  }
  if (failure === 'no_reader') {
    return { state: notRead(spec), showList: false }
  }
  if (failure === 'call_failed') {
    return { state: couldNotAsk(spec), showList: false }
  }

  if (!result) {
    // No result and no stated failure is a programming error upstream, not a fact
    // about the customer. Report the honest "cannot confirm" rather than "empty".
    const state = classifyInboxResult({
      rows: 0,
      meta: undefined,
      surface: spec,
      connectedAccounts,
    })
    return { state, showList: false }
  }

  const state = classifyInboxResult({
    rows: result.rows,
    meta: result.meta,
    surface: spec,
    connectedAccounts,
  })
  return { state, showList: state.showList }
}
