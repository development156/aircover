import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { PublishInfraError, publishPostDeps, runClaimedPublish } from '@sahoda/jobs/publish'
import { ChannelSchema, type Channel } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { getPost, listVariants } from '@/lib/posts/read'
import { createServerSupabase } from '@/lib/supabase/server'
import { canPublish, getWorkspaceRole } from '@/lib/workspace-role'
import { readActiveWorkspace } from '@/lib/workspaces'

/**
 * POST /api/posts/{postId}/publish — send one channel's variant now, for real.
 *
 * ── WHY PUBLISHING LIVES IN A ROUTE AND NOT A SERVER ACTION ───────────────────
 * `post_publish_logs` is append-only and needs service-role to insert, and
 * `PostVariantUpdateSchema` deliberately excludes `publish_status`, `platform_post_id`
 * and `permalink` — those columns belong to the publisher. A server action holds the
 * RLS-scoped anon client and can write none of them. This route reaches the publisher
 * itself (`@sahoda/jobs/publish`), which owns the service-role pool, exactly as the
 * cron sweeps route already does.
 *
 * ── HOW THIS AND THE SCHEDULED SWEEP AVOID PUBLISHING THE SAME POST TWICE ─────
 * They race for the same claim, and exactly one of them wins. `runClaimedPublish`
 * takes an atomic claim on the variant before it does anything; the loser gets
 * `claimed: false` and reports 409 without attempting a thing. That covers a
 * double-click, and it covers the far more dangerous case of someone pressing
 * Publish at the same minute the cron tick reaches the post.
 *
 * Zernio's request id is the second line, not the first: same post, same scheduled
 * minute, same key, so a repeat inside their five-minute window comes back as
 * `existingPost` rather than a new one. Two independent mechanisms, one database
 * and one platform, and neither is asked to carry the guarantee alone.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/** Never prerendered: this mutates a real account. */
export const dynamic = 'force-dynamic'

/**
 * The wall this request must finish inside, and the arithmetic behind it.
 *
 * The Instagram adapter polls 12 × 3000ms = 36s for a `platformPostUrl` (the post
 * observed live at ~14s). Before that it uploads each attachment: presign + PUT +
 * HEAD. Add `runPublishPost`'s database round-trips and a cold start and the worst
 * realistic case sits near 50s — too close to 60 to be safe.
 *
 * 120 leaves the adapter's own give-up INSIDE this wall, which matters: when the
 * adapter times out it throws STILL_PROCESSING as TRANSIENT, `runPublishPost`
 * writes its log row and leaves the variant mid-flight rather than marking it
 * failed, and the person can press again — Zernio's request id collapses the
 * retry onto the same post, and the second attempt polls for the URL the first
 * one did not wait for. Being killed by the platform skips all of that and leaves
 * no record at all.
 */
export const maxDuration = 120

function fail(message: string, status: number): Response {
  return Response.json({ ok: false, message }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
): Promise<Response> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return fail('Sign in to publish.', 401)

    const { postId } = await context.params

    let channel: Channel
    try {
      const body: unknown = await request.json()
      const parsed = ChannelSchema.safeParse((body as { channel?: unknown })?.channel)
      if (!parsed.success) return fail('Pick a channel to publish to.', 400)
      channel = parsed.data
    } catch {
      return fail('Pick a channel to publish to.', 400)
    }

    /**
     * `readActiveWorkspace`, not `getActiveWorkspace`: the lossy view answers
     * `null` for BOTH "this account has no workspace" and "the read did not come
     * back", and those need opposite advice. Telling someone watching a
     * scheduled post fail to go out to "create a workspace first" — with a 400,
     * so every 5xx alert filter misses it — is the outage wearing a client
     * error. The two OAuth routes and the door route already read it this way.
     */
    const workspaceRead = await readActiveWorkspace()
    if (workspaceRead.status === 'unreadable') {
      return fail('Couldn’t check your workspace just now. Try again.', 503)
    }
    if (workspaceRead.status === 'none') return fail('Create a workspace first.', 400)
    const workspace = workspaceRead.workspace
    workspaceId = workspace.id

    // Membership alone is not enough. An approver approves and a viewer reads; neither
    // puts content on a public account.
    if (!canPublish(await getWorkspaceRole(workspace.id))) {
      return fail('Only an owner or editor can publish.', 403)
    }

    // RLS-scoped: a post outside the caller's workspaces simply is not found, so this
    // both authorizes the request and confirms the post exists.
    const post = await getPost(postId)
    if (!post) return fail("You don't have access to this post.", 404)
    if (!post.channels.includes(channel)) {
      return fail(`This post is not set up for ${channel}.`, 400)
    }

    const variants = await listVariants(postId)
    const variant = variants.find((row) => row.channel === channel)
    if (!variant) return fail(`Write the ${channel} version first.`, 400)

    // Already live: publishing again would be a second post, not a retry. The permalink
    // is returned so the caller can just show it.
    if (variant.publish_status === 'published' && variant.permalink) {
      return Response.json(
        { ok: true, alreadyPublished: true, permalink: variant.permalink },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      )
    }

    // ── RELEASE THE POST BEFORE PUBLISHING IT ─────────────────────────────────
    // Two things depend on this and neither is optional. The tenant guard
    // (`assert_account_for_scheduled_post`) refuses any post outside the
    // dispatchable statuses, and posts are created 'draft'. And `scheduled_at` is
    // the third term of the idempotency key, so it has to be written ONCE and read
    // back — a timestamp minted here would differ between two rapid presses and
    // Zernio would accept both as separate posts.
    //
    // The RPC is idempotent: `coalesce(scheduled_at, now())` means the first caller
    // sets it and every later one reads what the first one wrote.
    const supabase = createServerSupabase()
    const { data: released, error: releaseError } = await supabase.rpc('release_post_for_publish', {
      p_post_id: postId,
    })
    if (releaseError) {
      const msg = releaseError.message ?? ''
      if (msg.includes('FORBIDDEN_ROLE')) return fail('Only an owner or editor can publish.', 403)
      if (msg.includes('POST_NOT_RELEASABLE')) {
        return fail('This post has already been published or closed.', 409)
      }
      return fail('Couldn’t get this post ready to publish. Try again.', 500)
    }
    const scheduledAt = (released as { scheduled_at?: unknown } | null)?.scheduled_at
    if (typeof scheduledAt !== 'string') {
      return fail('Couldn’t get this post ready to publish. Try again.', 500)
    }

    // Built OUTSIDE the publish call and classified on its own. `publishPostDeps` reads
    // and validates the job env and constructs the pg pool; a throw here is a
    // misconfigured environment, not a failed publish, and it happens before
    // `deps.writeLog` exists to record anything.
    let deps
    try {
      deps = publishPostDeps()
    } catch (e) {
      throw new PublishInfraError('deps', e)
    }

    const result = await runClaimedPublish(
      { workspaceId: workspace.id, postId, variantId: variant.id, channel, scheduledAt },
      { attempt: 1, jobRunId: `web:${randomUUID()}` },
      deps,
    )

    // Someone else is already publishing this variant — the scheduled sweep, or the
    // same person's second click. Nothing was attempted, so nothing is reported as
    // failure; the caller polls the post to see how it ends.
    if (!result.claimed) {
      return Response.json(
        { ok: false, code: 'ALREADY_PUBLISHING', message: 'This post is already going out.' },
        { status: 409, headers: { 'cache-control': 'no-store' } },
      )
    }
    const outcome = result.outcome

    if (outcome.status === 'failed') {
      // The job already wrote a post_publish_logs row and marked the variant failed.
      // The message is the adapter's own, which is written for a person to read.
      return Response.json(
        {
          ok: false,
          code: outcome.code,
          message: outcome.message,
          reconnectRequired: outcome.reconnectRequired,
        },
        { status: 422, headers: { 'cache-control': 'no-store' } },
      )
    }

    return Response.json(
      {
        ok: true,
        // Carried through untouched so the caller branches on the recorded mode rather
        // than sniffing the permalink. A fixture result must never read as a real one.
        mode: outcome.mode,
        permalink: outcome.permalink,
        platformPostId: outcome.platformPostId,
      },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    // A TRANSIENT adapter failure is rethrown by the job so a durable runner can retry.
    // There is no durable runner here, so it lands as a 503: nothing is terminally
    // recorded, and pressing the button again is the correct next move.
    //
    // ── WHY THE 503 CARRIES A CODE ──────────────────────────────────────────────
    // Two very different things reach this line. An adapter gave up mid-flight and the
    // post may yet go live — pressing again is right. OR the infrastructure under the
    // publish was unavailable and NOTHING was attempted, in which case pressing again
    // will fail identically until someone fixes the environment.
    //
    // Both used to return the same anonymous 503 with no log row (the row is a Postgres
    // write, and Postgres is exactly what is missing in the second case). On 2026-08-07
    // four of these were unattributable for that reason. The code and the stage are what
    // make them tellable apart from the outside, without a row.
    const infra = error instanceof PublishInfraError
    await reportServerError(error, {
      action: 'publishNow',
      workspaceId,
      ...(infra ? { infraStage: error.stage } : {}),
    })
    return Response.json(
      {
        ok: false,
        code: infra ? 'INFRA_UNAVAILABLE' : 'PUBLISH_TRANSIENT',
        message: infra
          ? 'Publishing is unavailable right now — nothing was sent. We’ve been alerted.'
          : 'Publishing didn’t go through. Try again in a moment.',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
