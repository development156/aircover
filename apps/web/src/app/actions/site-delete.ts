'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

import { reportServerError } from '@/lib/observability/report'
import { mapPostError } from '@/lib/posts/post-error'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * Delete a website, so a first attempt is not also the last one.
 *
 * ── WHY THIS HAD TO EXIST ────────────────────────────────────────────────────
 * The Sites module shipped write-only: `generateSite` was the ONLY mutation and
 * nothing in the product ever removed a `sites` row on a customer's behalf. That
 * was a missing feature until the entitlements gate was mounted, and then it
 * became a trap. The gate counts every row including drafts, correctly, because
 * `sites.status` never leaves 'draft'. So on Starter, where the allowance is one
 * site, the first generation is also the last: a draft the customer dislikes
 * looks exactly like one they are happy with, the slot never frees, and the only
 * remedy the screen could offer was buying a bigger plan.
 *
 * A remedy that costs money to escape a result you did not want is the shape
 * this codebase refuses everywhere else.
 *
 * ── NOTHING IN THE SCHEMA WAS IN THE WAY ─────────────────────────────────────
 * Members already hold a `t_delete` policy on `sites`, and `site_pages` /
 * `site_sections` cascade — the generator's own mid-way cleanup relies on that
 * cascade already. Leads keep their rows with `site_id` set null, so deleting a
 * site never destroys an enquiry somebody received through it. No migration, no
 * policy change, no billing change: only the action and the control were missing.
 */
export type DeleteSiteState = { ok: true } | { ok: false; message: string }

export async function deleteSite(siteId: string): Promise<DeleteSiteState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to delete this website.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    // `.select()` is not cosmetic, and `deletePost` carries the same note for the
    // same reason: a delete matching ZERO rows is NOT an error in PostgREST, so
    // without the returned row this would report a successful deletion for a
    // site still on screen — already deleted in another tab, or filtered out by
    // RLS after a membership change.
    const { data, error } = await supabase
      .from('sites')
      .delete()
      .eq('id', siteId)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }

    // Nothing was deleted. Routed through the SAME branch an RLS refusal takes,
    // so "gone" and "not yours" read identically. Telling them apart would make
    // this action an existence oracle for site ids belonging to other people.
    if (!data) return { ok: false, message: mapPostError({ code: 'PGRST116' }) }

    // Both: the sites screen shows the preview, and the plan screen counts the
    // rows against the allowance this deletion just freed.
    revalidatePath('/sites')
    revalidatePath('/billing')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'deleteSite', workspaceId })
    return { ok: false, message: 'Sahoda could not delete this website. Try again.' }
  }
}
