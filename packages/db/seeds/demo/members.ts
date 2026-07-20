import { WorkspaceMemberInsertSchema, type WorkspaceRole } from '@sahoda/shared'
import type { SeedCtx } from './context'

/**
 * Who can see the demo workspace.
 *
 * Split out of workspace.ts because membership is the one part of tier 1 that has to
 * reconcile the seed's own rows against rows the app may have written for the same
 * people, and that reconciliation is most of the reasoning here.
 */

const OWNER_ROLE: WorkspaceRole = 'owner'

export interface MemberRow {
  readonly id: string
  readonly userId: string
}

/**
 * Real Clerk subjects to add alongside the synthetic owner, keyed by SUBJECT rather than
 * by position in ctx.memberIds. A positional label re-points at a different person the
 * moment the env var is reordered or shortened, and the `do update set user_id` that
 * follows then collides with whichever row still holds that subject. Keyed by subject,
 * reordering is a no-op and a dropped subject's row is simply left for the prune below.
 */
export function extraMembers(ctx: SeedCtx): readonly MemberRow[] {
  return ctx.memberIds
    .filter((userId) => userId !== ctx.ownerId)
    .map((userId) => ({ id: ctx.id(`member.extra.${userId}`), userId }))
}

/**
 * Membership is what RLS reads, so these rows are the difference between a presenter
 * signing in and seeing the demo, and signing in and seeing an empty account.
 *
 * Conflict target is the NATURAL key, not (id): a listed subject who already joined this
 * workspace through the app holds a random-uuid row that (id) cannot see, so the insert
 * would hit `unique (workspace_id, user_id)` unarbitrated and roll the seed back with an
 * error naming an index rather than the cause. Adopting that row reaches the same end
 * state — this subject is an owner here — and leaves its id alone, which is the one
 * column the seed has no business moving out from under the app.
 */
export async function seedMembers(ctx: SeedCtx): Promise<number> {
  const rows: readonly MemberRow[] = [
    { id: ctx.id('member.owner'), userId: ctx.ownerId },
    ...extraMembers(ctx),
  ]

  for (const row of rows) {
    const member = WorkspaceMemberInsertSchema.parse({
      workspace_id: ctx.workspaceId,
      user_id: row.userId,
      role: OWNER_ROLE,
    })
    await ctx.sql(
      `insert into workspace_members (id, workspace_id, user_id, role)
       values ($1, $2, $3, $4)
       on conflict (workspace_id, user_id) do update set role = excluded.role`,
      [row.id, member.workspace_id, member.user_id, member.role],
    )
  }

  // SEED_DEMO_MEMBER_IDS is authoritative on every run. Nothing else in the system ever
  // de-provisions a membership, so without this a presenter dropped from the list keeps
  // RLS access to the demo forever. Scoped to this one uuidv5-derived workspace, and the
  // owner is excluded by id so the seed can never lock itself out. `= any($3::text[])`
  // rather than `not in (...)` because an empty list is normal and `not in ()` is a
  // syntax error — with `{}` the predicate is false, so every non-owner member goes.
  const stale = await ctx.sql(
    `delete from workspace_members
      where workspace_id = $1 and user_id <> $2 and not (user_id = any ($3::text[]))
      returning user_id`,
    [ctx.workspaceId, ctx.ownerId, rows.map((row) => row.userId)],
  )
  if (stale.length > 0) ctx.log(`de-provisioned ${stale.length} unlisted member(s)`)
  return rows.length
}
