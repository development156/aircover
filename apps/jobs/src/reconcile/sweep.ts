import type { Channel } from '@sahoda/shared'

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
}

/** One variant that was accepted by the platform but never resolved here. */
export interface UnresolvedPublish {
  variantId: string
  workspaceId: string
  postId: string
  channel: Channel
  /** Zernio's own post id, recorded when the adapter gave up mid-flight. */
  platformPostId: string
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
  | { kind: 'published'; permalink: string; platformPostId: string }
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
}

export interface ReconcileReport {
  mode: ReconcileMode
  connectionsChecked: number
  connectionsUpdated: number
  publishesChecked: number
  publishesResolved: number
  /** Accepted by the platform, still not finished. Counted, never guessed at. */
  stillPending: number
  failed: number
}

const empty = (mode: ReconcileMode): ReconcileReport => ({
  mode,
  connectionsChecked: 0,
  connectionsUpdated: 0,
  publishesChecked: 0,
  publishesResolved: 0,
  stillPending: 0,
  failed: 0,
})

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
 */
export async function runReconcileSweep(deps: ReconcileSweepDeps): Promise<ReconcileReport> {
  const report = empty(deps.mode)
  if (deps.mode === 'off') return report

  const connections = await deps.listConnectionsToCheck()
  for (const connection of connections) {
    report.connectionsChecked += 1
    try {
      const accounts = await deps.readAccounts(connection.profileId)
      const match = accounts.find((a) => a.accountId === connection.accountId)
      if (!match) {
        // The account is gone from the profile entirely. That IS the disconnected
        // signal, arrived by asking rather than by being told — but it is recorded
        // as needing reconnection rather than deleted: the row carries history the
        // customer may still want, and deleting on a single read would make one
        // flaky response destroy a connection.
        if (deps.mode === 'on') {
          await deps.applyAccountFacts(connection, {
            accountId: connection.accountId,
            needsReconnection: true,
            platformStatus: 'not listed under this profile',
            tokenExpiresAt: null,
          })
        }
        report.connectionsUpdated += 1
        continue
      }
      if (deps.mode === 'on') await deps.applyAccountFacts(connection, match)
      report.connectionsUpdated += 1
    } catch {
      report.failed += 1
    }
  }

  const unresolved = await deps.listUnresolvedPublishes()
  for (const item of unresolved) {
    report.publishesChecked += 1
    try {
      const resolution = await deps.readPublish(item)
      if (resolution.kind === 'pending') {
        // Not an error and not a success. Counted as what it is, and left for the
        // next pass — the one thing that must never happen here is deciding.
        report.stillPending += 1
        continue
      }
      if (deps.mode === 'on') await deps.applyResolution(item, resolution)
      report.publishesResolved += 1
    } catch {
      report.failed += 1
    }
  }

  return report
}
