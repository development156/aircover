import 'server-only'

import { StudioDesignSchema, type StudioDesign } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * SAVED DESIGNS, READ FROM `studio_designs`.
 *
 * ── PARSED ONE ROW AT A TIME, WHICH IS THE POINT OF THE jsonb COLUMN ────────
 * `doc` has no CHECK constraint: Postgres cannot express a design's shape and
 * would go stale the first time a template gained a slot. `DesignDocumentSchema`
 * is what enforces it, and it only works as intended if a bad row costs ONE
 * CARD rather than the gallery. So every row is parsed on its own and a row
 * that fails is dropped from the list with a count kept, exactly as
 * `lib/assets/read.ts` treats a malformed asset.
 *
 * ── AND SCOPED TO THE ACTIVE WORKSPACE AS WELL AS BY RLS ────────────────────
 * The membership policy admits every workspace the person belongs to, so an
 * unscoped list blends two tenants for anyone in more than one. RLS is the
 * boundary; this filter is which side of it we are asking about.
 */

/** What a gallery read can come back as. `unreadable` is never rendered as "you have none". */
export type DesignListRead =
  | { status: 'ok'; designs: StudioDesign[]; unreadable: number }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

export type DesignRead =
  | { status: 'ok'; design: StudioDesign }
  | { status: 'not-found' }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/** The newest designs a workspace has, templates excluded. */
export async function readDesigns(options?: { templates?: boolean }): Promise<DesignListRead> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'none') return { status: 'no-workspace' }
  if (workspace.status !== 'ok') return { status: 'unreadable' }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('studio_designs')
      .select('*')
      .eq('workspace_id', workspace.workspace.id)
      .eq('is_template', options?.templates === true)
      .order('updated_at', { ascending: false })
      .limit(200)

    if (error || !data) return { status: 'unreadable' }

    const designs: StudioDesign[] = []
    let unreadable = 0
    for (const row of data) {
      const parsed = StudioDesignSchema.safeParse(row)
      if (parsed.success) designs.push(parsed.data)
      else unreadable += 1
    }
    return { status: 'ok', designs, unreadable }
  } catch {
    return { status: 'unreadable' }
  }
}

/** One design by id, scoped to the active workspace. */
export async function readDesign(id: string): Promise<DesignRead> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'none') return { status: 'no-workspace' }
  if (workspace.status !== 'ok') return { status: 'unreadable' }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('studio_designs')
      .select('*')
      .eq('workspace_id', workspace.workspace.id)
      .eq('id', id)
      .maybeSingle()

    if (error) return { status: 'unreadable' }
    if (!data) return { status: 'not-found' }

    const parsed = StudioDesignSchema.safeParse(data)
    // A row that exists and will not parse is NOT "not found": the design is
    // there and we cannot read it, and telling somebody their work is missing
    // when it is merely unreadable is the worse of the two wrong answers.
    return parsed.success ? { status: 'ok', design: parsed.data } : { status: 'unreadable' }
  } catch {
    return { status: 'unreadable' }
  }
}
