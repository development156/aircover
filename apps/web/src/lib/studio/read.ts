import 'server-only'

import { StudioGenerationSchema, type StudioGeneration } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * READING WHAT THIS WORKSPACE HAS ASKED FOR.
 *
 * ── FOUR ANSWERS, KEPT APART ────────────────────────────────────────────────
 * `no-workspace`, `unreadable`, an EMPTY list and a full one are four different
 * situations and only one of them has "make your first picture" as a remedy. A
 * reader that collapses them tells somebody whose read just failed that they
 * have never made anything, which is both false and unfixable by following the
 * instruction it offers.
 *
 * ── PARSED PER ROW ──────────────────────────────────────────────────────────
 * One malformed row costs its own card, not the screen. The screen it would
 * otherwise take down is the one showing a person what they have already paid
 * for, which is the worst screen in the product to lose.
 */
export type GenerationsRead =
  | { status: 'ok'; generations: StudioGeneration[]; unreadable: number }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/** The most recent requests, newest first. */
export async function readGenerations(limit = 24): Promise<GenerationsRead> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status !== 'ok') return { status: 'no-workspace' }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('studio_generations')
    .select('*')
    // Scoped here as well as in RLS: the policy admits every workspace this
    // person belongs to, so an unscoped read would show another one's pictures.
    .eq('workspace_id', workspace.workspace.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { status: 'unreadable' }

  const generations: StudioGeneration[] = []
  let unreadable = 0
  for (const row of data ?? []) {
    const parsed = StudioGenerationSchema.safeParse(row)
    if (parsed.success) generations.push(parsed.data)
    else unreadable += 1
  }
  return { status: 'ok', generations, unreadable }
}
