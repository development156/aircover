import type { ZernioInboxMeta } from '@sahoda/publishing'

/**
 * Telling "nothing is there" apart from "we could not ask".
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Zernio does NOT fail an `/inbox/*` call when one account errors. It returns HTTP 200
 * with `data: []` and reports the failure in `meta`. So an empty list has several
 * genuinely different meanings, and rendering one sentence for all of them makes Sahoda
 * lie — usually in the direction of a claim about the CUSTOMER'S SHOP that we have no
 * evidence for. "No reviews" is the worst of them: we asked nobody.
 *
 * Only ONE of the states below earns "none yet", and it is the one where every
 * connected account answered and the answer was nothing.
 *
 * ── WHY THE META TYPE IS IMPORTED, NOT REDECLARED ────────────────────────────
 * `ZernioInboxMeta` is a wire shape and `@sahoda/publishing` owns it, next to the client
 * that parses it. Redeclaring a structurally-identical copy here would compile happily
 * and then drift the first time Zernio adds a field.
 */

/**
 * A failed account, projected for display.
 *
 * `error` is deliberately NOT carried through: it is an upstream string that can contain
 * an auth header or token fragment, and this object is rendered in the browser. Raw
 * upstream errors belong in the server log and Sentry, never in the DOM.
 */
export interface FailedAccountSummary {
  platform?: string
  accountUsername?: string
  code?: string
  retryAfter?: number
}

/** Per-surface nouns, so one classifier writes correct copy for all three lists. */
export interface InboxSurface {
  /** Plural noun for the rows: "conversations", "comments", "reviews". */
  noun: string
  /** What has to be connected first, phrased to slot after "once …". */
  connectPrompt: string
}

export const INBOX_SURFACES = {
  conversations: {
    noun: 'conversations',
    connectPrompt: 'an Instagram, Facebook or WhatsApp account is connected',
  },
  comments: {
    noun: 'comments',
    connectPrompt: 'an Instagram or Facebook account is connected',
  },
  reviews: {
    noun: 'reviews',
    connectPrompt: 'a Google Business Profile is connected',
  },
  /**
   * One thread, not the list. Its own noun because "no conversations yet" on a thread
   * the user just opened is the wrong sentence — the conversation exists; what may be
   * missing is its messages.
   */
  thread: {
    noun: 'messages',
    connectPrompt: 'an Instagram, Facebook or WhatsApp account is connected',
  },
} as const satisfies Record<string, InboxSurface>

export type InboxSurfaceKey = keyof typeof INBOX_SURFACES

/**
 * Every distinct thing an inbox list can mean.
 *
 * `empty` is the only one that is a statement about the customer. The other six are
 * statements about Sahoda — what it holds, what it asked, and what came back.
 */
export type InboxEmptinessState =
  | 'ok'
  | 'partial'
  | 'empty'
  | 'never_connected'
  | 'unresolved'
  | 'could_not_ask'
  | 'not_read'
  | 'unknown'

export interface InboxEmptiness {
  state: InboxEmptinessState
  /** Render the rows? True whenever any arrived, even alongside a failure. */
  showList: boolean
  headline: string
  body: string
  failed: FailedAccountSummary[]
}

export interface ClassifyInput {
  rows: number
  meta: ZernioInboxMeta | undefined
  surface: InboxSurface
  /**
   * This workspace's own count of connections Zernio could be asked about — a real
   * measurement from `connections`, not a placeholder. It exists to catch the case
   * `meta` alone cannot express: we hold an account and Zernio queried none of them.
   */
  connectedAccounts: number | null
  /**
   * Whether Zernio says more rows exist beyond this page.
   *
   * Only load-bearing when `rows` is 0 for a reason that is not "Zernio sent nothing" —
   * the comments surface drops posts carrying no comments, so a page can filter down to
   * empty while later pages hold every comment the customer has. Claiming "none yet"
   * from that is precisely the measurement-we-never-took this module refuses to make.
   */
  hasMore?: boolean
  /**
   * Did this read fan out across the workspace's accounts?
   *
   * True for the three profile-scoped lists, which ask every connected account and
   * report per-account health in `meta`. **False** for the two account-scoped reads —
   * one thread, one post's comments — which ask exactly one account, already resolved
   * through `accountByIdForWorkspace`.
   *
   * The distinction is not cosmetic. `[LIVE 2026-08-10]` neither account-scoped endpoint
   * sends `ZernioInboxMeta` at all, so without this every successful thread read fell
   * into the `!meta` branch and rendered "Sahoda could not confirm this view is
   * complete" — a warning banner, on a read that fully succeeded, on the two surfaces
   * holding the only real data we have. "We cannot confirm every account answered" is
   * meaningless where exactly one account was asked and it answered.
   *
   * A missing `meta` on a fan-out list is still genuinely unconfirmable. The bug was
   * applying that doubt to a read that has nothing to be doubtful about.
   */
  fanOut?: boolean
}

const projectFailures = (meta: ZernioInboxMeta | undefined): FailedAccountSummary[] =>
  (meta?.failedAccounts ?? []).map((f) => ({
    platform: f.platform,
    accountUsername: f.accountUsername,
    code: f.code,
    retryAfter: f.retryAfter,
  }))

/**
 * No read was attempted, because the Zernio rail is not provisioned in this build.
 *
 * Distinct from every state below, all of which describe an answer. This one describes
 * a question that was never asked, and no amount of connecting accounts fixes it.
 */
export function notRead(surface: InboxSurface): InboxEmptiness {
  return {
    state: 'not_read',
    showList: false,
    headline: `Sahoda has not read your ${surface.noun} yet`,
    body: `The connection to our publishing partner is not configured in this environment, so no request went out. This is not a reading of your ${surface.noun}.`,
    failed: [],
  }
}

/**
 * The workspace has never connected anything this surface could read.
 *
 * Used when there is no Zernio profile at all — the read is not merely unanswered,
 * there is nothing to address it to.
 */
export function neverConnected(surface: InboxSurface): InboxEmptiness {
  return {
    state: 'never_connected',
    showList: false,
    headline: `Connect an account to see ${surface.noun} here`,
    body: `Sahoda has not asked any account for this workspace, so it has nothing to show yet. This is not a reading of your ${surface.noun}. Your ${surface.noun} appear here once ${surface.connectPrompt}.`,
    failed: [],
  }
}

/** The request went out and came back without an answer. */
export function couldNotAsk(surface: InboxSurface): InboxEmptiness {
  return {
    state: 'could_not_ask',
    showList: false,
    headline: `Sahoda could not reach your connected accounts`,
    body: `The request went out but came back without an answer, so this is not a reading of your ${surface.noun}. Nothing was charged. Refresh to try again.`,
    failed: [],
  }
}

/**
 * Classify one `/inbox/*` result into a state the UI can render honestly.
 *
 * ── WHY `accountsQueried` IS A SIGNAL AND NEVER A NUMBER WE PRINT ────────────
 * `[LIVE 2026-08-10]`: the conversations response reported `accountsQueried: 2` for a
 * workspace with ONE connected Instagram account — and `GET /accounts` unscoped returns
 * exactly one account on the entire API key, so it is not counting accounts in any
 * sense we share. The old copy rendered it verbatim: *"All 2 connected accounts
 * answered"*, to a customer who has one.
 *
 * It is a fact about Zernio's fan-out, not about the customer's inventory, and this
 * module used to conflate the two. Substituting our own `connectedAccounts` would be
 * worse — the `partial` branch reads "N of M", and cross-sourcing those halves yields
 * "2 of 1 did not answer". So: the ratio branch keeps BOTH of Zernio's numbers (one
 * source, internally consistent, a statement about the query), and the branches that
 * merely need "someone answered" stop printing a count at all.
 *
 * The `=== 0` comparison below is untouched. That is a signal use, and it is correct —
 * the live reviews payload (`accountsQueried: 0`, no GBP ever connected) resolves to
 * `neverConnected` exactly as intended. Why 2 is unanswerable from here; it is filed as
 * a wt-pub ask in `apps/web/REQUESTS.md` rather than guessed at.
 *
 * Order matters, and it is "what do we know about the question" before "what came back":
 *
 *  1. No `meta` at all → we cannot confirm the view is complete. Not empty.
 *  2. Zernio queried nobody → either nothing is connected, or we hold a connection it
 *     did not recognise. Those are different sentences (see `unresolved`).
 *  3. Failures with no rows → we could not ask.
 *  4. Failures with rows → partial; show them, and say the view is incomplete.
 *  5. No rows, no failures, ≥1 account asked → genuinely empty. The only "none yet".
 */
export function classifyInboxResult({
  rows,
  meta,
  surface,
  connectedAccounts,
  hasMore = false,
  fanOut = true,
}: ClassifyInput): InboxEmptiness {
  const failed = projectFailures(meta)

  // ── EVERY BRANCH BELOW READS `meta`, SO EVERY ONE IS FAN-OUT ONLY ──────────
  // A single-account read carries no per-account status because there are no other
  // accounts to have a status. It falls straight through to the row-count branches,
  // which is the only question that can be asked of it.
  if (fanOut) {
    if (!meta) {
      return {
        state: 'unknown',
        showList: rows > 0,
        headline: `Sahoda could not confirm this ${surface.noun} view is complete`,
        body: `Sahoda cannot tell whether every connected account answered, so some ${surface.noun} may be missing from this list. Refresh to try again.`,
        failed,
      }
    }
    return classifyFanOut({ rows, meta, surface, connectedAccounts, hasMore, failed })
  }

  return classifyRows({ rows, surface, hasMore, failed })
}

interface FanOutInput extends Required<
  Pick<ClassifyInput, 'rows' | 'surface' | 'connectedAccounts'>
> {
  meta: ZernioInboxMeta
  hasMore: boolean
  failed: FailedAccountSummary[]
}

function classifyFanOut({
  rows,
  meta,
  surface,
  connectedAccounts,
  hasMore,
  failed,
}: FanOutInput): InboxEmptiness {
  if (meta.accountsQueried === 0) {
    // We could not count our own connections, so the two branches below — one of
    // which tells the customer to connect an account — are both unsupportable.
    // `null` is NOT 0: `null > 0` is false in JS, so without this the failed
    // count fell straight through to "nothing is connected".
    if (connectedAccounts === null) {
      return {
        state: 'unknown',
        showList: false,
        headline: `Sahoda could not confirm this ${surface.noun} view is complete`,
        body: `Our publishing partner asked no account, and Sahoda could not check which accounts you have connected, so it cannot tell whether nothing is connected or something needs reconnecting. This is not a reading of your ${surface.noun}. Refresh to try again.`,
        failed,
      }
    }
    // ── THE DIVERGENCE THAT IS NOT A ZERO ────────────────────────────────────
    // We hold at least one connection Zernio could be asked about, and Zernio asked
    // none. That is "cannot resolve", the same distinction `syncStatus: orphaned`
    // draws on the analytics side: our row points at an account the partner did not
    // recognise. Reporting it as "nothing connected" would tell the customer to
    // connect an account they already connected; reporting it as "no conversations"
    // would be a measurement we never took.
    if (connectedAccounts > 0) {
      return {
        state: 'unresolved',
        showList: false,
        headline: `Sahoda could not resolve your connected ${connectedAccounts === 1 ? 'account' : 'accounts'}`,
        body: `This workspace has ${connectedAccounts} connected ${connectedAccounts === 1 ? 'account' : 'accounts'} for ${surface.noun}, but our publishing partner did not recognise ${connectedAccounts === 1 ? 'it' : 'any of them'} and sent no request at all. This is not a reading of your ${surface.noun}. Reconnect the ${connectedAccounts === 1 ? 'account' : 'accounts'} to fix it.`,
        failed,
      }
    }
    return neverConnected(surface)
  }

  if (meta.accountsFailed > 0 && rows === 0) {
    return {
      state: 'could_not_ask',
      showList: false,
      headline: `Sahoda could not reach ${meta.accountsFailed === 1 ? 'a connected account' : `${meta.accountsFailed} connected accounts`}`,
      body: `The request went out but came back without an answer, so this is not a reading of your ${surface.noun}. Nothing was charged. Refresh to try again.`,
      failed,
    }
  }

  if (meta.accountsFailed > 0) {
    return {
      state: 'partial',
      showList: true,
      headline: `Showing part of your ${surface.noun}`,
      body: `${meta.accountsFailed} of ${meta.accountsQueried} connected accounts did not answer, so some ${surface.noun} may be missing from this list. Refresh to try again.`,
      failed,
    }
  }

  return classifyRows({ rows, surface, hasMore, failed })
}

/**
 * What the row count alone says, once every question about WHO answered is settled.
 *
 * Shared by both paths deliberately: a fan-out list that heard from everyone and a
 * single-account read that heard from its one account are in the same position, and
 * two copies of these three sentences would drift.
 */
function classifyRows({
  rows,
  surface,
  hasMore,
  failed,
}: {
  rows: number
  surface: InboxSurface
  hasMore: boolean
  failed: FailedAccountSummary[]
}): InboxEmptiness {
  if (rows === 0 && hasMore) {
    // Nothing on THIS page and Zernio says there is more. "None yet" would be a
    // statement about the customer drawn from a page we chose not to show.
    return {
      state: 'unknown',
      showList: false,
      headline: `Sahoda could not confirm this ${surface.noun} view is complete`,
      body: `There is nothing on this page, but our publishing partner reports more to read. Refresh to try again.`,
      failed,
    }
  }

  if (rows === 0) {
    return {
      state: 'empty',
      showList: false,
      headline: `No ${surface.noun} yet`,
      body: `Every account Sahoda asked answered, and there is nothing waiting. New ${surface.noun} land here automatically.`,
      failed,
    }
  }

  return {
    state: 'ok',
    showList: true,
    headline: `Showing your ${surface.noun}`,
    body: `Every account Sahoda asked answered.`,
    failed,
  }
}
