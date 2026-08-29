import 'server-only'

import { createPgLedgerPort, loadBillingEnv, type PgLedgerPort } from '@sahoda/billing'
import type { Channel } from '@sahoda/shared'

import type { AutopilotRefusal } from '@/lib/loop/autopilot-refusals'
import type { AutopilotHistoryRow } from './history-copy'
import { toAnnouncedForPerson, toAnnouncedPost, toCandidateRow, toHistoryRow } from './row-mappers'
import type { AnnouncedPost } from './dispatch-due'
import {
  ACTIVE_BRAIN_SQL,
  POST_AUTOPILOT_HISTORY_SQL,
  ANNOUNCED_FOR_PERSON_SQL,
  ARM_FOR_PUBLISH_SQL,
  CANCEL_ANNOUNCEMENT_SQL,
  AUTOPILOT_CANDIDATES_SQL,
  AUTOPILOT_SETTINGS_SQL,
  DIAL_SQL,
  PENDING_ANNOUNCEMENTS_SQL,
  PUBLISHED_TODAY_SQL,
  WRITE_DECISION_SQL,
} from './sql'

/**
 * THE DISPATCHER'S READS AND WRITES. Server-only, and deliberately dull.
 *
 * ── WHY IT BORROWS THE LEDGER'S POOL ─────────────────────────────────────────
 * The same three reasons `lib/loop/store.ts` gives, and they have not changed:
 * one pool per serverless function against the same pooler rather than two, the
 * idle-client error guard that stops a dead connection killing the process, and
 * no `pg` type import, so apps/web gains no `@types/pg` and the lockfile does
 * not move while three other lanes are working in this repository.
 *
 * `loop_autopilot_log` carries a READ-ONLY tenant policy and an append-only
 * trigger that refuses UPDATE and DELETE even to service_role. This module runs
 * as the table owner, so `workspaceId` is a parameter it is TRUSTED with rather
 * than one it verifies: every statement carries it in the WHERE clause and the
 * callers resolve it first. `server-only` keeps this out of a client bundle.
 *
 * Every statement lives in `./sql.ts` where a real Postgres adjudicates it.
 * Nothing here builds a query string.
 */

let portSingleton: PgLedgerPort | undefined

function getPool(): PgLedgerPort['pool'] {
  if (!portSingleton) {
    const { databaseUrl } = loadBillingEnv()
    portSingleton = createPgLedgerPort({ connectionString: databaseUrl })
  }
  return portSingleton.pool
}

/** The workspace's autopilot settings. Nulls mean the Loop was never opened. */
export interface AutopilotSettings {
  dailyCap: number | null
  cancelMinutes: number | null
  weeklyBudgetCredits: number | null
}

export async function readSettings(workspaceId: string): Promise<AutopilotSettings> {
  const r = await getPool().query(AUTOPILOT_SETTINGS_SQL, [workspaceId])
  const row = r.rows[0] as
    | {
        autopilot_daily_cap: number | null
        autopilot_cancel_minutes: number | null
        weekly_budget_credits: number | null
      }
    | undefined
  return {
    dailyCap: row?.autopilot_daily_cap ?? null,
    cancelMinutes: row?.autopilot_cancel_minutes ?? null,
    weeklyBudgetCredits: row?.weekly_budget_credits ?? null,
  }
}

/**
 * The dial, as a lookup that answers `undefined` for a channel nobody set.
 *
 * ── WHY undefined AND NOT A DEFAULT ──────────────────────────────────────────
 * `governingLevel` defaults an unset channel to L1 and is right to, because a
 * brief has to be given SOME level. Autopilot is the opposite case: a channel
 * with no row is a channel the customer never armed, and defaulting it to
 * anything at all is how a product publishes somewhere nobody agreed to.
 * `decideOne` refuses `undefined` by name, and a test forces it.
 */
export async function readDial(workspaceId: string): Promise<Map<Channel, number>> {
  const r = await getPool().query(DIAL_SQL, [workspaceId])
  const dial = new Map<Channel, number>()
  for (const row of r.rows as { channel: Channel; level: number }[]) {
    dial.set(row.channel, row.level)
  }
  return dial
}

/** How many posts autopilot has announced or dispatched in the workspace's own day. */
export async function readPublishedToday(workspaceId: string): Promise<number> {
  const r = await getPool().query(PUBLISHED_TODAY_SQL, [workspaceId])
  return (r.rows[0] as { n: number } | undefined)?.n ?? 0
}

/** Announcements with no terminal row after them, oldest window first. */
export async function readPendingAnnouncements(
  workspaceId: string,
  limit = 200,
): Promise<AnnouncedPost[]> {
  const r = await getPool().query(PENDING_ANNOUNCEMENTS_SQL, [workspaceId, limit])
  return r.rows.map(toAnnouncedPost)
}

export interface DecisionRow {
  workspaceId: string
  postId: string
  variantId: string
  channel: Channel
  accountId: string
  briefId?: string | null
  cycleId?: string | null
  decision: 'announced' | 'dispatched' | 'refused' | 'cancelled'
  refusalReason?: AutopilotRefusal | null
  dispatchAfter?: Date | null
}

/**
 * Write one decision, and let the database refuse an incomplete one.
 *
 * ── WHY NOTHING IS DEFAULTED HERE ────────────────────────────────────────────
 * The four identifying columns are NOT NULL with a CHECK in the migration, and
 * the two conditional constraints (an announcement has a window; a refusal
 * names its guardrail) are CHECKs too. Softening any of them here — a `?? ''`
 * on the account, a fabricated window — would move the guard from the database
 * into this file, where the next caller does not inherit it. That is exactly
 * how `ops_audit_log` came to hold 16,915 rows that name nothing.
 */
export async function writeDecision(row: DecisionRow): Promise<string> {
  const r = await getPool().query(WRITE_DECISION_SQL, [
    row.workspaceId,
    row.postId,
    row.variantId,
    row.channel,
    row.accountId,
    row.briefId ?? null,
    row.cycleId ?? null,
    row.decision,
    row.refusalReason ?? null,
    row.dispatchAfter ? row.dispatchAfter.toISOString() : null,
  ])
  return (r.rows[0] as { id: string }).id
}

/** One row of the candidate scan, before either verdict has been computed. */
export interface CandidateRow {
  postId: string
  variantId: string
  channel: Channel
  body: string
  /** `post_variants.last_error`, untyped jsonb. Read defensively by the caller. */
  lastError: unknown
  /**
   * The account this would publish to, already verified against the same four
   * terms `assert_account_for_scheduled_post` uses. Never empty: the scan joins
   * the connection, so a variant with no publishable account is not a row.
   */
  accountId: string
  briefId: string | null
  cycleId: string | null
}

/**
 * The posts autopilot may consider, this workspace only.
 *
 * ── WHY THIS RETURNS ROWS AND NOT AutopilotCandidate ─────────────────────────
 * An `AutopilotCandidate` also carries `gateFlagged`, `fitsChannel` and a price.
 * None of those three is a column: the first two are verdicts computed from the
 * body, and the third is a lookup in pricing.config.json. Returning a
 * half-filled `AutopilotCandidate` with them defaulted would be the same defect
 * as a default of `''` on an account id — a value nobody decided, travelling as
 * though somebody had.
 *
 * `accountId` IS on the row, because the scan joins the connection rather than
 * leaving the account to a later lookup that could come back empty.
 */
export async function readCandidateRows(workspaceId: string, limit = 100): Promise<CandidateRow[]> {
  const r = await getPool().query(AUTOPILOT_CANDIDATES_SQL, [workspaceId, limit])
  return r.rows.map(toCandidateRow)
}

/**
 * Hand one post to the publish path that already exists, and report whether it
 * actually moved.
 *
 * ── THE BOOLEAN IS THE POINT ─────────────────────────────────────────────────
 * The statement carries its own guard: a post already `publishing` or
 * `published` is not re-armed, because putting it in front of the sweep a
 * second time publishes it twice. So `false` is not an error — it is the
 * database refusing correctly, and the caller must be able to tell that from
 * success rather than assuming the write landed. The dispatch and hold sweeps
 * take the same line with their own guarded writes.
 */
export async function armForPublish(workspaceId: string, postId: string): Promise<boolean> {
  const r = await getPool().query(ARM_FOR_PUBLISH_SQL, [workspaceId, postId])
  return r.rows.length > 0
}

/**
 * The active Brand Brain payload, or null when there is none.
 *
 * ── NULL IS "NO BRAIN", AND IT REFUSES ───────────────────────────────────────
 * `brainClearsAutopilotFloor(null)` is false, so an absent brain refuses with
 * BRAIN_BELOW_FLOOR by name. That is the safe direction and it is deliberate:
 * a read that came back empty and a business nobody has described are the same
 * thing as far as publishing unattended is concerned.
 */
export async function readActiveBrain(workspaceId: string): Promise<unknown> {
  const r = await getPool().query(ACTIVE_BRAIN_SQL, [workspaceId])
  return (r.rows[0] as { payload: unknown } | undefined)?.payload ?? null
}

/**
 * Stop one announced post, and report whether the stop actually took.
 *
 * ── FALSE IS AN ANSWER A PERSON NEEDS, NOT AN ERROR ──────────────────────────
 * It means the post was already dispatched or already cancelled, and the
 * caller must be able to say which of those happened rather than showing
 * "stopped" over a post that has gone out. The statement re-derives the
 * announcement and re-checks for a terminal row inside the same statement as
 * the insert, so a dispatch that lands first wins the race and this returns
 * false — the one outcome a read-then-write would have got wrong.
 */
export async function cancelAnnouncement(
  workspaceId: string,
  postId: string,
  variantId: string,
): Promise<boolean> {
  const r = await getPool().query(CANCEL_ANNOUNCEMENT_SQL, [workspaceId, postId, variantId])
  return r.rows.length > 0
}

/** One post autopilot has announced, in the words a person recognises. */
export interface AnnouncedForPerson {
  postId: string
  variantId: string
  channel: Channel
  /** The title the person wrote. Never an id. */
  postTitle: string
  /** When the window closes. In the past for one the sweep has not reached. */
  dispatchAfter: Date
  announcedAt: Date
}

export async function readAnnouncedForPerson(
  workspaceId: string,
  limit = 50,
): Promise<AnnouncedForPerson[]> {
  const r = await getPool().query(ANNOUNCED_FOR_PERSON_SQL, [workspaceId, limit])
  return r.rows.map(toAnnouncedForPerson)
}

/**
 * Run a statement that selects `workspace_id` and return the ids.
 *
 * Takes the SQL rather than naming one, because the caller decides WHICH
 * workspaces it means and the statements all live in ./sql.ts where a real
 * Postgres adjudicates them. Nothing here builds a query string.
 */
export async function readWorkspaceIds(sql: string, limit: number): Promise<string[]> {
  const r = await getPool().query(sql, [limit])
  return (r.rows as { workspace_id: string }[]).map((row) => row.workspace_id)
}

/**
 * One post's autopilot history, shaped for `autopilotStatus`.
 *
 * An empty array is a real answer and not a failure: autopilot has never
 * decided anything about this post, which `autopilotStatus` reports as
 * "has not looked at" rather than as a refusal. Those are different facts.
 */
export async function readPostAutopilotHistory(
  workspaceId: string,
  postId: string,
  variantId: string,
): Promise<AutopilotHistoryRow[]> {
  const r = await getPool().query(POST_AUTOPILOT_HISTORY_SQL, [workspaceId, postId, variantId])
  return r.rows.map(toHistoryRow)
}
