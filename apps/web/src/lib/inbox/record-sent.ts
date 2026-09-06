import 'server-only'

import { ChannelSchema } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { directTransaction } from '@/lib/zernio/pool'
import { insertMessage, upsertThread } from '@/lib/zernio/webhook-store'

/**
 * Filing a reply Sahoda just sent into the same store the webhook receiver fills.
 *
 * ── WHAT THIS REPLACES, AND WHY THE OLD REASONING EXPIRED ────────────────────
 * `actions/inbox-send.ts` carried three reasons for recording nothing locally, and
 * every one of them has since stopped being true:
 *
 *  1. "`inbox_threads.channel` cannot express facebook" — widened on 2026-08-26
 *     (`20260826120001_widen_channels_facebook_telegram.sql`). It admits all six
 *     channels `ChannelSchema` names.
 *  2. "`inbox_threads` has no INSERT policy, so there is no row to hang a message
 *     on" — true of the `authenticated` policy, and beside the point: the webhook
 *     receiver writes these tables over a direct Postgres connection precisely
 *     because it is not a member, and so does this.
 *  3. "Nothing reads those tables" — the list and both thread routes read them.
 *
 * So the receipt is no longer the only record. What made those reasons safe to
 * live with was that the thread view re-read Zernio; what makes them a defect now
 * is that the list is store-first, so a reply the customer sent was absent from the
 * screen it was sent from until a webhook happened to bring it back.
 *
 * ── WHY A MEMBER MAY NOT WRITE THIS ROW, AND THIS PATH MAY ───────────────────
 * `inbox_messages`' INSERT policy for `authenticated` admits only rows where
 * `platform_message_id` and `sent_at` are both NULL — a draft. That policy exists so
 * a member cannot fabricate a message claiming to have reached a platform. A
 * CONFIRMED receipt is the opposite case: the platform named the message and handed
 * back its own id, which is the only evidence this codebase accepts. It is written
 * through the direct connection for the same reason the receiver is, and NOTHING
 * here weakens that policy or its CHECK.
 *
 * ── IT NEVER THROWS, AND IT NEVER LIES ABOUT WHAT IT DID ─────────────────────
 * The reply has already gone out. A store write that fails afterwards must not turn
 * a delivered message into an error on screen — the customer would retype and send
 * it twice. Every failure resolves to `'not_recorded'`, which the caller logs and
 * does not surface.
 */

export type RecordOutcome =
  /** The row is in the store. */
  | 'recorded'
  /** Already there: the same receipt id was filed by a webhook first. */
  | 'already_recorded'
  /** Nothing was written, and the reply still went out. */
  | 'not_recorded'

export interface SentReply {
  /** The Zernio account the reply left from — how the channel is resolved. */
  accountId: string
  /** Which surface this belongs to, in `inbox_threads.kind`'s own vocabulary. */
  kind: 'dm' | 'comment' | 'review'
  /** The PLATFORM's id for the thread: a conversation id, a post id, a review id. */
  platformThreadId: string
  body: string
  /** The platform's id for the message it just accepted. The whole point of the row. */
  platformMessageId: string
  sentAt: string
  /** The Clerk subject who wrote it. */
  authorUserId: string
}

/**
 * Which channel this account is, as `inbox_threads.channel` spells it.
 *
 * Read through the ordinary RLS-scoped client, not the direct connection: this is a
 * question about the signed-in member's own workspace, and answering it as the
 * member is what keeps a stray account id from naming another tenant's connection.
 */
async function channelForAccount(workspaceId: string, accountId: string): Promise<string | null> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('connections')
    .select('platform')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('external_account->>id', accountId)
    .maybeSingle()

  if (error || !data) return null
  const parsed = ChannelSchema.safeParse(data.platform)
  // A platform the schema does not name cannot go in the column: its CHECK carries
  // the same six literals. Refusing is right — a row filed under a guessed channel
  // would appear in another channel's tab forever.
  return parsed.success ? parsed.data : null
}

export async function recordSentReply(reply: SentReply): Promise<RecordOutcome> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status !== 'ok') return 'not_recorded'

    const channel = await channelForAccount(workspace.workspace.id, reply.accountId)
    if (channel === null) return 'not_recorded'

    const withTransaction = directTransaction()
    if (withTransaction === null) return 'not_recorded'

    return await withTransaction(async (db) => {
      const threadId = await upsertThread(db, {
        workspaceId: workspace.workspace.id,
        channel,
        kind: reply.kind,
        platformThreadId: reply.platformThreadId,
        // Null on every one of these, so `coalesce(excluded, existing)` keeps what
        // the platform already told us. Our reply says nothing about who the
        // customer is, and writing our own name over theirs would relabel the row.
        authorName: null,
        authorHandle: null,
        rating: null,
        // The two that DO move. A messaging list shows the last thing said and when
        // it was said, and the last thing said is now ours — this is the touch that
        // makes the thread sort to the top of a list ordered by time.
        body: reply.body,
        permalink: null,
        postedAt: reply.sentAt,
      })

      const rows = await insertMessage(db, {
        workspaceId: workspace.workspace.id,
        threadId,
        direction: 'outbound',
        body: reply.body,
        platformMessageId: reply.platformMessageId,
        sentAt: reply.sentAt,
        authorUserId: reply.authorUserId,
      })

      // Zero rows is the unique index refusing a receipt id already filed — a
      // webhook beat us to it, which is a race we win either way and never an error.
      return rows > 0 ? 'recorded' : 'already_recorded'
    })
  } catch (error) {
    console.error(
      '[inbox] a sent reply could not be filed',
      error instanceof Error ? error.message : '?',
    )
    return 'not_recorded'
  }
}
