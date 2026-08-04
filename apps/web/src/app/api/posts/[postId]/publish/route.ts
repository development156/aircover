import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { publishPostDeps, runPublishPost } from '@sahoda/jobs/publish'
import { ChannelSchema, type Channel } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { getPost, listVariants } from '@/lib/posts/read'
import { canPublish, getWorkspaceRole } from '@/lib/workspace-role'
import { getActiveWorkspace } from '@/lib/workspaces'

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
 * ── WHY IT IS A ROUTE AND NOT THE SCHEDULER ───────────────────────────────────
 * There is no runner behind the scheduled path: `enqueuePublish` in the cron route
 * throws `PublishQueueUnavailableError` in the open, because Vercel cron can duplicate
 * and miss deliveries and no CAS claim on `post_variants` exists to make an inline
 * sweep publish safe. A user pressing a button is a different situation — it is one
 * request, synchronous, and the person is standing there watching it. That is the
 * publish path that can be honest today, so it is the one that exists.
 *
 * Duplicate suppression comes from Zernio rather than from a database claim: the
 * adapter sends `sahoda:{variantId}:{accountId}` as the request id, and a repeat comes
 * back as `existingPost` — the same platform post, not a second one. A double-click
 * therefore converges on one Instagram post. That is weaker than a CAS claim and it is
 * stated plainly here rather than assumed.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/** Never prerendered: this mutates a real account. */
export const dynamic = 'force-dynamic'

/** Instagram's container flow can take ~15s to hand back a URL; the poll waits ~36s. */
export const maxDuration = 60

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

    const workspace = await getActiveWorkspace()
    if (!workspace) return fail('Create a workspace first.', 400)
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

    const outcome = await runPublishPost(
      {
        workspaceId: workspace.id,
        postId,
        variantId: variant.id,
        channel,
        // Publish-now has no schedule. The field is required by the payload contract
        // and is recorded as the moment the person asked for it, which is the truth.
        scheduledAt: new Date().toISOString(),
      },
      { attempt: 1, jobRunId: `web:${randomUUID()}` },
      publishPostDeps(),
    )

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
    await reportServerError(error, { action: 'publishNow', workspaceId })
    return fail('Publishing didn’t go through — try again in a moment.', 503)
  }
}
