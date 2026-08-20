import type { Campaign, Channel, ChannelSet, Post } from '@sahoda/shared'

/**
 * WHAT A CAMPAIGN MAY HONESTLY REPORT.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ─────────────────────────────────────
 * The reference design puts six figures on a campaign card: Spent against a
 * budget with a share bar, Reach, Conversions, ROAS, and a Health score. Every
 * one of those is a claim about the reader's own business, and there is no query
 * in this product that produces any of them — no budget column, no ad account,
 * no spend record, no paid-reach endpoint.
 *
 * A figure a query cannot produce is the ONE class of thing this product may
 * never invent, so none of them are computed here and none of them are rendered
 * anywhere. What is left is small and completely real:
 *
 *     postCount  — how many rows are in `campaign_posts` for this campaign
 *     channels   — the union of `posts.channels` across those posts
 *     dates      — `starts_at` / `ends_at`, exactly as the customer typed them
 *     status     — `campaigns.status`, exactly as the customer set it
 *
 * That is the whole vocabulary. If a future reader wants a seventh number here,
 * the question to answer first is which table it is selected from.
 *
 * ── WHY THE CHANNEL UNION IS A SET AND NOT AN ARRAY ──────────────────────────
 * `posts.channels` is a bare `text[]` that every consumer reads as a set, and
 * three shipped duplicate-channel defects came from that gap. Six posts each
 * targeting Instagram must roll up to ONE Instagram, or the card claims a
 * campaign touches six destinations when it touches one.
 *
 * Pure: no React, no I/O, no clock.
 */

/** The channel order every campaign surface renders in. Stable, so two cards agree. */
export const CHANNEL_ORDER: readonly Channel[] = ['instagram', 'linkedin', 'x', 'gbp']

export interface CampaignRollup {
  campaign: Campaign
  /**
   * Rows in `campaign_posts` whose post was also readable.
   *
   * A membership row whose post is missing is not counted. It should not happen —
   * the composite foreign key cascades a deleted post's memberships away — but
   * counting it would report a campaign holding four posts when three can be
   * opened, and the fourth would be a number with nothing behind it.
   */
  postCount: number
  /** Union of the member posts' targeted channels, in `CHANNEL_ORDER`. */
  channels: Channel[]
}

/**
 * Roll memberships up onto their campaigns.
 *
 * Takes the posts as a Map because the caller has already read them in one query
 * — this must never become a per-campaign lookup, and taking the map rather than
 * a fetcher is what makes an N+1 unwritable here.
 */
export function rollupCampaigns(
  campaigns: readonly Campaign[],
  memberships: ReadonlyArray<{ campaign_id: string; post_id: string }>,
  postsById: ReadonlyMap<string, Pick<Post, 'id' | 'channels'>>,
): CampaignRollup[] {
  const byCampaign = new Map<string, { count: number; channels: Set<Channel> }>()
  for (const campaign of campaigns) {
    byCampaign.set(campaign.id, { count: 0, channels: new Set() })
  }

  for (const row of memberships) {
    const bucket = byCampaign.get(row.campaign_id)
    // A membership pointing at a campaign this read did not return. Ignored
    // rather than counted: the alternative is a total that includes a campaign
    // the reader cannot see.
    if (!bucket) continue
    const post = postsById.get(row.post_id)
    if (!post) continue
    bucket.count += 1
    for (const channel of post.channels) bucket.channels.add(channel)
  }

  return campaigns.map((campaign) => {
    const bucket = byCampaign.get(campaign.id)
    return {
      campaign,
      postCount: bucket?.count ?? 0,
      channels: orderChannels(bucket?.channels ?? new Set()),
    }
  })
}

/** The union, in the one order every campaign surface uses. */
export function orderChannels(channels: ReadonlySet<Channel>): Channel[] {
  return CHANNEL_ORDER.filter((channel) => channels.has(channel))
}

/** The union across a set of posts — the detail screen's column headers. */
export function channelUnion(posts: ReadonlyArray<{ channels: ChannelSet }>): Channel[] {
  const seen = new Set<Channel>()
  for (const post of posts) for (const channel of post.channels) seen.add(channel)
  return orderChannels(seen)
}

/**
 * The campaign's period, as a pair of things a person typed — or nothing.
 *
 * ── WHY THIS RETURNS null RATHER THAN A DASH ─────────────────────────────────
 * Both dates are nullable and most campaigns will be created without them. A
 * campaign with no dates does not have an unmeasured period or an unreadable
 * one; it has NO period, which is the third absence state, and the system's
 * answer to that is to omit the slot rather than to render a mark in it. Callers
 * branch on null and render nothing.
 *
 * A half-open period IS renderable and is not a defect: "from 20 Oct" and
 * "until 5 Nov" are both complete sentences about a real decision.
 */
export type CampaignPeriod =
  | { kind: 'both'; startsAt: string; endsAt: string }
  | { kind: 'from'; startsAt: string }
  | { kind: 'until'; endsAt: string }

export function campaignPeriod(campaign: Campaign): CampaignPeriod | null {
  if (campaign.starts_at && campaign.ends_at) {
    return { kind: 'both', startsAt: campaign.starts_at, endsAt: campaign.ends_at }
  }
  if (campaign.starts_at) return { kind: 'from', startsAt: campaign.starts_at }
  if (campaign.ends_at) return { kind: 'until', endsAt: campaign.ends_at }
  return null
}
