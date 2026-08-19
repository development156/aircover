import { describe, it, expect } from 'vitest'
import { toChannelSet, type Campaign, type Channel, type Post } from '@sahoda/shared'

import { campaignPeriod, channelUnion, orderChannels, rollupCampaigns } from './rollup'

const UUID = (n: number) => `0000000${n}-0000-0000-0000-000000000000`

function campaign(id: string, over: Partial<Campaign> = {}): Campaign {
  return {
    id,
    workspace_id: UUID(9),
    name: `Campaign ${id}`,
    objective: null,
    status: 'draft',
    starts_at: null,
    ends_at: null,
    created_by: 'user_1',
    created_at: '2026-08-19T00:00:00Z',
    updated_at: '2026-08-19T00:00:00Z',
    ...over,
  }
}

function post(id: string, channels: Channel[]): Pick<Post, 'id' | 'channels'> {
  return { id, channels: toChannelSet(channels) }
}

describe('a campaign counts posts it can actually open', () => {
  it('counts memberships whose post was read, and no others', () => {
    const rollups = rollupCampaigns(
      [campaign(UUID(1)), campaign(UUID(2))],
      [
        { campaign_id: UUID(1), post_id: 'p1' },
        { campaign_id: UUID(1), post_id: 'p2' },
        // A membership whose post did not come back. Counting it would report
        // three posts where two can be opened.
        { campaign_id: UUID(1), post_id: 'p-missing' },
        { campaign_id: UUID(2), post_id: 'p1' },
      ],
      new Map([
        ['p1', post('p1', ['instagram'])],
        ['p2', post('p2', ['linkedin', 'instagram'])],
      ]),
    )
    // eslint-disable-next-line no-console -- print the counts; a count is a claim.
    console.log(
      '[rollup] counts →',
      rollups.map((r) => `${r.campaign.id.slice(0, 8)}=${r.postCount} [${r.channels.join(',')}]`),
    )
    expect(rollups[0]!.postCount).toBe(2)
    expect(rollups[1]!.postCount).toBe(1)
  })

  it('a campaign with no memberships reports 0, which is a real count of real rows', () => {
    const rollups = rollupCampaigns([campaign(UUID(1))], [], new Map())
    expect(rollups[0]!).toMatchObject({ postCount: 0, channels: [] })
  })

  it('ignores a membership pointing at a campaign this read did not return', () => {
    const rollups = rollupCampaigns(
      [campaign(UUID(1))],
      [{ campaign_id: UUID(5), post_id: 'p1' }],
      new Map([['p1', post('p1', ['x'])]]),
    )
    expect(rollups[0]!.postCount).toBe(0)
  })
})

describe('the channel union is a SET — six posts on Instagram are one Instagram', () => {
  it('does not multiply a channel by the number of posts that target it', () => {
    const rollups = rollupCampaigns(
      [campaign(UUID(1))],
      [
        { campaign_id: UUID(1), post_id: 'p1' },
        { campaign_id: UUID(1), post_id: 'p2' },
        { campaign_id: UUID(1), post_id: 'p3' },
      ],
      new Map([
        ['p1', post('p1', ['instagram'])],
        ['p2', post('p2', ['instagram'])],
        ['p3', post('p3', ['instagram', 'x'])],
      ]),
    )
    // eslint-disable-next-line no-console -- the failure mode is a longer list.
    console.log('[rollup] three posts, two destinations →', rollups[0]!.channels)
    expect(rollups[0]!.channels).toEqual(['instagram', 'x'])
  })

  it('renders in one fixed order, so two campaigns never disagree about it', () => {
    expect(orderChannels(new Set<Channel>(['gbp', 'instagram']))).toEqual(['instagram', 'gbp'])
    expect(orderChannels(new Set<Channel>(['instagram', 'gbp']))).toEqual(['instagram', 'gbp'])
  })

  it('channelUnion gives the grid its columns, in the same order', () => {
    expect(
      channelUnion([
        { channels: toChannelSet(['x']) },
        { channels: toChannelSet(['instagram', 'x']) },
      ]),
    ).toEqual(['instagram', 'x'])
  })
})

describe('a period that does not exist is not rendered', () => {
  it('returns null when neither date was typed — the slot is deleted, not dashed', () => {
    expect(campaignPeriod(campaign(UUID(1)))).toBeNull()
  })

  it('reports a half-open period as its own kind, because it is a complete statement', () => {
    expect(campaignPeriod(campaign(UUID(1), { starts_at: '2026-10-20T00:00:00Z' }))).toEqual({
      kind: 'from',
      startsAt: '2026-10-20T00:00:00Z',
    })
    expect(campaignPeriod(campaign(UUID(1), { ends_at: '2026-11-05T00:00:00Z' }))).toEqual({
      kind: 'until',
      endsAt: '2026-11-05T00:00:00Z',
    })
  })

  it('reports both when both were typed', () => {
    expect(
      campaignPeriod(
        campaign(UUID(1), { starts_at: '2026-10-20T00:00:00Z', ends_at: '2026-11-05T00:00:00Z' }),
      ),
    ).toMatchObject({ kind: 'both' })
  })
})
