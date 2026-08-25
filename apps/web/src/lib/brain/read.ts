import 'server-only'

import { marketingObservationSchema, type MarketingObservation } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * WHAT THE MARKETING BRAIN HAS NOTICED — read through the RLS-scoped client.
 *
 * The pass writes over the owner connection because the table is read-only to
 * members. Reading is the other way round, exactly as `lib/loop/read.ts` argues:
 * a page renders what the signed-in person is allowed to see, so it goes through
 * the client carrying their token and lets the database decide. A page reading
 * over the owner connection would render one customer's observations to another
 * the first time a workspace id was threaded wrong.
 *
 * ── THREE OUTCOMES, NOT TWO ──────────────────────────────────────────────────
 * "You have no workspace", "we could not look" and "we looked and there is
 * nothing" are three different claims with three different remedies, and a
 * `data ?? []` collapses the middle one into the last. `no-impossible-remedy`
 * exists because of exactly that collapse: a reload cannot create an
 * observation, and offering one after a failed read is the impossible remedy.
 */
export type BrainRead =
  | { status: 'no-workspace' }
  | { status: 'error' }
  | { status: 'ok'; observations: readonly MarketingObservation[] }

/**
 * The most recent observations for the active workspace, newest first.
 *
 * Rows that do not parse are DROPPED rather than rendered. The schema is the
 * contract the writer validates against, so a row failing it here means the
 * table holds something no current computer would produce — a hand-written row,
 * or a shape left behind by a kind that has since changed. Rendering it would
 * put a sentence in front of a customer that nothing in this codebase can
 * account for, which is the one thing the whole design is arranged to prevent.
 */
export async function readBrainObservations(limit = 6): Promise<BrainRead> {
  const active = await activeWorkspaceRead()
  // `unreadable` is an error, not an absence. Folding it into `no-workspace`
  // would tell somebody who has a workspace to go and create one.
  if (active.status === 'unreadable') return { status: 'error' }
  if (active.status === 'none') return { status: 'no-workspace' }
  const workspaceId = active.workspace.id

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('marketing_observations')
    .select('kind,subject,claim,evidence,computed_on')
    .eq('workspace_id', workspaceId)
    .order('computed_on', { ascending: false })
    .limit(limit)

  if (error) return { status: 'error' }

  const observations: MarketingObservation[] = []
  for (const row of data ?? []) {
    const parsed = marketingObservationSchema.safeParse({
      kind: row.kind,
      subject: row.subject,
      claim: row.claim,
      evidence: row.evidence,
      computedOn: row.computed_on,
    })
    if (parsed.success) observations.push(parsed.data)
  }

  return { status: 'ok', observations }
}
