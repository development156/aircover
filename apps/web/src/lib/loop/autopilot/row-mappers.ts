import type { Channel } from '@sahoda/shared'

/**
 * DATABASE ROWS INTO THE OBJECTS THE DECISIONS TAKE.
 *
 * ── WHY THESE LEFT store.ts, AND IT IS NOT TIDINESS ──────────────────────────
 * Everything on either side of this mapping was proven and the mapping itself
 * was not. `loop_autopilot_sql.pglite.test.ts` sends the statements to a real
 * Postgres and asserts what comes back, column by column. The unit suites mock
 * the store entirely and assert what the decisions do with a well-formed
 * object. Neither one ever ran a REAL ROW through the REAL MAPPER: a column
 * renamed in the SQL, or a typo in `row.account_id`, would leave both halves
 * green and hand `undefined` to a decision.
 *
 * That is the exact shape of the kill-switch defect found earlier in this
 * branch — three correct guards either side of a seam, and nothing on the seam.
 * Pure functions here mean `loop_autopilot_sql.pglite.test.ts` can feed them
 * rows it just read out of a database, which is the only test that covers it.
 *
 * ── EVERY ONE TAKES `unknown` AND NAMES ITS COLUMNS ──────────────────────────
 * Not a typed row parameter. A hand-written `{ post_id: string }` interface is
 * an assertion about the database written in the same file as the code that
 * trusts it, so it can be wrong in both places at once and still typecheck.
 * `unknown` forces the read to go through a named column and makes the pglite
 * test the only thing that can vouch for the name.
 *
 * ── AND WHY THIS FILE IMPORTS NOTHING FROM THE DECISION MODULES ──────────────
 * It is imported by `packages/db`'s pglite suite, whose tsconfig does not carry
 * apps/web's `@/` path alias. Importing `AnnouncedPost` from './dispatch-due'
 * chains through `./decide` to `@/lib/brand/autopilot-floor` and breaks
 * `@sahoda/db#typecheck` — MEASURED, and caught by capturing turbo's own output
 * rather than by re-running a package on its own.
 *
 * So the shapes are declared here and the decision modules are checked against
 * them by `row-mappers.contract.test.ts`, which lives in apps/web where the
 * alias resolves. Structural duplication with an assignability check beats an
 * import that a second package cannot follow — and the check is what stops the
 * two drifting.
 */

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (typeof v !== 'string') {
    // Loud, and it names the column. A silent `?? ''` here is how an account id
    // becomes the empty string that `loop_autopilot_log` refuses and 16,915
    // rows of `ops_audit_log` never did.
    throw new Error(`autopilot row is missing a string column: ${key}`)
  }
  return v
}

function nullableStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key]
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') throw new Error(`autopilot row column is not a string: ${key}`)
  return v
}

function date(row: Record<string, unknown>, key: string): Date {
  const v = row[key]
  if (v instanceof Date) return v
  if (typeof v === 'string') {
    const d = new Date(v)
    // An unparseable timestamp is not a date. Letting NaN through would give a
    // cancel window that is never open and never closed, because every
    // comparison against NaN is false.
    if (Number.isFinite(d.getTime())) return d
  }
  throw new Error(`autopilot row is missing a timestamp column: ${key}`)
}

function nullableDate(row: Record<string, unknown>, key: string): Date | null {
  const v = row[key]
  if (v === null || v === undefined) return null
  return date(row, key)
}

/** A row of `PENDING_ANNOUNCEMENTS_SQL`. Must stay assignable to `AnnouncedPost`. */
export interface AnnouncedPostShape {
  postId: string
  variantId: string
  channel: Channel
  accountId: string
  dispatchAfter: Date
}

export function toAnnouncedPost(row: unknown): AnnouncedPostShape {
  const r = row as Record<string, unknown>
  return {
    postId: str(r, 'post_id'),
    variantId: str(r, 'variant_id'),
    channel: str(r, 'channel') as Channel,
    accountId: str(r, 'account_id'),
    dispatchAfter: date(r, 'dispatch_after'),
  }
}

/** A row of `AUTOPILOT_CANDIDATES_SQL`. */
export interface CandidateRowShape {
  postId: string
  variantId: string
  channel: Channel
  body: string
  lastError: unknown
  accountId: string
  briefId: string | null
  cycleId: string | null
}

export function toCandidateRow(row: unknown): CandidateRowShape {
  const r = row as Record<string, unknown>
  return {
    postId: str(r, 'post_id'),
    variantId: str(r, 'variant_id'),
    channel: str(r, 'channel') as Channel,
    body: str(r, 'body'),
    // Untyped jsonb, and deliberately not narrowed: the caller reads it
    // defensively or not at all.
    lastError: r.last_error ?? null,
    accountId: str(r, 'account_id'),
    briefId: nullableStr(r, 'brief_id'),
    cycleId: nullableStr(r, 'cycle_id'),
  }
}

/** A row of `ANNOUNCED_FOR_PERSON_SQL`. */
export interface AnnouncedForPersonShape {
  postId: string
  variantId: string
  channel: Channel
  postTitle: string
  dispatchAfter: Date
  announcedAt: Date
}

export function toAnnouncedForPerson(row: unknown): AnnouncedForPersonShape {
  const r = row as Record<string, unknown>
  return {
    postId: str(r, 'post_id'),
    variantId: str(r, 'variant_id'),
    channel: str(r, 'channel') as Channel,
    postTitle: str(r, 'post_title'),
    dispatchAfter: date(r, 'dispatch_after'),
    announcedAt: date(r, 'announced_at'),
  }
}

/** A row of `POST_AUTOPILOT_HISTORY_SQL`. Must stay assignable to `AutopilotHistoryRow`. */
export interface HistoryRowShape {
  decision: 'announced' | 'dispatched' | 'refused' | 'cancelled'
  refusalReason: string | null
  dispatchAfter: Date | null
  createdAt: Date
  actor: string
}

export function toHistoryRow(row: unknown): HistoryRowShape {
  const r = row as Record<string, unknown>
  return {
    decision: str(r, 'decision') as HistoryRowShape['decision'],
    refusalReason: nullableStr(r, 'refusal_reason'),
    dispatchAfter: nullableDate(r, 'dispatch_after'),
    createdAt: date(r, 'created_at'),
    actor: str(r, 'actor'),
  }
}
