import type { Channel } from '@sahoda/shared'

import {
  classifyFailure,
  recordFailure,
  type CountedReconcileFailure,
  type ReconcileFailureEvent,
  type ReconcileScope,
  type ReconcileStage,
} from './failures'

/**
 * The polling sweep that stands in for webhooks we cannot verify.
 *
 * ── WHY THERE IS NO WEBHOOK RECEIVER ─────────────────────────────────────────
 * doc 13 §2.5 records an `account.disconnected` webhook, marked `[DOC]` — read in
 * their documentation, never observed. doc 13's open question 6 is precisely
 * "Webhook: signing scheme, retry behaviour, and does the event carry the profile
 * ID for workspace routing?" and it is still open. No OpenAPI spec is served at
 * zernio.com (checked: /openapi.json, /api/openapi.json, /api/v1/openapi.json,
 * /docs/openapi.json — all 404).
 *
 * A receiver that cannot verify a signature is an unauthenticated, internet-facing
 * endpoint that mutates connection state and post state for a workspace named in
 * its own body. Anyone who guesses the URL can mark another customer's account
 * disconnected, or mark a post published that never went out. That is strictly
 * worse than not having webhooks, so it is not built.
 *
 * This sweep asks instead. It is slower and it costs requests, and it cannot be
 * fooled by anyone who has not got our API key.
 *
 * ── THE TWO THINGS IT ANSWERS ────────────────────────────────────────────────
 * 1. Which accounts have quietly stopped working. Zernio's 60-day tokens have no
 *    refresh and no proactive signal, and `needsReconnection` / `platformStatus`
 *    only change on their side. Re-reading them is the only way to learn.
 *
 * 2. How a post that was still processing actually ended. Instagram's publish is
 *    two-phase: the adapter polls ~36s for a live URL and gives up as
 *    STILL_PROCESSING if it has not arrived. The post frequently DOES go live
 *    afterwards. Without this, the variant stays unresolved forever while the
 *    content sits on the customer's feed — our record and their account
 *    disagreeing, permanently, with nothing to reconcile them.
 */

export type ReconcileMode = 'off' | 'report' | 'on'

/** One connection to re-check, already resolved to its Zernio profile. */
export interface ConnectionToCheck {
  connectionId: string
  workspaceId: string
  profileId: string
  accountId: string
  /** Which channel this connection is for — all four ride the same rail now. */
  platform: string
}

/** One variant that was accepted by the platform but never resolved here. */
export interface UnresolvedPublish {
  variantId: string
  workspaceId: string
  postId: string
  channel: Channel
  /**
   * ZERNIO's own post id, recorded when the adapter gave up mid-flight. This is the
   * handle we pass to `GET /posts/{id}` to ask how the post ended — it is NOT a
   * platform post id and must never be written to `post_variants.platform_post_id`.
   *
   * Named `providerPostId` for exactly that reason: it used to be called
   * `platformPostId`, and the name is what made it look safe to store.
   */
  providerPostId: string
}

/** What Zernio says about an account right now. */
export interface AccountFacts {
  accountId: string
  needsReconnection: boolean
  platformStatus: string | null
  tokenExpiresAt: string | null
}

/** How a previously-unresolved publish actually ended. */
export type PublishResolution =
  /** `platformPostId` is the PLATFORM's id, null when it has still not issued one. */
  | { kind: 'published'; permalink: string; platformPostId: string | null }
  | { kind: 'failed'; reason: string | null }
  /** Still in the container flow. Left alone — it may yet go either way. */
  | { kind: 'pending' }

export interface ReconcileSweepDeps {
  mode: ReconcileMode
  listConnectionsToCheck(): Promise<ConnectionToCheck[]>
  listUnresolvedPublishes(): Promise<UnresolvedPublish[]>
  /** Ask Zernio about the accounts under one profile. */
  readAccounts(profileId: string): Promise<AccountFacts[]>
  /** Ask Zernio how one post ended. */
  readPublish(item: UnresolvedPublish): Promise<PublishResolution>
  /** Write account health back onto the connection row. */
  applyAccountFacts(connection: ConnectionToCheck, facts: AccountFacts): Promise<void>
  /** Settle a variant that has finally resolved. */
  applyResolution(item: UnresolvedPublish, resolution: PublishResolution): Promise<void>
  /**
   * Where the real error goes.
   *
   * The report is returned on a public URL and may only carry classifications, so the
   * cause would otherwise have nowhere to live. Optional: a caller that does not log
   * loses the detail, which is the old behaviour and not made worse by this hook.
   */
  onFailure?(event: ReconcileFailureEvent): void
}

/**
 * How a whole pass went, in one word.
 *
 * `clean` covers a pass that found nothing to do as well as one that did everything
 * asked of it — in both, nothing went wrong. `failed` is the case this exists for: a
 * pass where every unit threw used to be indistinguishable from a quiet success,
 * because the counters it left behind were the counters of an idle tick plus a number
 * nobody looks at.
 */
export type ReconcileOutcome = 'clean' | 'degraded' | 'failed'

export interface ReconcileReport {
  mode: ReconcileMode
  outcome: ReconcileOutcome
  connectionsChecked: number
  /** Executed writes. Zero in `off` and `report`. */
  connectionsUpdated: number
  /** Intent count, populated in every mode so a dry run predicts `on` (mirrors holds). */
  wouldUpdate: number
  connectionsFailed: number
  publishesChecked: number
  /** Executed writes. Zero in `off` and `report`. */
  publishesResolved: number
  wouldResolve: number
  publishesFailed: number
  /** Accepted by the platform, still not finished. Counted, never guessed at. */
  stillPending: number
  /** `connectionsFailed + publishesFailed` — the one number a dashboard row shows. */
  failed: number
  /** What went wrong, by kind and count. Codes only: see ./failures. */
  failures: CountedReconcileFailure[]
}

const empty = (mode: ReconcileMode): ReconcileReport => ({
  mode,
  outcome: 'clean',
  connectionsChecked: 0,
  connectionsUpdated: 0,
  wouldUpdate: 0,
  connectionsFailed: 0,
  publishesChecked: 0,
  publishesResolved: 0,
  wouldResolve: 0,
  publishesFailed: 0,
  stillPending: 0,
  failed: 0,
  failures: [],
})

/**
 * Nothing failed, some of it failed, or all of it did.
 *
 * `failed >= checked` can only hold when every unit threw, because a unit is counted
 * as checked before it is attempted and can fail at most once.
 */
function outcomeOf(report: ReconcileReport): ReconcileOutcome {
  if (report.failed === 0) return 'clean'
  const checked = report.connectionsChecked + report.publishesChecked
  return report.failed >= checked ? 'failed' : 'degraded'
}

/**
 * Run one reconciliation pass.
 *
 * Same three-state flag as the other sweeps and for the same reason: deploying
 * this must not, by itself, start changing rows. `off` reads nothing at all,
 * `report` reads and decides and writes nothing, `on` executes.
 *
 * Every unit of work is independently try/caught. One workspace whose Zernio
 * profile has been deleted must not stop every other workspace from learning that
 * its token expires on Thursday.
 *
 * ── WHAT A FAILURE IS ALLOWED TO COST ────────────────────────────────────────
 * Those catches used to be `catch {}`: the cause was discarded at the point it was
 * caught, and the only trace left was one shared `failed` counter. A pass in which
 * all 25 connections and all 25 publishes threw returned `failed: 50` beside an
 * otherwise idle-looking set of zeros, the route answered 200, and "Zernio is not
 * provisioned here", "Zernio returned 500 fifty times" and "the database refused
 * every write" were the same report.
 *
 * Now each failure is classified where it is caught (`./failures`) and counted by
 * kind, the pass says in one word whether it went `clean`, `degraded` or `failed`,
 * and the untouched error is handed to `onFailure` for a logger that may see a
 * message. The report itself still carries no message and no row id, because it is
 * returned on a public URL.
 *
 * The two `list*` calls are deliberately NOT caught. A candidate query that fails
 * means the pass did not happen at all, and that is the route's `catch` to name —
 * counting it here would report a tick that read nothing as one that found nothing.
 */
export async function runReconcileSweep(deps: ReconcileSweepDeps): Promise<ReconcileReport> {
  const report = empty(deps.mode)
  if (deps.mode === 'off') return report

  /** Count it, classify it for the body, hand the real thing to the logger. */
  const fail = (scope: ReconcileScope, stage: ReconcileStage, error: unknown): void => {
    recordFailure(report.failures, scope, stage, error)
    if (scope === 'connection') report.connectionsFailed += 1
    else report.publishesFailed += 1
    report.failed += 1
    deps.onFailure?.({ scope, stage, ...classifyFailure(stage, error), error })
  }

  const connections = await deps.listConnectionsToCheck()
  for (const connection of connections) {
    report.connectionsChecked += 1
    // Which call is in flight. A `pool.query` rejection looks the same as a Zernio
    // one, and only this loop knows which of the two it just made.
    let stage: ReconcileStage = 'read'
    try {
      const accounts = await deps.readAccounts(connection.profileId)
      const match = accounts.find((a) => a.accountId === connection.accountId)
      // A missing account is the disconnected signal, arrived by asking rather than
      // by being told — recorded as needing reconnection rather than deleted: the row
      // carries history the customer may still want, and deleting on a single read
      // would make one flaky response destroy a connection.
      const facts = match ?? {
        accountId: connection.accountId,
        needsReconnection: true,
        platformStatus: 'not listed under this profile',
        tokenExpiresAt: null,
      }
      report.wouldUpdate += 1
      if (deps.mode === 'on') {
        stage = 'write'
        await deps.applyAccountFacts(connection, facts)
        report.connectionsUpdated += 1
      }
    } catch (error) {
      fail('connection', stage, error)
    }
  }

  const unresolved = await deps.listUnresolvedPublishes()
  for (const item of unresolved) {
    report.publishesChecked += 1
    let stage: ReconcileStage = 'read'
    try {
      const resolution = await deps.readPublish(item)
      if (resolution.kind === 'pending') {
        // Not an error and not a success. Counted as what it is, and left for the
        // next pass — the one thing that must never happen here is deciding.
        report.stillPending += 1
        continue
      }
      report.wouldResolve += 1
      if (deps.mode === 'on') {
        stage = 'write'
        await deps.applyResolution(item, resolution)
        report.publishesResolved += 1
      }
    } catch (error) {
      fail('publish', stage, error)
    }
  }

  report.outcome = outcomeOf(report)
  return report
}
