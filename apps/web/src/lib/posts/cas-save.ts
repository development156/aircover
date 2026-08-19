import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Channel } from '@sahoda/shared'

import { mapPostError } from '@/lib/posts/post-error'
import type { SaveState } from '@/lib/posts/state'

/**
 * The compare-and-set save, and the refusal it produces.
 *
 * Split out of `app/actions/posts.ts` because that file is a `'use server'`
 * module: it may export only async server actions, so a helper cannot live beside
 * the action it serves without becoming a callable endpoint of its own.
 *
 * The SQL is `public.save_post_variant`, added by migration 20260819000000. It
 * returns the saved row and returns NOTHING when the stored version has moved —
 * which is how a clash is told apart from a failure without a second question.
 */

export interface CasSaveArgs {
  postId: string
  workspaceId: string
  channel: Channel
  body: string
  extras: unknown
  charCount: number | null
  /** `null` = create; a number = change it only if it is still at this. */
  expectedVersion: number | null
}

/**
 * Rows back from a function declared `returns setof`.
 *
 * Normalised rather than assumed. A set-returning function comes back as an array,
 * but a client that ever unwraps a single row would hand this an object, and
 * treating that object as "no rows" would report a successful save as a clash —
 * telling a writer someone overwrote them when nobody did.
 */
function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === 'object') return [data as Record<string, unknown>]
  return []
}

function versionOf(row: Record<string, unknown>): number | undefined {
  const version = row.version
  return typeof version === 'number' && Number.isInteger(version) ? version : undefined
}

export async function casSaveVariant(
  supabase: SupabaseClient,
  args: CasSaveArgs,
): Promise<SaveState> {
  const { data, error } = await supabase.rpc('save_post_variant', {
    p_post_id: args.postId,
    p_workspace_id: args.workspaceId,
    p_channel: args.channel,
    p_body: args.body,
    p_extras: args.extras ?? null,
    p_char_count: args.charCount,
    p_expected_version: args.expectedVersion,
    // Carried so this write does exactly what today's write does. Nothing reads
    // the column yet, which is why dropping it would have gone unnoticed.
    p_is_linked: false,
  })

  if (error) return { ok: false, message: mapPostError(error) }

  const saved = rowsOf(data)[0]
  if (saved !== undefined) {
    const updatedAt = saved.updated_at
    return {
      ok: true,
      postId: args.postId,
      updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
      version: versionOf(saved),
    }
  }

  return conflictFor(supabase, args)
}

/**
 * Nothing came back, so someone else holds the row. Fetch what they wrote.
 *
 * ── THE SECOND READ, AND WHY IT IS HONEST ────────────────────────────────────
 * `state.ts` says the conflict should carry the version from "the SAME read that
 * detected the clash". It cannot: the function returns no row precisely because
 * the clash happened, so there is nothing to carry and a second read is the only
 * way to know what is stored.
 *
 * That read can itself go stale — a third writer between the refusal and this
 * query. It is worth being exact about why that is harmless rather than waving at
 * it. What the notice shows is always a version that was REALLY stored, so it is
 * never a false claim, only possibly an old one. And nothing is decided from it:
 * "Keep mine" re-sends against the version this read returned, and if that has
 * moved again the compare-and-set refuses again and the writer is shown the newer
 * text. Losing the race repeatedly costs a round trip and never a word.
 *
 * Proven rather than argued: `post_variant_cas.pglite.test.ts` runs three writers
 * through exactly this sequence.
 *
 * ── AND WHEN THE SECOND READ ITSELF FAILS ────────────────────────────────────
 * There is still a refusal to report, and it is still not the writer's fault. The
 * message says the save did not land and the text is safe, which is true, and the
 * notice is not shown — because a notice with no text in it would ask someone to
 * choose between their words and a blank box.
 */
async function conflictFor(supabase: SupabaseClient, args: CasSaveArgs): Promise<SaveState> {
  const REFUSED = 'Someone else saved this version while you were writing. Your text is still here.'
  const unread: SaveState = { ok: false, message: REFUSED }

  const { data, error } = await supabase
    .from('post_variants')
    .select('body, version')
    .eq('post_id', args.postId)
    .eq('workspace_id', args.workspaceId)
    .eq('channel', args.channel)
    .maybeSingle()

  if (error || !data) return unread

  const row = data as Record<string, unknown>
  const version = versionOf(row)
  const theirs = row.body
  if (version === undefined || typeof theirs !== 'string') return unread

  return {
    ok: false,
    message: REFUSED,
    conflict: { channel: args.channel, theirs, version },
  }
}
