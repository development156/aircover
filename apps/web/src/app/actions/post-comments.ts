'use server'

import { auth } from '@clerk/nextjs/server'

import { COMMENT_MAX, parseCommentRow, type CommentRow } from '@/lib/approvals/context'
import { reportServerError } from '@/lib/observability/report'
import { revalidatePostSurfaces } from '@/lib/posts/revalidate-surfaces'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * Comments on a post. A thread beside the approval history, so a reviewer can
 * say "shorten the second line" without sending the whole post back.
 *
 * ── THE AUTHOR IS THE SESSION, NEVER AN ARGUMENT ─────────────────────────────
 * `post_comments` admits an insert only where `author` is the caller's own
 * Clerk subject, and the row can be removed only by that subject, only by
 * setting `deleted_at`. Both are RLS. This file never takes an author from the
 * client and never issues a hard delete, so the application half cannot
 * disagree with the policy.
 *
 * Every read and write is scoped to the ACTIVE workspace as well as RLS-scoped:
 * the same correctness filter `lib/posts/read.ts` explains.
 */

export type CommentWriteState = { ok: true; comment: CommentRow } | { ok: false; message: string }
export type CommentRemoveState = { ok: true } | { ok: false; message: string }
export type CommentListState = { ok: true; comments: CommentRow[] } | { ok: false; message: string }

const SIGNED_OUT = 'Sign in again to comment.'
const EMPTY = 'Write the comment first.'
const TOO_LONG = `Keep a comment under ${COMMENT_MAX} characters.`
const ADD_FAILED = 'Sahoda could not add the comment. Try again.'
const REMOVE_FAILED = 'Sahoda could not remove the comment. Try again.'
const NOT_YOURS = 'Only the person who wrote a comment can remove it.'
const READ_FAILED = 'Sahoda could not read the comments just now.'

export async function addComment(postId: string, body: string): Promise<CommentWriteState> {
  let workspaceId: string | undefined
  try {
    const text = body.trim()
    if (text.length === 0) return { ok: false, message: EMPTY }
    if (text.length > COMMENT_MAX) return { ok: false, message: TOO_LONG }

    const { userId } = await auth()
    if (!userId) return { ok: false, message: SIGNED_OUT }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ workspace_id: workspaceId, post_id: postId, author: userId, body: text })
      .select('*')
      .single()

    if (error || !data) {
      if (error) reportServerError(error, { action: 'addComment', workspaceId })
      return { ok: false, message: ADD_FAILED }
    }
    const comment = parseCommentRow(data)
    if (comment === null) return { ok: false, message: ADD_FAILED }

    revalidatePostSurfaces(postId)
    return { ok: true, comment }
  } catch (error) {
    reportServerError(error, { action: 'addComment', workspaceId })
    return { ok: false, message: ADD_FAILED }
  }
}

/**
 * Soft-remove the caller's own comment. The row stays, body and all, so the
 * thread keeps its shape ("Comment removed" in place) and so nothing is ever
 * hard-deleted from a table that is part of the approval record.
 *
 * `.select('id').maybeSingle()` is what turns "zero rows matched" into a
 * refusal: PostgREST does not error on an update that touched nothing, and RLS
 * hides another person's row, so without the returned id a removal of somebody
 * else's comment would report success over a row that is still there.
 */
export async function removeComment(commentId: string): Promise<CommentRemoveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: SIGNED_OUT }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('workspace_id', workspaceId)
      .eq('author', userId)
      .is('deleted_at', null)
      .select('id, post_id')
      .maybeSingle()

    if (error) {
      reportServerError(error, { action: 'removeComment', workspaceId })
      return { ok: false, message: REMOVE_FAILED }
    }
    if (!data) return { ok: false, message: NOT_YOURS }

    const postId = (data as { post_id?: unknown }).post_id
    revalidatePostSurfaces(typeof postId === 'string' ? postId : undefined)
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'removeComment', workspaceId })
    return { ok: false, message: REMOVE_FAILED }
  }
}

/** Every comment on the post, oldest first, removed ones included. */
export async function listComments(postId: string): Promise<CommentListState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: SIGNED_OUT }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_comments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error || !data) {
      if (error) reportServerError(error, { action: 'listComments', workspaceId })
      return { ok: false, message: READ_FAILED }
    }
    const comments = (data as unknown[]).flatMap((row) => {
      const parsed = parseCommentRow(row)
      return parsed === null ? [] : [parsed]
    })
    return { ok: true, comments }
  } catch (error) {
    reportServerError(error, { action: 'listComments', workspaceId })
    return { ok: false, message: READ_FAILED }
  }
}
