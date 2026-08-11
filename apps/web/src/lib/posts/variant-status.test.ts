import { describe, it, expect } from 'vitest'
import { toChannelSet, type PostVariant } from '@sahoda/shared'

import type { VariantStatusRow } from '@/lib/posts/variant-status'

import { selectStatusRows, variantStatusRow } from '@/lib/posts/variant-status'

/**
 * The seam where a simulated publish must stay recognisable.
 *
 * Until 2026-08-09 this function erased a fixture's `platform_post_id` to null and told
 * nobody why. Downstream, "no id" and "simulated" are the same value, so the metrics
 * classifier fell through to `no-platform-id` and the panel said "Instagram didn't
 * return a post id" — about a platform that had never been contacted. Every published
 * variant in production was a fixture at the time, so that was the only sentence the
 * Performance panel had ever shown for a real customer.
 *
 * The erasure is still right: a fixture id must never reach a metrics endpoint. What
 * was missing is the REASON travelling alongside it. The permalink is the only field
 * that still carries it, which is why `simulated` is asserted on `fixture://` and not
 * on a null id — a null id is exactly the thing that cannot tell the two apart.
 */

const FIXTURE_PERMALINK = 'fixture://instagram/fixture-65dc1a34-0272'
const REAL_PERMALINK = 'https://www.instagram.com/p/DbdSNpHDbtj/'
const IG_MEDIA_ID = '18104441855596739'

const variant = (over: Partial<PostVariant> = {}): PostVariant =>
  ({
    id: 'var-1',
    post_id: 'post-1',
    workspace_id: 'ws-1',
    channel: 'instagram',
    publish_status: 'published',
    platform_post_id: IG_MEDIA_ID,
    permalink: REAL_PERMALINK,
    last_error: null,
    ...over,
  }) as PostVariant

describe('a fixture publish is flagged as simulated, by its permalink', () => {
  it('flags a fixture:// permalink as simulated', () => {
    const row = variantStatusRow(
      variant({ permalink: FIXTURE_PERMALINK, platform_post_id: 'fixture-65dc1a34-0272' }),
    )
    expect(row.simulated).toBe(true)
  })

  it('does not flag a real publish as simulated', () => {
    const row = variantStatusRow(variant())
    expect(row.simulated).toBe(false)
  })

  /**
   * The distinction the old shape could not express: a LIVE publish whose id never
   * arrived looks identical to a fixture if you only look at the id. It is not
   * simulated, and must keep saying "no platform id" rather than "test mode".
   */
  it('does not flag a live publish that simply has no id yet', () => {
    const row = variantStatusRow(variant({ platform_post_id: null }))
    expect(row.simulated).toBe(false)
    expect(row.platformPostId).toBeNull()
  })

  it('still erases the fixture id so it can never reach a metrics endpoint', () => {
    const row = variantStatusRow(
      variant({ permalink: FIXTURE_PERMALINK, platform_post_id: 'fixture-65dc1a34-0272' }),
    )
    expect(row.platformPostId).toBeNull()
  })

  it('still refuses to render a fixture permalink as a destination', () => {
    const row = variantStatusRow(variant({ permalink: FIXTURE_PERMALINK }))
    expect(row.permalink).toBeNull()
  })

  it('is not simulated when nothing has been published at all', () => {
    const row = variantStatusRow(
      variant({ publish_status: 'pending', permalink: null, platform_post_id: null }),
    )
    expect(row.simulated).toBe(false)
  })
})

describe('selectStatusRows — the filter both the render and the poll share', () => {
  const row = (over: Partial<VariantStatusRow> = {}): VariantStatusRow => ({
    channel: 'instagram',
    status: 'pending',
    permalink: null,
    platformPostId: null,
    simulated: false,
    errorMessage: null,
    errorCode: null,
    retryable: true,
    ...over,
  })

  it('drops a row whose channel the writer has since DESELECTED', () => {
    // `listVariants` returns rows for channels no longer on the post — the row
    // survives the deselect, which `posts-publish.ts:73-76` filters for by name.
    // The live path arrives with those rows already built, so it needs the same
    // filter or the first poll silently widens the list: `PublishNow`'s
    // `anyAttempted` would flip on a channel this post no longer targets, and a
    // status chip would appear for a destination that is not part of it.
    const rows = [row({ channel: 'instagram' }), row({ channel: 'x', status: 'published' })]

    const selected = selectStatusRows(toChannelSet(['instagram']), rows)

    expect(selected.map((r) => r.channel)).toEqual(['instagram'])
  })

  it("orders by the POST's channels, not by the order the rows arrived in", () => {
    const rows = [row({ channel: 'gbp' }), row({ channel: 'instagram' })]

    expect(
      selectStatusRows(toChannelSet(['instagram', 'gbp']), rows).map((r) => r.channel),
    ).toEqual(['instagram', 'gbp'])
  })

  it('omits a picked channel with no row at all, rather than inventing a state for it', () => {
    // A channel picked but never written to has nothing to report. An empty row
    // would render as "not sent yet" — which is a claim, and a different one.
    expect(
      selectStatusRows(toChannelSet(['instagram', 'x']), [row({ channel: 'instagram' })]),
    ).toHaveLength(1)
  })
})
