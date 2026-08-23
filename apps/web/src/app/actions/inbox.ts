'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { InboxDraftReplySchema, InboxStatusSchema } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'

/**
 * Inbox actions: draft a reply, and move a thread through open/snoozed/resolved.
 *
 * ── WHAT THIS CANNOT DO, AND SAYS SO ─────────────────────────────────────────
 * It cannot SEND. There is no verified write API for Google Business Profile
 * replies available to us — Zernio publishes posts, and nothing in doc 13 or their
 * reachable surface documents a reviews endpoint in either direction. FSD M7's
 * honesty rule covers exactly this case: "channels lacking write APIs show 'reply
 * opens app/site' affordance instead of fake sends."
 *
 * So a reply is SAVED as a draft and the UI hands the customer a link to the
 * platform. The database enforces the same thing from underneath: the RLS insert
 * policy admits only rows with `platform_message_id` and `sent_at` both null, and
 * a CHECK keeps those two inseparable. A member cannot write a row that claims to
 * have reached Google, whatever this action does.
 */

export type InboxActionState = { ok: true } | { ok: false; message: string }

export async function draftReply(input: unknown): Promise<InboxActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to reply.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const parsed = InboxDraftReplySchema.safeParse(input)
    if (!parsed.success) return { ok: false, message: 'Write a reply first.' }

    const supabase = createServerSupabase()
    const { error } = await supabase.from('inbox_messages').insert({
      workspace_id: workspace.id,
      thread_id: parsed.data.thread_id,
      direction: 'outbound',
      body: parsed.data.body,
      author_user_id: userId,
      // Both omitted, deliberately and permanently for this path. They are what
      // would make this a sent message, and nothing here sent anything.
    })
    if (error) return { ok: false, message: 'Could not save that reply. Try again.' }

    revalidatePath('/inbox')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'draftReply', workspaceId })
    return { ok: false, message: 'Could not save that reply. Try again.' }
  }
}

/** Move a thread between open, snoozed and resolved. */
export async function setThreadStatus(
  threadId: string,
  status: unknown,
): Promise<InboxActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const parsed = InboxStatusSchema.safeParse(status)
    if (!parsed.success) return { ok: false, message: 'That is not a valid status.' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('inbox_threads')
      .update({
        status: parsed.data,
        // Clearing on any status change: a resolved thread carrying a snooze that
        // has not expired would reopen itself on a timer nobody set.
        snoozed_until: null,
      })
      .eq('id', threadId)
      .eq('workspace_id', workspace.id)
      // Evidence, not decoration. PostgREST returns a null error for an UPDATE
      // that matched no row, and under RLS a thread the caller cannot see IS no
      // row — so without this, moving someone else's thread to `resolved`, or a
      // thread that has since been swept, reports success. Nothing calls this
      // action on this branch yet; the guard ships with it rather than after it.
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, message: 'Could not update that. Try again.' }
    if (!data) return { ok: false, message: 'That conversation is no longer yours to change.' }

    revalidatePath('/inbox')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setThreadStatus', workspaceId })
    return { ok: false, message: 'Could not update that. Try again.' }
  }
}
