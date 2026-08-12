import type { Pool } from 'pg'

/**
 * The gate's database side: read the rules that apply, write the record of what
 * was checked. Two statements, both scoped by POST ID.
 */

export interface GateContext {
  /**
   * The post's real workspace, re-derived from `posts` — NOT the payload's.
   * Everything the gate writes is scoped by this value.
   */
  workspaceId: string
  /** `brand_memory.version` the rules were read from, or null when there is no brain. */
  brandVersion: number | null
  /** The raw `payload` jsonb. Read tolerantly by `@sahoda/shared`'s brain-rules. */
  payload: unknown
}

export interface GateStoreOptions {
  pool: Pool
}

export function createGateStore(opts: GateStoreOptions) {
  const { pool } = opts

  /**
   * The active Brand Brain for the post's workspace.
   *
   * ── WHY THE JOIN STARTS AT `posts` AND NOT AT THE PAYLOAD'S workspaceId ─────
   * `PublishPostPayload.workspaceId` is derived at dispatch from
   * `posts.workspace_id` and then crosses a queue as ordinary payload data;
   * nothing between enqueue and execute re-checks it. That is not speculation —
   * it is exactly why `loadConnection` resolves instagram through
   * `assert_account_for_scheduled_post`, a function that takes no workspace
   * argument at all and re-derives everything from the post id.
   *
   * The same reasoning applies with the same force here, and the failure
   * direction is the worse one. A gate that loaded red lines by the payload's
   * workspace would judge one brand's post against another brand's rules — and
   * because a wrong workspace usually means FEWER matching rules, the result is
   * a post that should have been refused sailing through. A silent pass is
   * harder to notice than a wrong refusal.
   *
   * `status = 'active'` because `brand_memory` is append-only and versioned:
   * superseded rows are the history, and a draft was never agreed to.
   */
  async function loadGateContext(postId: string): Promise<GateContext | null> {
    const r = await pool.query<{
      workspace_id: string
      version: number | null
      payload: unknown
    }>(
      `select p.workspace_id,
              bm.version,
              bm.payload
         from posts p
         left join lateral (
              select b.version, b.payload
                from brand_memory b
               where b.workspace_id = p.workspace_id
                 and b.status = 'active'
               order by b.version desc
               limit 1
            ) bm on true
        where p.id = $1`,
      [postId],
    )
    const row = r.rows[0]
    if (!row) return null

    // A LEFT JOIN, so a workspace with no brain still returns a context. That is
    // the common case on a new workspace and it is NOT an error: the mandated
    // floor pack still applies and still gets checked. Refusing to gate a post
    // because its owner has not written a red line would be the gate opting out
    // of the one tier that never depended on them.
    return { workspaceId: row.workspace_id, brandVersion: row.version, payload: row.payload }
  }

  /**
   * One row per gate decision, INCLUDING passes.
   *
   * A trail that records only refusals cannot prove which rule set was in force
   * when something did go out — which is the exact property doc 18 §8 names
   * ("you can later prove what rule set was in force and who approved against
   * it"). Refusals-only answers "why was this stopped"; nobody has ever needed
   * to ask that under audit.
   *
   * `audit_logs` is member-read, server-only insert, with a `block_mutations`
   * trigger on update and delete — append-only by construction, and it needed no
   * migration to carry this.
   */
  async function writeGateAudit(entry: GateAuditEntry): Promise<void> {
    await pool.query(
      `insert into audit_logs (workspace_id, actor, action, target, meta, trace_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        entry.workspaceId,
        entry.actor,
        entry.action,
        JSON.stringify(entry.target),
        JSON.stringify(entry.meta),
        entry.traceId,
      ],
    )
  }

  return { loadGateContext, writeGateAudit }
}

export interface GateAuditEntry {
  workspaceId: string
  /**
   * WHO CAUSED THE PUBLISH, and read the distinction carefully: this is the job
   * run identity (`web:<uuid>` for a person pressing Publish, `cron:<postId>`
   * for the sweep), not a named approver.
   *
   * Doc 18 §8 asks for "who approved" and for escalation "to a named human".
   * Neither is answerable from stored data today: `approvePost` writes exactly
   * `{ status: 'approved' }` and records no approver, and `posts` has no column
   * for one. `meta.approver` is therefore null on every row this writes — an
   * honest gap, not a placeholder to be filled by whoever happens to be logged
   * in. The ask is filed in `apps/web/REQUESTS.md`.
   */
  actor: string
  action: 'publish_gate.pass' | 'publish_gate.block' | 'publish_gate.hold'
  target: { postId: string; variantId: string; channel: string }
  meta: unknown
  traceId: string
}
