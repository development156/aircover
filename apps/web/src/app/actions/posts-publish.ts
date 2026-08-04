'use server'

import { auth } from '@clerk/nextjs/server'
import { createFixtureAdapter } from '@sahoda/publishing'
import { CONSTRAINTS, formatForPlatform, validateVariant, type Channel } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { hasLink } from '@/lib/posts/detect-link'
import { getPost, listMedia, listVariants } from '@/lib/posts/read'
import { parseExtras } from '@/lib/posts/variant-extras'
import type {
  BlockedPublish,
  PublishState,
  SimulatedPublish,
  SkippedPublish,
} from '@/lib/posts/state'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * SIMULATE a publish against the fixture adapter. Nothing is sent anywhere and
 * nothing is recorded — this is a dry run whose only output is the labelled
 * result the caller renders.
 *
 * Why simulation is the whole story for `apps/web`, not a placeholder for a real
 * publish that lands later here:
 *
 *  - It CANNOT publish for real. `PublishRequest.auth` needs a plaintext
 *    `accessToken`, and `decryptToken` is deliberately not exported from
 *    `@sahoda/publishing` — vault material never reaches this process.
 *  - It CANNOT record a publish. `post_publish_logs` is member-read with a
 *    `block_mutations` trigger on update/delete and needs service-role to
 *    insert; `apps/web` has no service-role client by design. And
 *    `PostVariantUpdateSchema` deliberately excludes `publish_status`,
 *    `platform_post_id`, `permalink` and `last_error` — those belong to the
 *    publisher (apps/jobs).
 *
 * So this action deliberately writes NOTHING. Flipping `posts.status` to
 * 'published' off the back of a fixture run would be a fabricated success state.
 * The `mode` field is carried through untouched so the UI branches on it rather
 * than sniffing the permalink; the `fixture://` permalink itself is never
 * rendered as a link.
 *
 * The Constraint Engine gates the fixture, not the other way round. The fixture
 * adapter performs NO validation — it returns success unconditionally — so
 * handing it a 600-character X variant would report "would have been accepted"
 * for a post X rejects at 280, directly contradicting the red MAX_CHARS meter on
 * the same screen. Every variant therefore goes through `validateVariant` FIRST,
 * built from the same three fields the live meter uses (`variant-panel.tsx`:
 * body, hashtags, hasLink) so the preview and the meter cannot drift apart.
 */
export async function simulatePublish(postId: string): Promise<PublishState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to preview publishing.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }
    workspaceId = workspace.id

    const post = await getPost(postId)
    if (!post) return { ok: false, message: "You don't have access to this post." }

    // Instagram REQUIRES media, so the preview has to know what is attached. Without
    // this the meter would report MEDIA_REQUIRED on every instagram post, including
    // the ones that have a photo.
    const [stored, media] = await Promise.all([listVariants(postId), listMedia(postId)])
    if (stored.length === 0) {
      return { ok: false, message: 'Add at least one channel variant to preview publishing.' }
    }

    // `listVariants` returns rows for channels the writer may have since
    // DESELECTED — the row survives the deselect. Previewing those would report
    // on content that is no longer part of the post.
    const selected = new Set<Channel>(post.channels)
    const variants = stored.filter((variant) => selected.has(variant.channel))
    if (variants.length === 0) {
      return { ok: false, message: 'Select at least one channel to preview publishing.' }
    }

    const simulated: SimulatedPublish[] = []
    const blocked: BlockedPublish[] = []
    const skipped: SkippedPublish[] = []

    for (const variant of variants) {
      const channel: Channel = variant.channel
      const spec = CONSTRAINTS[channel]

      // Every channel is publishable now that instagram routes through Zernio. The
      // check stays because the engine still owns the answer and a future channel
      // may arrive before its adapter does.
      if (!spec.publishable) {
        skipped.push({ channel, reason: 'not-publishable' })
        continue
      }

      const extras = parseExtras(variant.extras)
      const draft = {
        body: variant.body,
        hashtags: extras.hashtags,
        hasLink: hasLink(variant.body),
        mediaCount: media.length,
      }

      // The real gate. Must run BEFORE the fixture, which accepts anything.
      const { violations } = validateVariant(spec, draft)
      if (violations.length > 0) {
        blocked.push({ channel, violations })
        continue
      }

      const content = formatForPlatform(spec, draft)

      const result = await createFixtureAdapter(channel).publish({
        workspaceId: workspace.id,
        postId,
        variantId: variant.id,
        content,
        media: [],
        // The fixture adapter never reads auth; these are empty on purpose so no
        // real credential can be mistaken for having been used.
        auth: { connectionId: '', accessToken: '', externalAccountId: '' },
      })

      // Guard the label rather than trusting it: if a future adapter swap ever
      // returned mode:'live' down this path, we must not render it as simulated.
      if (result.mode !== 'fixture') {
        return { ok: false, message: 'Preview is unavailable right now — try again.' }
      }

      simulated.push({
        channel,
        mode: 'fixture',
        platformPostId: result.platformPostId,
        publishedAt: result.publishedAt,
      })
    }

    // Blocked channels are a RESULT, not an error: the writer needs to see which
    // rule each one broke. Only a run with nothing to say at all falls back to a
    // message.
    if (simulated.length === 0 && blocked.length === 0) {
      return {
        ok: false,
        message: 'None of these channels can be published yet — Instagram is preview-only.',
      }
    }

    return { ok: true, simulated, blocked, skipped }
  } catch (error) {
    reportServerError(error, { action: 'simulatePublish', workspaceId })
    return { ok: false, message: 'Could not run the publish preview — try again.' }
  }
}
