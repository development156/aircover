import 'server-only'

import type {
  ScopedAccountId,
  ScopedProfileId,
  ZernioComment,
  ZernioCommentedPost,
  ZernioConversation,
  ZernioCursorPage,
  ZernioMessage,
  ZernioPaged,
  ZernioReads,
  ZernioReview,
} from '@sahoda/publishing'
import { evaluateSendWindow, type ReplyAffordance } from '@sahoda/shared'

import { cache } from 'react'

import { postsCarryingComments } from '@/lib/inbox/commented-posts'
import { inChronologicalOrder, newestInboundAt, threadPlatform } from '@/lib/inbox/messages'
import {
  SURFACE_CONNECTION_PLATFORMS,
  decideSurface,
  type SurfaceDecision,
} from '@/lib/inbox/surface'
import { createServerSupabase } from '@/lib/supabase/server'
import { ScopeError, accountByIdForWorkspace, profileForWorkspace } from '@/lib/zernio/scope'
import { zernioClientReads } from '@/lib/zernio/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

import type { InboxSurfaceKey } from './emptiness'
import type { ReadFailure } from './surface'

/**
 * Server reads for the inbox, against Zernio's `/inbox/*` surface.
 *
 * ── READ ONLY, STRUCTURALLY ──────────────────────────────────────────────────
 * `zernioClientReads()` returns `ZernioReads`, which has no send, reply, hide or delete
 * method on it. A screen that displays a conversation therefore never holds a handle
 * that could post — the capability is absent from the type, not merely unused.
 *
 * ── EVERY READ IS TENANT-SCOPED BY ITS PARAMETER TYPES ───────────────────────
 * `profileId` and `accountId` are OPTIONAL filters on Zernio's side, and omitting
 * `profileId` reads across every profile on the API key. So nothing here takes a plain
 * string: the ids are branded and only `@/lib/zernio/scope` can mint one, from a row
 * already fetched for the active workspace. Omission is a compile error.
 *
 * ── NOTHING HERE REPORTS A ZERO AS A MEASUREMENT ─────────────────────────────
 * Every read resolves to a `SurfaceDecision` that distinguishes "we did not ask",
 * "we could not resolve your account", "we could not reach it" and "we asked and there
 * is nothing". Only the last of those is a statement about the customer.
 */

/** One page. A busy shop can have hundreds of conversations; the list is not the archive. */
const PAGE = 50

/** Memoised per request so several surfaces on one screen share the workspace lookup. */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
})

/**
 * Count this workspace's active connections that feed a surface.
 *
 * RLS is the security boundary; the explicit `workspace_id` filter is a correctness
 * filter, for the same reason `listPosts` carries one — the member policy admits every
 * workspace the user belongs to, so an unscoped count would blend two tenants.
 *
 * ── WHY `external_account->>profileId` IS NOT OPTIONAL HERE ──────────────────
 * Platform alone is the WRONG discriminator. A `gbp` row can come from the direct
 * Google OAuth handler (`packages/publishing/src/oauth/gbp.ts`), whose
 * `ConnectionExternalAccount` is `{ id, name?, handle? }` — no `profileId`. Only a
 * Zernio-backed connection carries one, which is exactly why `scopeAccount` checks it
 * before minting a `ScopedAccountId`.
 *
 * Without this filter, a workspace that connected GBP for PUBLISHING counts as 1
 * queryable review account, so the reviews page claims a resolution failure instead of
 * "connect a Google Business Profile" — the inverse of the truth, because Zernio has
 * still never seen a GBP account. Counting only rows Zernio could actually be asked
 * about is what makes this a measurement rather than a guess, and it stays correct
 * after the migration that widens the platform CHECK.
 */
export async function countAccounts(surface: InboxSurfaceKey): Promise<number> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return 0

    const supabase = createServerSupabase()
    const { count, error } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .in('platform', [...SURFACE_CONNECTION_PLATFORMS[surface]])
      .not('external_account->>profileId', 'is', null)

    if (error) {
      console.error('[inbox] connection count failed', error.code, error.message)
      return 0
    }
    return count ?? 0
  } catch (error) {
    console.error('[inbox] connection count threw', error instanceof Error ? error.message : '?')
    return 0
  }
}

/**
 * Everything a read needs before it can be issued, or the reason it cannot be.
 *
 * The three failures are kept apart all the way to the copy: a missing key is ours to
 * fix, a missing profile means nothing was ever connected, and neither is a reading of
 * the customer's shop.
 */
type ReadContext =
  | { ok: true; workspaceId: string; profile: ScopedProfileId; reads: ZernioReads }
  | { ok: false; failure: ReadFailure }

/**
 * ── WHY THIS NEVER THROWS ────────────────────────────────────────────────────
 * It returns a `ReadFailure` for every way it can fail, including ones it did not
 * anticipate. `zernioClientReads()` reads `env.ZERNIO_API_KEY`, and the env proxy
 * validates the WHOLE schema on first access — so one unrelated missing var (a Clerk
 * key, a Supabase URL) throws from what reads like a null check. Letting that escape
 * 500s the page, and on a `next build` it fails the whole build at prerender.
 *
 * "We have no usable reader" is the honest answer to that, and it is the answer this
 * file's contract already promises. Nothing here degrades into a claim about the
 * customer: every branch returns a failure the copy layer renders as ours, not theirs.
 */
async function readContext(): Promise<ReadContext> {
  let reads: ZernioReads | null
  try {
    // Carried on the context rather than re-derived at each call site, so the reader is
    // constructed once and the null check that proves it exists is the same one every
    // caller already has to pass.
    reads = zernioClientReads()
  } catch (error) {
    console.error('[inbox] reader unavailable', error instanceof Error ? error.message : '?')
    return { ok: false, failure: 'no_reader' }
  }
  if (reads === null) return { ok: false, failure: 'no_reader' }

  try {
    // THREE answers, and only two of them were being told apart. An unreadable
    // WORKSPACE read used to arrive as `no_profile`, whose copy says nothing is
    // connected — a claim about the customer's accounts drawn from a question
    // about ours that never got an answer. `call_failed` is what this is: a read
    // we could not complete.
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { ok: false, failure: 'call_failed' }
    // No workspace resolves to the same sentence as no profile: there is nothing to
    // address a read to. It is not a failed read, because no read was possible.
    if (workspace.status === 'none') return { ok: false, failure: 'no_profile' }
    const workspaceId = workspace.workspace.id

    return { ok: true, workspaceId, reads, profile: await profileForWorkspace(workspaceId) }
  } catch (error) {
    if (error instanceof ScopeError) return { ok: false, failure: 'no_profile' }
    // An unexpected lookup failure is NOT "nothing is connected" — that would be a
    // claim we cannot support. It is a question we could not get an answer to.
    console.error('[inbox] scope lookup failed', error instanceof Error ? error.message : '?')
    return { ok: false, failure: 'call_failed' }
  }
}

export interface InboxView<T> {
  rows: T[]
  decision: SurfaceDecision
  /** Zernio's cursor for the next page. Null when this is the whole list. */
  nextCursor: string | null
}

/**
 * Run one profile-scoped list read and classify whatever came back.
 *
 * The `catch` deliberately narrows to `could_not_ask` rather than rethrowing: an inbox
 * that 500s tells the user nothing, while "the request went out and came back without
 * an answer" is both true and actionable. The upstream error goes to the server log,
 * never to the DOM — it can carry an auth header fragment.
 */
async function listSurface<T>(
  surface: InboxSurfaceKey,
  call: (reads: ZernioReads, profile: ScopedProfileId) => Promise<ZernioPaged<T, ZernioCursorPage>>,
): Promise<InboxView<T>> {
  const connectedAccounts = await countAccounts(surface)
  const context = await readContext()

  if (!context.ok) {
    return {
      rows: [],
      decision: decideSurface({ surface, connectedAccounts, failure: context.failure }),
      nextCursor: null,
    }
  }

  try {
    const page = await call(context.reads, context.profile)
    return {
      rows: page.data,
      // `meta` is threaded through verbatim, including when it is absent — that absence
      // is what `classifyInboxResult` turns into "could not confirm this view is
      // complete" rather than into an empty list.
      decision: decideSurface({
        surface,
        connectedAccounts,
        result: { rows: page.data.length, meta: page.meta },
      }),
      nextCursor: page.pagination.nextCursor,
    }
  } catch (error) {
    console.error(
      `[inbox] ${surface} read failed`,
      error instanceof Error ? error.message : 'unknown',
    )
    return {
      rows: [],
      decision: decideSurface({ surface, connectedAccounts, failure: 'call_failed' }),
      nextCursor: null,
    }
  }
}

export async function readConversations(): Promise<InboxView<ZernioConversation>> {
  // No `platform` filter is passed: `ZernioPlatformFilter` has no `whatsapp` member, so
  // a per-platform tab could not express the conversations surface anyway. Reading all
  // of them and labelling each row is honest; filtering to a subset that silently drops
  // WhatsApp would not be.
  return listSurface('conversations', (reads, profile) =>
    reads.listConversations(profile, { limit: PAGE }),
  )
}

/**
 * The posts carrying comments — which is NOT what `GET /inbox/comments` returns.
 *
 * `[LIVE 2026-08-10]` it returns every post, comment-bearing or not (six posts, two
 * comments, both on one post). Passing that through would put rows with nothing to open
 * on a screen headed "comments", and — because the row count would then never be zero —
 * would render "Showing your comments" to a workspace that has never received one.
 *
 * `postsCarryingComments` is applied BEFORE classification so the state describes what
 * the customer actually has, and `hasMore` is threaded through so a page that filters
 * down to empty with more behind it says "could not confirm" rather than "none yet".
 */
export async function readCommentedPosts(): Promise<InboxView<ZernioCommentedPost>> {
  const connectedAccounts = await countAccounts('comments')
  const context = await readContext()

  if (!context.ok) {
    return {
      rows: [],
      decision: decideSurface({ surface: 'comments', connectedAccounts, failure: context.failure }),
      nextCursor: null,
    }
  }

  try {
    const page = await context.reads.listCommentedPosts(context.profile, { limit: PAGE })
    const view = postsCarryingComments(page.data)
    if (view.withoutComments > 0) {
      console.info(
        `[inbox] comments: ${view.withoutComments} of ${page.data.length} posts carry no comments`,
      )
    }
    return {
      rows: view.posts,
      decision: decideSurface({
        surface: 'comments',
        connectedAccounts,
        result: { rows: view.posts.length, meta: page.meta },
        hasMore: page.pagination.hasMore,
      }),
      nextCursor: page.pagination.nextCursor,
    }
  } catch (error) {
    console.error(
      '[inbox] comments read failed',
      error instanceof Error ? error.message : 'unknown',
    )
    return {
      rows: [],
      decision: decideSurface({ surface: 'comments', connectedAccounts, failure: 'call_failed' }),
      nextCursor: null,
    }
  }
}

export async function readReviews(): Promise<InboxView<ZernioReview>> {
  return listSurface('reviews', (reads, profile) => reads.listReviews(profile, { limit: PAGE }))
}

/**
 * Resolve a URL's `accountId` against this workspace, or say why it cannot be.
 *
 * `not_found` is returned rather than thrown so the caller decides between a 404 and a
 * rendered explanation. An id that matches no row in THIS workspace is indistinguishable
 * from a typo and must never reach Zernio — unscoped, it would read another tenant.
 */
export async function scopedAccount(
  accountId: string,
): Promise<
  | { ok: true; profile: ScopedProfileId; account: ScopedAccountId; reads: ZernioReads }
  | { ok: false; failure: ReadFailure | 'not_found' }
> {
  const context = await readContext()
  if (!context.ok) return { ok: false, failure: context.failure }

  try {
    const account = await accountByIdForWorkspace(context.workspaceId, accountId, context.profile)
    return { ok: true, profile: context.profile, account, reads: context.reads }
  } catch (error) {
    if (error instanceof ScopeError) return { ok: false, failure: 'not_found' }
    throw error
  }
}

export interface ThreadView {
  messages: ZernioMessage[]
  /**
   * What a reply UI may offer, decided BEFORE a compose box renders.
   *
   * `canSendFromSahoda` now varies: true on `open` and `tagged`, false on
   * `template_only`, `closed` and `unknown`. It is a HINT for the UI, not the
   * authority — the send action re-reads the thread and re-derives this against the
   * clock at submit time, because a page left open outlives its own window.
   *
   * `unknown` is a real answer here, not a fallback, and it refuses.
   */
  affordance: ReplyAffordance | null
  decision: SurfaceDecision
  nextCursor: string | null
}

/**
 * One thread, addressed by BOTH halves of its key.
 *
 * `accountId` is a required parameter, not an optional filter: Zernio resolves a
 * conversation id within an account, and passing the id alone reads against whichever
 * account happens to match — across tenants, since the profile filter defaults to the
 * whole API key. `listMessages(account, conversationId)` on the frozen client takes both
 * positionally, so half a key does not typecheck.
 *
 * Returns `null` when the account is not this workspace's, so the route can 404 rather
 * than render an explanation for a thread that may not exist.
 */
export async function readThread(
  accountId: string,
  conversationId: string,
  now: string,
): Promise<ThreadView | null> {
  const connectedAccounts = await countAccounts('thread')
  const scoped = await scopedAccount(accountId)

  if (!scoped.ok) {
    if (scoped.failure === 'not_found') return null
    return {
      messages: [],
      affordance: null,
      decision: decideSurface({ surface: 'thread', connectedAccounts, failure: scoped.failure }),
      nextCursor: null,
    }
  }

  try {
    // ── `sortOrder: 'desc'` IS LOAD-BEARING ────────────────────────────────
    // Zernio's default is `asc` — OLDEST first — so an unsorted page of a long thread
    // holds its oldest fifty messages. The newest inbound message, which the reply
    // window is measured from, would not be in it, and the window would be computed
    // from history. Instagram and Facebook replay up to 500 messages per conversation
    // on connect, so this is the ordinary case rather than an edge one.
    //
    // Display order is restored locally by `inChronologicalOrder` — sorting on the
    // timestamps rather than reversing, because Facebook and Bluesky return
    // newest-first whatever is asked and only reverse within a page.
    const page = await scoped.reads.listMessages(scoped.account, conversationId, {
      limit: PAGE,
      sortOrder: 'desc',
    })
    const messages = inChronologicalOrder(page.messages)
    const platform = threadPlatform(messages)
    return {
      messages,
      // No platform means no modelled window, and inventing one would be the guess the
      // affordance exists to avoid. `evaluateSendWindow` states that in words.
      affordance:
        platform === null
          ? null
          : evaluateSendWindow({
              platform,
              lastInboundAt: newestInboundAt(messages),
              now,
            }),
      // `/messages` carries no per-account meta, so completeness is not in question the
      // way it is for a fan-out list: one account was asked and it answered.
      decision: decideSurface({
        surface: 'thread',
        connectedAccounts,
        result: { rows: messages.length, meta: undefined },
        fanOut: false,
      }),
      nextCursor: page.pagination.nextCursor,
    }
  } catch (error) {
    console.error('[inbox] thread read failed', error instanceof Error ? error.message : 'unknown')
    return {
      messages: [],
      affordance: null,
      decision: decideSurface({ surface: 'thread', connectedAccounts, failure: 'call_failed' }),
      nextCursor: null,
    }
  }
}

/**
 * Comments on one post. Same rule: account-scoped, never the post id alone.
 *
 * `platformPostId` is the PLATFORM's id — Instagram's media id, X's tweet id — which is
 * what `post_variants.platform_post_id` holds. Passing Zernio's own 24-hex `_id` here
 * is a defect this repo has already shipped once on the analytics side.
 */
export async function readPostComments(
  accountId: string,
  platformPostId: string,
): Promise<InboxView<ZernioComment> | null> {
  const connectedAccounts = await countAccounts('comments')
  const scoped = await scopedAccount(accountId)

  if (!scoped.ok) {
    if (scoped.failure === 'not_found') return null
    return {
      rows: [],
      decision: decideSurface({ surface: 'comments', connectedAccounts, failure: scoped.failure }),
      nextCursor: null,
    }
  }

  try {
    const page = await scoped.reads.listPostComments(scoped.account, platformPostId, {
      limit: PAGE,
    })
    return {
      rows: page.comments,
      decision: decideSurface({
        surface: 'comments',
        connectedAccounts,
        result: { rows: page.comments.length, meta: undefined },
        fanOut: false,
      }),
      nextCursor: page.pagination.nextCursor,
    }
  } catch (error) {
    console.error(
      '[inbox] post comments read failed',
      error instanceof Error ? error.message : 'unknown',
    )
    return {
      rows: [],
      decision: decideSurface({ surface: 'comments', connectedAccounts, failure: 'call_failed' }),
      nextCursor: null,
    }
  }
}
