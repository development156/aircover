'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import {
  ChannelSchema,
  PostSchema,
  PostUpdateSchema,
  PostVariantUpdateSchema,
  charCountFor,
  CONSTRAINTS,
  NOT_RESCHEDULABLE_STATUSES,
} from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { mapPostError } from '@/lib/posts/post-error'
import { hasLink } from '@/lib/posts/detect-link'
import { isPostFormat, refuseFormat } from '@sahoda/publishing'
import { casSaveVariant } from '@/lib/posts/cas-save'
import { parseExtras } from '@/lib/posts/variant-extras'
import type { DeleteState, FormatState, SaveState } from '@/lib/posts/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * Post CRUD. `posts` / `post_variants` carry full member CRUD policies, so these
 * are plain PostgREST writes under the caller's JWT — RLS is the boundary.
 *
 * `workspace_id` is passed explicitly on every insert (the composite FKs require
 * it and there is no column default) but is always taken from the SERVER-derived
 * active workspace, never from the request. We do not add `.eq('workspace_id')`
 * as a security measure — that would be redundant to RLS and imply the cookie is
 * an authorization grant, which it is not.
 */

export async function createPost(title: string): Promise<SaveState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to create a post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const trimmed = title.trim()

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .insert({
        workspace_id: workspace.id,
        title: trimmed || null,
        body: '',
        status: 'draft',
        channels: [],
        origin: 'manual',
        created_by: userId,
      })
      .select('*')
      .single()

    if (error || !data) return { ok: false, message: mapPostError(error) }

    const parsed = PostSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, message: 'Created, but the response was unreadable. Reload to confirm.' }
    }

    revalidatePath('/posts')
    revalidatePath('/planner')
    return { ok: true, postId: parsed.data.id, updatedAt: parsed.data.updated_at }
  } catch (error) {
    reportServerError(error, { action: 'createPost', workspaceId })
    return { ok: false, message: 'Could not create this post. Try again.' }
  }
}

/**
 * Save the canonical post. Returns the server's `updated_at` so the caller can
 * detect a concurrent edit (`detectConflict`) — `posts` has no version column,
 * so last-write-wins plus this timestamp is the whole concurrency story.
 */
export async function savePost(postId: string, patch: unknown): Promise<SaveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save this post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    // NARROWER than PostUpdateSchema on purpose. The shared schema also admits
    // `status`, which would let a hand-rolled call to this action set
    // `status: 'published'` — the exact fabricated success state that
    // `simulatePublish` refuses to write, reachable by going around the editor.
    // Publishing is apps/jobs' to record, so the editor never sends a status and
    // this action will not accept one. `.strict()` rejects rather than silently
    // stripping, so a caller that tries learns it did not work.
    //
    // Derived from the frozen schema, never restated — a new editable column
    // shows up here as a type error rather than being quietly unsupported.
    const parsedPatch = PostUpdateSchema.pick({
      title: true,
      body: true,
      channels: true,
      scheduled_at: true,
    })
      .strict()
      .safeParse(patch)
    if (!parsedPatch.success) {
      return { ok: false, message: 'Those changes are not valid. Reload and try again.' }
    }

    const supabase = createServerSupabase()

    // ── A SCHEDULE THIS POST CANNOT HONOUR IS NOT A SAVE ──────────────────────
    // `scheduled_at` is accepted here but `status` is not (see above), so writing a
    // date onto a TERMINAL post used to succeed and change nothing that matters: the
    // row took the new time, this action returned ok, the editor said saved — and
    // `isDispatchable` still refused the post forever, because nothing moved it out of
    // `expired`. Observed 2026-08-10 on two posts whose only symptom was a cron sweep
    // that never found them.
    //
    // The list is NOT restated here any more. It was, and that hand copy was the
    // drift hazard REQUESTS.md logged: two SQL guards (`reschedule_post` →
    // POST_NOT_RESCHEDULABLE, `release_post_for_publish` → POST_NOT_RELEASABLE) and
    // this one, three copies of a four-entry list. It now comes from
    // `@sahoda/shared`, and `packages/db/tests/schedule_guard_parity.test.ts` fails
    // if either SQL guard stops matching it. Calling the RPC from here is still not
    // an option — it also sets `status`, which this action is forbidden to touch.
    if ('scheduled_at' in parsedPatch.data) {
      const { data: current } = await supabase
        .from('posts')
        .select('status')
        .eq('id', postId)
        .maybeSingle()

      // Widened to `string` deliberately: this value is whatever the row holds, and a
      // status we do not recognise is not one we can claim is terminal. Unknown =
      // allowed through, same as before, and the DB guard is still underneath.
      const status = (current as { status?: unknown } | null)?.status
      if (
        typeof status === 'string' &&
        (NOT_RESCHEDULABLE_STATUSES as readonly string[]).includes(status)
      ) {
        // Same words as the schedule action's POST_NOT_RESCHEDULABLE, because it is the
        // same refusal — a person who meets it through two doors should not have to work
        // out that it is one rule.
        return {
          ok: false,
          message: 'This post has already been published or closed. Its time can’t be changed.',
        }
      }
    }

    const { data, error } = await supabase
      .from('posts')
      .update(parsedPatch.data)
      .eq('id', postId)
      .select('*')
      .maybeSingle()

    if (error || !data) return { ok: false, message: mapPostError(error) }

    const parsed = PostSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, message: 'Saved, but the response was unreadable. Reload to confirm.' }
    }

    revalidatePath('/posts')
    revalidatePath('/planner')
    return { ok: true, postId: parsed.data.id, updatedAt: parsed.data.updated_at }
  } catch (error) {
    reportServerError(error, { action: 'savePost', workspaceId })
    return { ok: false, message: 'Could not save this post. Try again.' }
  }
}

/**
 * Upsert one channel variant on the `(post_id, channel)` unique key. Char count
 * is recomputed server-side from the frozen engine — never trusted from the
 * client, and never `body.length` (the engine counts code points, and weights an
 * X link at a fixed 23).
 */
export async function saveVariant(
  postId: string,
  channel: string,
  body: string,
  extras: unknown,
  /**
   * What the caller believes is stored, for the compare-and-set.
   *
   *   `undefined` — this database has no version column (or the caller could not
   *                 tell). Save exactly the way this action always has.
   *   `null`      — the column is there and this channel has no copy yet. Create.
   *   a number    — the column is there. Change it only if it is still at this.
   *
   * `null` and `undefined` mean opposite things here, so neither is defaulted.
   */
  expectedVersion?: number | null,
): Promise<SaveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save this variant.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const parsedChannel = ChannelSchema.safeParse(channel)
    if (!parsedChannel.success) {
      return { ok: false, message: 'That channel is not supported.' }
    }

    const spec = CONSTRAINTS[parsedChannel.data]
    const cleanExtras = parseExtras(extras)
    const charCount = charCountFor(spec, {
      body,
      hashtags: cleanExtras.hashtags,
      hasLink: hasLink(body),
      // The stored count is read where the live meter is not — the posts list,
      // the planner. Without the writer's brackets choice it counted a caption
      // nobody was going to publish, two characters per keyword adrift from the
      // meter on the screen that wrote it.
      keywordBrackets: cleanExtras.keywordBrackets,
    })

    const patch = PostVariantUpdateSchema.parse({
      body,
      extras: cleanExtras,
      char_count: charCount,
      // Editing a channel variant deliberately unlinks it from the canonical
      // body — otherwise the next canonical edit would silently overwrite it.
      is_linked: false,
    })

    const supabase = createServerSupabase()

    // ── THE COMPARE-AND-SET, WHEN THERE IS ONE ────────────────────────────────
    // Only when the caller supplied a belief about what is stored. Without one
    // this stays on the upsert below, byte for byte as it has always been — which
    // is what lets this code ship BEFORE the migration rather than after it.
    //
    // ── WHY A FAILED CALL HERE IS NOT QUIETLY DOWNGRADED ─────────────────────
    // The tempting extra safety net is: if the compare-and-set function turns out
    // not to exist, fall back to the upsert. It was written and then removed.
    //
    // Deciding "the function is missing" means matching an error code, and the two
    // layers involved report a missing function differently — Postgres one way,
    // the API in front of it another. Nothing in this run could observe the second
    // one, so that branch would have been guesswork, and guessing WRONG means
    // every genuine failure silently becomes a last-write-wins save: the exact
    // defect this whole change exists to remove, reintroduced by its own safety
    // net and invisible because the save appears to succeed.
    //
    // The state it guarded against also cannot really arise: the column and the
    // function are created by ONE migration file, and a migration file applies as
    // a unit. A caller only reaches this branch because it READ the column, which
    // means that file ran.
    //
    // So a failed call is reported as a failed save. Visible, and losing nothing.
    if (expectedVersion !== undefined) {
      const cas = await casSaveVariant(supabase, {
        postId,
        workspaceId: workspace.id,
        channel: parsedChannel.data,
        body,
        extras: patch.extras,
        charCount: patch.char_count ?? null,
        expectedVersion,
      })
      if (cas.ok) {
        revalidatePath('/posts')
        revalidatePath('/planner')
      }
      return cas
    }

    const { data, error } = await supabase
      .from('post_variants')
      .upsert(
        { workspace_id: workspace.id, post_id: postId, channel: parsedChannel.data, ...patch },
        { onConflict: 'post_id,channel' },
      )
      .select('id, updated_at')
      .single()

    if (error || !data) return { ok: false, message: mapPostError(error) }

    revalidatePath('/posts')
    revalidatePath('/planner')
    const updatedAt = (data as { updated_at?: unknown }).updated_at
    return {
      ok: true,
      postId,
      updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    }
  } catch (error) {
    reportServerError(error, { action: 'saveVariant', workspaceId })
    return { ok: false, message: 'Could not save this variant. Try again.' }
  }
}

/**
 * Record what kind of post one channel's version is.
 *
 * ── WHY THIS IS NOT PART OF `saveVariant` ────────────────────────────────────
 * It would be, if it could. `save_post_variant` — the compare-and-set that makes
 * the body safe against a second writer — has a fixed eight-argument signature
 * with no format among them, and that function is APPLIED to production, so
 * changing it is a new migration rather than an edit. Adding format to the frozen
 * `PostVariantUpdateSchema` is not an option either.
 *
 * So this is a separate, deliberately narrow write, and its concurrency story is
 * different from the body's: last write wins. That trade is acceptable HERE and
 * would not be for the words. A format is one value chosen from a short list, once,
 * and losing it costs a click; a paragraph is not recoverable. The response carries
 * what is actually stored rather than what was asked for, so a writer whose choice
 * lost sees the winner instead of being told their own choice landed.
 *
 * A null format is a legitimate value — it means nobody has said — and clearing it
 * puts the variant back to publishing whatever is attached.
 */
export async function setVariantFormat(
  postId: string,
  channel: string,
  format: string | null,
): Promise<FormatState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to set this format.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const parsedChannel = ChannelSchema.safeParse(channel)
    if (!parsedChannel.success) return { ok: false, message: 'That channel is not supported.' }

    if (format !== null && !isPostFormat(format)) {
      return { ok: false, message: 'That format is not one Sahoda knows.' }
    }

    // REFUSED BEFORE IT IS WRITTEN, not at publish time. `refuseFormat` is the same
    // function the publisher consults, so a format this channel cannot publish
    // cannot be stored in the first place — the alternative is a row that saves
    // cleanly and fails days later, which is the fake-success state this product
    // refuses. Media count is deliberately 0 here: only the channel-capability
    // refusals can be judged now, and the contradictions (a photo post with no
    // photo) are about a moment that has not happened yet.
    if (format !== null) {
      const capability = refuseFormat(CONSTRAINTS[parsedChannel.data], format, 1)
      if (capability && capability.code === 'FORMAT_UNSUPPORTED') {
        return { ok: false, message: capability.message }
      }
      if (format === 'text' && CONSTRAINTS[parsedChannel.data].requiresMedia === true) {
        return { ok: false, message: capability?.message ?? 'That channel needs a photo.' }
      }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_variants')
      .update({ format })
      .eq('post_id', postId)
      .eq('workspace_id', workspaceId)
      .eq('channel', parsedChannel.data)
      .select('format')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }
    // No row is not an error here: the variant has not been written yet, and the
    // format will be applied with the first save. Reported as "nothing stored",
    // which is true, rather than as a failure that did not happen.
    if (!data) return { ok: true, format: null }

    revalidatePath('/posts')
    const stored = (data as { format?: unknown }).format
    return { ok: true, format: isPostFormat(stored) ? stored : null }
  } catch (error) {
    reportServerError(error, { action: 'setVariantFormat', workspaceId })
    return { ok: false, message: 'Could not set the format. Try again.' }
  }
}

export async function deletePost(postId: string): Promise<DeleteState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to delete this post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const supabase = createServerSupabase()
    // post_variants / post_media cascade from posts (on delete cascade).
    // `.select()` is not cosmetic: a delete matching ZERO rows is NOT an error in
    // PostgREST, so without the returned row this reports a successful deletion
    // for a post that is still on screen (already deleted in another tab, or RLS
    // filtered it out after a membership change).
    const { data, error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }

    // Nothing was deleted. Routed through mapPostError's PGRST116 branch so this
    // reads IDENTICALLY to an RLS refusal — distinguishing "gone" from "not
    // yours" would turn this action into an existence oracle for post ids.
    if (!data) return { ok: false, message: mapPostError({ code: 'PGRST116' }) }

    revalidatePath('/posts')
    revalidatePath('/planner')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'deletePost', workspaceId })
    return { ok: false, message: 'Could not delete this post. Try again.' }
  }
}
