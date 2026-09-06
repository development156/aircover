import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { ChannelSchema, type Channel, type WorkspaceRole } from '@sahoda/shared'

import { listPostMedia } from '@/lib/posts/read'
import { signMediaPreviews } from '@/lib/posts/media-url'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { getWorkspaceRole } from '@/lib/workspace-role'

import {
  approvalGroups,
  parseApprovalRow,
  parseCommentRow,
  type ApprovalRow,
  type CommentRow,
} from './context'

/**
 * THE READS BEHIND A REVIEW DECISION.
 *
 * `post_approvals` is the record of the gate (who submitted, approved or
 * returned a post, and why); `post_comments` is the thread beside it. Both are
 * member-readable and written only through RPCs or the comment actions.
 *
 * ── NULL IS "COULD NOT READ", AN EMPTY MAP IS "NOTHING THERE" ────────────────
 * The same three-answer rule every read in this app follows. A queue row that
 * cannot show its history says so; it does not pretend the post has none.
 *
 * ── SCOPED TO THE ACTIVE WORKSPACE ───────────────────────────────────────────
 * RLS admits every workspace the caller belongs to. The filter here is
 * correctness rather than authorisation, exactly as `lib/posts/read.ts` says.
 */

async function workspaceId(): Promise<string | null> {
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
}

/** Every approval row for these posts, grouped by post, newest first. */
export async function readApprovals(
  postIds: readonly string[],
): Promise<Map<string, ApprovalRow[]> | null> {
  if (postIds.length === 0) return new Map()
  try {
    const ws = await workspaceId()
    if (ws === null) return null
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_approvals')
      .select('id, post_id, actor, decision, reason, created_at')
      .eq('workspace_id', ws)
      .in('post_id', [...postIds])
      .order('created_at', { ascending: false })
    if (error || !data) return null
    const rows = (data as unknown[]).flatMap((row) => {
      const parsed = parseApprovalRow(row)
      return parsed === null ? [] : [parsed]
    })
    return approvalGroups(rows)
  } catch {
    return null
  }
}

/**
 * Comments per post, oldest first. `perPost` keeps only the LAST n of each
 * thread, which is what a queue row shows: the three most recent, not the
 * three oldest.
 */
export async function readComments(
  postIds: readonly string[],
  perPost?: number,
): Promise<Map<string, CommentRow[]> | null> {
  if (postIds.length === 0) return new Map()
  try {
    const ws = await workspaceId()
    if (ws === null) return null
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_comments')
      .select('id, post_id, author, body, created_at, deleted_at')
      .eq('workspace_id', ws)
      .in('post_id', [...postIds])
      .order('created_at', { ascending: true })
    if (error || !data) return null
    const groups = new Map<string, CommentRow[]>()
    for (const raw of data as unknown[]) {
      const row = parseCommentRow(raw)
      if (row === null) continue
      groups.set(row.post_id, [...(groups.get(row.post_id) ?? []), row])
    }
    if (perPost !== undefined) {
      for (const [id, list] of groups) groups.set(id, list.slice(-perPost))
    }
    return groups
  } catch {
    return null
  }
}

export interface Reviewer {
  /** The caller's Clerk subject, or null outside a session. */
  userId: string | null
  /** Their role in the active workspace, or null when it cannot be established. */
  role: WorkspaceRole | null
}

/**
 * Who is looking, and what they may decide. Read ONCE per page, so a row's
 * "You wrote this" and the panel's read-only note come from the same answer.
 */
export async function readReviewer(): Promise<Reviewer> {
  try {
    const { userId } = await auth()
    if (!userId) return { userId: null, role: null }
    const ws = await workspaceId()
    if (ws === null) return { userId, role: null }
    return { userId, role: await getWorkspaceRole(ws) }
  } catch {
    return { userId: null, role: null }
  }
}

/**
 * The first attachment of each post as a signed preview URL, the way /posts
 * signs its own. A post with no media is simply absent from the map; an
 * unreadable media list is null.
 */
export async function readQueueThumbnails(
  postIds: readonly string[],
): Promise<Map<string, string | null> | null> {
  if (postIds.length === 0) return new Map()
  const media = await listPostMedia([...postIds])
  if (media === null) return null
  const firsts = [...media.entries()].flatMap(([postId, rows]) => {
    const first = rows[0]
    return first === undefined ? [] : [{ postId, id: first.id, storage_path: first.storage_path }]
  })
  if (firsts.length === 0) return new Map()
  const signed = await signMediaPreviews(firsts)
  const byId = new Map(signed.map((row) => [row.id, row.url]))
  return new Map(firsts.map((row) => [row.postId, byId.get(row.id) ?? null]))
}

export interface VariantBody {
  channel: Channel
  body: string
}

/** Each post's channel versions, body only, for the read-only preview. */
export async function readVariantBodies(
  postIds: readonly string[],
): Promise<Map<string, VariantBody[]> | null> {
  if (postIds.length === 0) return new Map()
  try {
    const ws = await workspaceId()
    if (ws === null) return null
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_variants')
      .select('post_id, channel, body')
      .eq('workspace_id', ws)
      .in('post_id', [...postIds])
      .order('created_at', { ascending: true })
    if (error || !data) return null
    const groups = new Map<string, VariantBody[]>()
    for (const raw of data as Array<{ post_id?: unknown; channel?: unknown; body?: unknown }>) {
      const channel = ChannelSchema.safeParse(raw.channel)
      if (!channel.success || typeof raw.post_id !== 'string' || typeof raw.body !== 'string') {
        continue
      }
      groups.set(raw.post_id, [
        ...(groups.get(raw.post_id) ?? []),
        { channel: channel.data, body: raw.body },
      ])
    }
    return groups
  } catch {
    return null
  }
}
