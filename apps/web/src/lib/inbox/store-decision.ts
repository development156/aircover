import {
  INBOX_SURFACES,
  type InboxEmptiness,
  type InboxEmptinessState,
  type InboxSurfaceKey,
} from './emptiness'

/**
 * What a STORE-BACKED inbox surface may claim.
 *
 * ── THE STATE THE LIVE CLASSIFIER HAS NO WORD FOR ────────────────────────────
 * `surface.ts` distinguishes five things: not configured, never connected, could
 * not resolve, could not ask, and asked-and-empty. Reading from a local store adds a
 * sixth that none of those covers:
 *
 *   CONNECTED, STORE HEALTHY, AND NO EVENT HAS EVER ARRIVED.
 *
 * Before the first delivery, an empty local table is indistinguishable from an empty
 * inbox — and rendering "No conversations yet" there is exactly the fabricated
 * measurement this codebase refuses everywhere else. It is not "we asked and there
 * is nothing"; nobody asked, because a webhook store is not asked, it is TOLD.
 *
 * ── WHY THIS IS NOT A TRANSIENT WORRY ────────────────────────────────────────
 * Webhooks deliver only what happens AFTER the subscription exists, and Zernio's API
 * has no replay endpoint — checked across all 399 paths (docs/29 §0). So there is no
 * backfill by construction: a workspace with six months of history starts with an
 * empty store permanently, and the gap never closes by itself. That is why the live
 * read is kept as a HISTORY SUPPLEMENT rather than deleted, and why this module has
 * to be able to say "some of your history is not here" out loud.
 */

/** Every distinct thing a store-backed list can mean. */
export type StoreEmptinessState =
  /** Rows from the store. The normal case. */
  | 'ok'
  /** Rows from the store, and the history behind them could not be fetched. */
  | 'ok_history_unavailable'
  /** Nothing connected. Not a statement about the store at all. */
  | 'never_connected'
  /**
   * Connected, the store answered, and it has never received an event. NOT "empty" —
   * nobody has told us anything yet, which is a different sentence.
   */
  | 'awaiting_first_event'
  /**
   * Connected, events HAVE arrived, and none of them produced a row for this
   * surface. This is the only state that is a statement about the customer.
   */
  | 'empty'
  /** The store itself could not be read. Says nothing about what is in it. */
  | 'store_unreadable'

export interface StoreDecision {
  state: StoreEmptinessState
  /** Render rows? True whenever any exist, even alongside a degraded history read. */
  showList: boolean
  headline: string
  body: string
}

export interface StoreDecideInput {
  surface: InboxSurfaceKey
  /** Active connections Zernio could send events for. A measurement, never a guess. */
  connectedAccounts: number
  /** Rows this surface found in the store. */
  storedRows: number
  /**
   * Has ANY webhook event ever been recorded for this workspace?
   *
   * This is the whole point of the module. It is a count of
   * `zernio_webhook_events`, not of the projected rows — because an event that
   * arrived and could not be filed (a Reddit comment, an unrouted account) still
   * proves the pipe works, and "nothing has been filed" would otherwise be reported
   * as "nothing has arrived".
   */
  eventsEverReceived: boolean
  /** Could the history supplement be fetched? `undefined` when it was not attempted. */
  historyAvailable?: boolean
  /** Set when the store read itself threw. */
  storeUnreadable?: boolean
}

/**
 * The line every state below is written against: say what Sahoda DID, not what the
 * customer HAS — except in `empty`, which is the one case where those coincide.
 */
export function decideStoreSurface(input: StoreDecideInput): StoreDecision {
  const { noun, connectPrompt } = INBOX_SURFACES[input.surface]

  // Checked FIRST. A store we could not read tells us nothing about connections,
  // about events, or about the customer — so no later branch is entitled to run.
  if (input.storeUnreadable === true) {
    return {
      state: 'store_unreadable',
      showList: false,
      headline: `Sahoda could not read your ${noun}`,
      body: `This is not a reading of your ${noun} — the attempt itself failed. Try again in a moment.`,
    }
  }

  if (input.storedRows > 0) {
    // Rows exist. The only question left is whether the history behind them is
    // complete, and `false` is the one value that means "we tried and could not".
    return input.historyAvailable === false
      ? {
          state: 'ok_history_unavailable',
          showList: true,
          headline: `Showing your recent ${noun}`,
          body: `Older ${noun} live on the platform and could not be reached just now. Everything since Sahoda started listening is here.`,
        }
      : {
          state: 'ok',
          showList: true,
          headline: `Showing your ${noun}`,
          body: '',
        }
  }

  if (input.connectedAccounts === 0) {
    return {
      state: 'never_connected',
      showList: false,
      headline: `No ${noun} yet`,
      body: `Sahoda will show ${noun} here once ${connectPrompt}.`,
    }
  }

  // CONNECTED, NOTHING STORED, AND NOTHING HAS EVER ARRIVED. The state this module
  // exists for. Claiming "no messages" here would be a measurement nobody took.
  if (!input.eventsEverReceived) {
    return {
      state: 'awaiting_first_event',
      showList: false,
      headline: `Nothing has come through yet`,
      body: `Sahoda is listening, and new ${noun} will appear here as they arrive. This is not a reading of your ${noun} — it is what has reached Sahoda so far, which is nothing.`,
    }
  }

  // Events have arrived and none of them was one of these. The only statement about
  // the customer in this file.
  return {
    state: 'empty',
    showList: false,
    headline: `No ${noun} yet`,
    body: `Sahoda is listening and has been receiving updates — none of them ${noun}.`,
  }
}

/**
 * Present a store decision to the shell, which speaks the LIVE classifier's
 * vocabulary.
 *
 * ── WHY A MAP AND NOT A WIDENED TYPE ─────────────────────────────────────────
 * Adding `awaiting_first_event` to `InboxEmptinessState` would put a store-only
 * concept into the type every live surface is written against, and every exhaustive
 * switch over it would silently gain a branch nobody wrote. The two vocabularies
 * describe different things — one is about what Zernio answered, the other about
 * what has been delivered — so they are kept apart and translated once, here.
 *
 * THE COPY IS NOT TRANSLATED. `headline` and `body` come through unchanged, so the
 * reader sees the store's own sentences; only the state TOKEN is mapped, and only so
 * that the banner and the placeholder know which shape to draw.
 *
 * The two mappings that carry a judgement, stated rather than buried:
 *
 *   ok_history_unavailable → 'partial'   The banner renders for 'partial', and
 *                                        partial is exactly right: rows are shown
 *                                        and some of the record is missing.
 *   awaiting_first_event   → 'not_read'  NEVER 'empty'. 'empty' is the shell's word
 *                                        for "we asked and there is nothing", and
 *                                        nobody asked — a webhook store is told.
 *                                        'not_read' keeps it out of that claim and
 *                                        out of the warning banner, which is right:
 *                                        listening and waiting is not a fault.
 */
export function toInboxEmptiness(decision: StoreDecision): InboxEmptiness {
  const state: InboxEmptinessState =
    decision.state === 'ok'
      ? 'ok'
      : decision.state === 'ok_history_unavailable'
        ? 'partial'
        : decision.state === 'never_connected'
          ? 'never_connected'
          : decision.state === 'empty'
            ? 'empty'
            : decision.state === 'awaiting_first_event'
              ? 'not_read'
              : 'unknown'

  return {
    state,
    showList: decision.showList,
    headline: decision.headline,
    body: decision.body,
    // No per-account failures exist on this path: the store does not fan out across
    // accounts, so there is no account that could have failed. An empty array is the
    // measurement, not a placeholder.
    failed: [],
  }
}
