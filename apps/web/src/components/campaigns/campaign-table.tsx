import Link from 'next/link'

import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { campaignPeriod, type CampaignRollup } from '@/lib/campaigns/rollup'
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_RUNG } from '@/lib/campaigns/status-label'

/**
 * Every campaign in the workspace, as a table.
 *
 * ── FIVE COLUMNS, AND WHAT IS MISSING FROM THEM IS THE POINT ─────────────────
 * The reference's card carries Spent against a budget with a share bar, Reach,
 * Conversions, ROAS and a Health score. None of those columns are here, and none
 * of them are here as an empty column either — an empty column is a promise that
 * a number is coming, and there is no query behind any of them.
 *
 * What IS here is every figure a query produces: the name and objective the
 * customer typed, the stage they set, the dates they chose, a count of rows in
 * `campaign_posts`, and the union of the member posts' channels.
 *
 * ── A TABLE, NOT CARDS ───────────────────────────────────────────────────────
 * The reader compares campaigns to each other — which is running, which has the
 * most in it, which ends first. That is a column scan.
 */
export function CampaignTable({ rollups }: { rollups: readonly CampaignRollup[] }) {
  return (
    <DataTable
      caption="Your campaigns, with how many posts are in each"
      columns={[
        { key: 'name', header: 'Campaign' },
        { key: 'stage', header: 'Stage' },
        { key: 'dates', header: 'Runs' },
        { key: 'posts', header: 'Posts', numeric: true },
        { key: 'channels', header: 'Channels' },
      ]}
      rows={rollups.map(({ campaign, postCount, channels }) => {
        const period = campaignPeriod(campaign)
        return {
          name: (
            <span className="block min-w-0">
              <Link href={`/campaigns/${campaign.id}`} className="type-h3 hover:underline">
                {campaign.name}
              </Link>
              {campaign.objective ? (
                <span className="type-sm mt-0.5 block truncate text-muted">
                  {campaign.objective}
                </span>
              ) : null}
            </span>
          ),
          stage: (
            <Badge rung={CAMPAIGN_STATUS_RUNG[campaign.status]}>
              {CAMPAIGN_STATUS_LABEL[campaign.status]}
            </Badge>
          ),
          // No period means no period. The cell is empty rather than dashed:
          // there is no such quantity, and the vocabulary's answer to that is to
          // delete the slot, never to fill it with a mark.
          dates: period ? (
            <span className="type-sm whitespace-nowrap text-muted">{periodWords(period)}</span>
          ) : (
            <span className="sr-only">No dates set</span>
          ),
          // A real count of real rows, so a zero is honest and gets to render.
          posts: postCount,
          channels:
            channels.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {channels.map((channel) => (
                  <span
                    key={channel}
                    className="type-sm rounded-pill px-2 py-[1px] text-muted shadow-[inset_0_0_0_1px_var(--line)]"
                  >
                    {CHANNEL_SHORT[channel]}
                  </span>
                ))}
              </span>
            ) : (
              <span className="sr-only">No channels. Nothing in this campaign targets one yet</span>
            ),
        }
      })}
      empty="No campaigns yet."
    />
  )
}

/**
 * A period in words. All three forms are complete sentences about a decision
 * someone made, which is why a half-open period is not treated as incomplete.
 */
function periodWords(period: NonNullable<ReturnType<typeof campaignPeriod>>): string {
  switch (period.kind) {
    case 'both':
      return `${day(period.startsAt)} to ${day(period.endsAt)}`
    case 'from':
      return `From ${day(period.startsAt)}`
    case 'until':
      return `Until ${day(period.endsAt)}`
  }
}

/**
 * Formatted with an explicit UTC timezone.
 *
 * The value is a `date` input's `YYYY-MM-DD` stored as a timestamptz at
 * midnight UTC. Rendering it in the reader's local zone would show the previous
 * day everywhere west of Greenwich — a start date the customer never typed.
 */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
