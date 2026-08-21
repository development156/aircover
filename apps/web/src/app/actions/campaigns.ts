'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import {
  CampaignInsertSchema,
  CampaignSchema,
  CampaignStatusSchema,
  CampaignUpdateSchema,
} from '@sahoda/shared'

import { isAlreadyMember, mapCampaignError } from '@/lib/campaigns/campaign-error'
import type {
  CampaignDeleteState,
  CampaignPostsState,
  CampaignSaveState,
} from '@/lib/campaigns/state'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * Campaign writes. `campaigns` and `campaign_posts` carry the four tenant
 * policies, so these are plain PostgREST writes under the caller's JWT and RLS
 * is the boundary.
 *
 * `workspace_id` is passed explicitly on every insert — the composite foreign
 * keys require it and there is no column default — but always from the
 * SERVER-derived active workspace, never from the request. It is not there as a
 * security measure; adding `.eq('workspace_id')` to a write would be redundant
 * to RLS and would imply the cookie is an authorization grant, which it is not.
 *
 * ── NOTHING HERE SPENDS A CREDIT ─────────────────────────────────────────────
 * Naming a campaign and putting a post in it are database rows, not model calls,
 * so no path in this file touches the ledger and none of them can. If a future
 * campaign action calls a model, it goes through `withCredits` like every other
 * one — it does not get a cheaper route because the surface is new.
 */

/** Both dates are optional; an empty string from a date input means "not set". */
function dateOrNull(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The one ordering rule the database also enforces, checked here so the customer
 * gets a sentence beside the field instead of a 23514 they have to decode.
 *
 * Both halves ship: dropping this would not make the write unsafe — the check
 * constraint still refuses — it would make the refusal unreadable.
 */
function datesOutOfOrder(startsAt: string | null, endsAt: string | null): boolean {
  if (!startsAt || !endsAt) return false
  return new Date(endsAt).getTime() < new Date(startsAt).getTime()
}

export async function createCampaign(formData: FormData): Promise<CampaignSaveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to create a campaign.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const startsAt = dateOrNull(formData.get('starts_at'))
    const endsAt = dateOrNull(formData.get('ends_at'))
    if (datesOutOfOrder(startsAt, endsAt)) {
      return { ok: false, field: 'dates', message: 'The end date comes before the start date.' }
    }

    const objectiveRaw = formData.get('objective')
    const parsed = CampaignInsertSchema.safeParse({
      workspace_id: ws.workspace.id,
      name: formData.get('name'),
      objective:
        typeof objectiveRaw === 'string' && objectiveRaw.trim() !== '' ? objectiveRaw : null,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: userId,
    })
    if (!parsed.success) {
      return { ok: false, field: 'name', message: 'Give the campaign a name.' }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('campaigns')
      .insert(parsed.data)
      .select('*')
      .single()
    if (error || !data) return { ok: false, message: mapCampaignError(error) }

    const row = CampaignSchema.safeParse(data)
    if (!row.success) {
      return { ok: false, message: 'Created, but the response was unreadable — reload to confirm.' }
    }

    revalidatePath('/campaigns')
    revalidatePath('/planner')
    return { ok: true, campaignId: row.data.id }
  } catch (error) {
    reportServerError(error, { action: 'createCampaign', workspaceId })
    return { ok: false, message: 'Could not create this campaign — try again.' }
  }
}

/**
 * Rename, re-aim, re-date or re-status a campaign.
 *
 * Last-write-wins: `campaigns` has no version column, and a campaign's fields
 * are not the kind of thing two people edit in the same second. If that turns
 * out to be wrong, the fix is the compare-and-set `post_variants` already has,
 * not an optimistic guess here.
 */
export async function updateCampaign(
  campaignId: string,
  formData: FormData,
): Promise<CampaignSaveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to edit this campaign.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const startsAt = dateOrNull(formData.get('starts_at'))
    const endsAt = dateOrNull(formData.get('ends_at'))
    if (datesOutOfOrder(startsAt, endsAt)) {
      return { ok: false, field: 'dates', message: 'The end date comes before the start date.' }
    }

    const objectiveRaw = formData.get('objective')
    const parsed = CampaignUpdateSchema.safeParse({
      name: formData.get('name'),
      objective:
        typeof objectiveRaw === 'string' && objectiveRaw.trim() !== '' ? objectiveRaw : null,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    if (!parsed.success) return { ok: false, field: 'name', message: 'Give the campaign a name.' }

    const supabase = createServerSupabase()
    // `.select('id')` because a PostgREST update matching zero rows returns NO error.
    // Zero rows is a refusal — an RLS denial or a stale id — not a success, and
    // reporting it as one tells the customer their change happened when it did not.
    // Same shape as disconnectConnection and deletePost.
    const { data, error } = await supabase
      .from('campaigns')
      .update(parsed.data)
      .eq('id', campaignId)
      .select('id')
    if (error) return { ok: false, message: mapCampaignError(error) }
    if (!data || data.length === 0) {
      return { ok: false, message: 'That campaign is no longer here.' }
    }

    revalidatePath('/campaigns')
    revalidatePath(`/campaigns/${campaignId}`)
    revalidatePath('/planner')
    return { ok: true, campaignId }
  } catch (error) {
    reportServerError(error, { action: 'updateCampaign', workspaceId })
    return { ok: false, message: 'Could not save this campaign — try again.' }
  }
}

/**
 * Move a campaign along.
 *
 * ── NOTHING MOVES A CAMPAIGN AUTOMATICALLY, AND THE SCREEN SAYS SO ──────────
 * The migration is explicit: "Nothing moves a campaign between these
 * automatically — a person does, until something is built that can." A start
 * date passing does not make a campaign active, because no job reads these rows.
 * So this action exists, a person calls it, and the surface must never imply the
 * status keeps itself up to date.
 */
export async function setCampaignStatus(
  campaignId: string,
  status: string,
): Promise<CampaignSaveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this campaign.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // Parsed against the shared enum, which is character-identical to the
    // column's check constraint. A value the enum refuses never reaches the wire.
    const parsed = CampaignStatusSchema.safeParse(status)
    if (!parsed.success) return { ok: false, message: 'That is not a campaign status.' }

    const supabase = createServerSupabase()
    // `.select('id')` because a PostgREST update matching zero rows returns NO error.
    // Zero rows is a refusal — an RLS denial or a stale id — not a success, and
    // reporting it as one tells the customer their change happened when it did not.
    // Same shape as disconnectConnection and deletePost.
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: parsed.data })
      .eq('id', campaignId)
      .select('id')
    if (error) return { ok: false, message: mapCampaignError(error) }
    if (!data || data.length === 0) {
      return { ok: false, message: 'That campaign is no longer here.' }
    }

    revalidatePath('/campaigns')
    revalidatePath(`/campaigns/${campaignId}`)
    return { ok: true, campaignId }
  } catch (error) {
    reportServerError(error, { action: 'setCampaignStatus', workspaceId })
    return { ok: false, message: 'Could not change this campaign — try again.' }
  }
}

/**
 * Put posts in a campaign.
 *
 * ── A POST ALREADY IN THE CAMPAIGN IS NOT A FAILURE ─────────────────────────
 * `(campaign_id, post_id)` is unique, so re-adding raises 23505. Two people
 * adding the same post from two tabs is an ordinary thing to happen and the
 * outcome they both wanted is the outcome they get. Reporting it as an error
 * would teach the customer that a correct screen is broken — so it is inserted
 * with `ignoreDuplicates`, and `changed` counts the rows that were actually
 * written rather than the rows that were asked for.
 */
export async function addPostsToCampaign(
  campaignId: string,
  postIds: string[],
): Promise<CampaignPostsState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this campaign.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const unique = [...new Set(postIds.filter((id) => typeof id === 'string' && id !== ''))]
    if (unique.length === 0) return { ok: false, message: 'Pick at least one post.' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('campaign_posts')
      .upsert(
        unique.map((postId) => ({
          workspace_id: ws.workspace.id,
          campaign_id: campaignId,
          post_id: postId,
        })),
        { onConflict: 'campaign_id,post_id', ignoreDuplicates: true },
      )
      .select('id')

    if (error && !isAlreadyMember(error)) return { ok: false, message: mapCampaignError(error) }

    revalidatePath('/campaigns')
    revalidatePath(`/campaigns/${campaignId}`)
    revalidatePath('/planner')
    // A real count of rows the database wrote. Never `unique.length`, which
    // would report posts as added that a duplicate skipped.
    return { ok: true, changed: data?.length ?? 0 }
  } catch (error) {
    reportServerError(error, { action: 'addPostsToCampaign', workspaceId })
    return { ok: false, message: 'Could not add those posts — try again.' }
  }
}

/**
 * Take a post out of a campaign. The POST is untouched — this deletes a
 * membership row, and the copy on the button has to make that unmistakable.
 */
export async function removePostFromCampaign(
  campaignId: string,
  postId: string,
): Promise<CampaignPostsState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this campaign.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // `.select('id')` because a PostgREST delete matching zero rows returns NO error.
    // Zero rows is a refusal — an RLS denial or a stale id — not a success, and
    // reporting it as one tells the customer their removal happened when it did not.
    // Same shape as disconnectConnection and deletePost.
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('campaign_posts')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('post_id', postId)
      .select('post_id')

    if (error) return { ok: false, message: mapCampaignError(error) }
    if (!data || data.length === 0) {
      return { ok: false, message: 'That post is no longer in this campaign.' }
    }

    revalidatePath('/campaigns')
    revalidatePath(`/campaigns/${campaignId}`)
    revalidatePath('/planner')
    return { ok: true, changed: data.length }
  } catch (error) {
    reportServerError(error, { action: 'removePostFromCampaign', workspaceId })
    return { ok: false, message: 'Could not remove that post — try again.' }
  }
}

/**
 * Delete a campaign.
 *
 * The membership rows cascade; the POSTS do not, and nothing in this action
 * touches them. That is the sentence the confirmation has to carry, because
 * "delete campaign" reads to most people like it might take the work with it.
 */
export async function deleteCampaign(campaignId: string): Promise<CampaignDeleteState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to delete this campaign.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // `.select('id')` because a PostgREST delete matching zero rows returns NO error.
    // Zero rows is a refusal — an RLS denial or a stale id — not a success, and
    // reporting it as one tells the customer their deletion happened when it did not.
    // Same shape as disconnectConnection and deletePost.
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .select('id')
    if (error) return { ok: false, message: mapCampaignError(error) }
    if (!data || data.length === 0) {
      return { ok: false, message: 'That campaign is no longer here.' }
    }

    revalidatePath('/campaigns')
    revalidatePath('/planner')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'deleteCampaign', workspaceId })
    return { ok: false, message: 'Could not delete this campaign — try again.' }
  }
}
