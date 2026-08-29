import 'server-only'

import { StudioDesignSchema, type StudioDesign } from '@sahoda/shared'

import { signMediaPreviews } from '@/lib/posts/media-url'
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

/**
 * THE PICTURES A DESIGN CAN USE.
 *
 * The library's own live images, newest first, with a signed preview URL each.
 * Signed URLs are for the PICKER, which is ordinary HTML; the renderer never
 * sees one. A design stores an id and the bytes are resolved server-side at
 * render time (`lib/studio/images.ts` argues why).
 *
 * ── FOUR ANSWERS, NOT TWO ───────────────────────────────────────────────────
 * "no workspace", "we could not read your library", "your library has no
 * pictures" and "here they are" are four different situations, and the middle
 * two are the pair that gets conflated. A failed read shown as an empty library
 * tells a person to go and upload photos they already have.
 */
export type StudioPhoto = { id: string; title: string | null; url: string | null }

export type PhotoListRead =
  { status: 'ok'; photos: StudioPhoto[] } | { status: 'no-workspace' } | { status: 'unreadable' }

/** How many pictures the picker offers. The library screen is where a full one is browsed. */
const PHOTO_LIMIT = 60

export async function readStudioPhotos(): Promise<PhotoListRead> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'none') return { status: 'no-workspace' }
  if (workspace.status !== 'ok') return { status: 'unreadable' }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('id, title, storage_path')
      .eq('workspace_id', workspace.workspace.id)
      .eq('kind', 'image')
      // Trashed files are excluded IN SQL rather than after the fact, so the
      // limit above counts pictures a person can actually choose.
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PHOTO_LIMIT)

    if (error || !data) return { status: 'unreadable' }

    const rows = data.flatMap((row) =>
      typeof row.id === 'string' && typeof row.storage_path === 'string'
        ? [
            {
              id: row.id,
              storage_path: row.storage_path,
              title: typeof row.title === 'string' ? row.title : null,
            },
          ]
        : [],
    )

    const signed = await signMediaPreviews(rows)
    const urls = new Map(signed.map((preview) => [preview.id, preview.url]))

    // A picture whose URL could not be signed is LISTED, with no thumbnail. The
    // file is really there and choosing it works: the renderer reads bytes, not
    // this URL. Dropping it would hide a usable photo over a preview.
    return {
      status: 'ok',
      photos: rows.map((row) => ({
        id: row.id,
        title: row.title,
        url: urls.get(row.id) ?? null,
      })),
    }
  } catch {
    return { status: 'unreadable' }
  }
}
