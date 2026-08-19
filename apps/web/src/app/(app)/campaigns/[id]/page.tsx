import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, SquarePen } from 'lucide-react'

import { AddPosts } from '@/components/campaigns/add-posts'
import { CampaignForm } from '@/components/campaigns/campaign-form'
import { CampaignGrid } from '@/components/campaigns/campaign-grid'
import { CampaignStatusControl } from '@/components/campaigns/campaign-status'
import { DeleteCampaignButton } from '@/components/campaigns/delete-campaign-button'
import { LiveCount } from '@/components/campaigns/channel-cell'
import { Unreadable } from '@/components/design-system/absence-row'
import { buttonVariants } from '@/components/ui/button'
import { campaignRowCells, livePublishCount } from '@/lib/campaigns/cell'
import { readAddablePosts, readCampaign, readCampaignPosts } from '@/lib/campaigns/read'
import { campaignPeriod, channelUnion } from '@/lib/campaigns/rollup'
import { cn } from '@/lib/utils'

/**
 * ONE CAMPAIGN — and the grid that is the reason this screen exists.
 *
 * ── WHAT A READER COMES HERE TO FIND OUT ─────────────────────────────────────
 * Not "how is the campaign doing" in the metrics sense — there are no paid
 * numbers in this product and this screen invents none. The question it answers
 * is the one a person running a Diwali push actually has on the Tuesday: which
 * of these posts is out, where, and what is still missing.
 *
 * That question is per POST and per CHANNEL, so the answer is a grid. See
 * `campaign-grid.tsx` for why the columns are channels and why collapsing them
 * would throw away the thing this product does that its competitors do not.
 *
 * ── THE PAGE HAS ONE PRIMARY ACTION ──────────────────────────────────────────
 * `Add posts`. Edit is secondary, the stage is a select, and delete lives at the
 * bottom in its own row rather than beside them — a destructive action does not
 * share a strip with the ordinary ones.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const read = await readCampaign(id)
  return { title: read.status === 'ok' ? read.campaign.name : 'Campaign' }
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaignRead = await readCampaign(id)

  // Only a confirmed absence is a 404. A read that threw must never tell a
  // customer their campaign is gone.
  if (campaignRead.status === 'missing') notFound()

  if (campaignRead.status === 'unreadable') {
    return (
      <div className="space-y-grid">
        <BackLink />
        <section className="surface-ring flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
          <Unreadable what="This campaign" />
          <h1 className="type-h3 mt-1">Sahoda could not read this campaign</h1>
          <p className="type-body max-w-[42ch] text-muted">
            It did not come back this time. Reload — the campaign has not gone anywhere.
          </p>
        </section>
      </div>
    )
  }

  const campaign = campaignRead.campaign
  const postsRead = await readCampaignPosts(id)
  const posts = postsRead.status === 'ok' ? postsRead.posts : []
  const variants =
    postsRead.status === 'ok' ? postsRead.variants : ({ status: 'unreadable' } as const)
  const addable = await readAddablePosts(posts.map((post) => post.id))

  const columns = channelUnion(posts)
  const period = campaignPeriod(campaign)
  const liveCount = livePublishCount(
    posts.map((post) => ({ cells: campaignRowCells(post, columns, variants) })),
  )

  return (
    <div className="space-y-grid">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-h1 truncate">{campaign.name}</h1>
          {campaign.objective ? (
            <p className="type-body mt-[2px] text-muted">{campaign.objective}</p>
          ) : null}
          {/* Rendered only when a date was typed. No dates means no line — not
              an em dash, and not "no dates set" in grey, which would make an
              unmade decision look like a missing one. */}
          {period ? (
            <p className="type-sm mt-1 text-muted">
              {period.kind === 'both'
                ? `Runs ${fullDay(period.startsAt)} to ${fullDay(period.endsAt)}`
                : period.kind === 'from'
                  ? `Starts ${fullDay(period.startsAt)}`
                  : `Ends ${fullDay(period.endsAt)}`}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CampaignStatusControl campaignId={campaign.id} status={campaign.status} />
          <CampaignForm campaign={campaign} trigger="secondary" />
          <AddPosts
            campaignId={campaign.id}
            posts={addable.status === 'ok' ? addable.posts : []}
            unreadable={addable.status === 'unreadable'}
          />
        </div>
      </div>

      {postsRead.status === 'unreadable' ? (
        <section className="surface-ring flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
          <Unreadable what="The posts in this campaign" />
          <h2 className="type-h3 mt-1">Sahoda could not read what is in this campaign</h2>
          <p className="type-body max-w-[42ch] text-muted">
            Reload. Adding posts now would be working blind — some may already be in.
          </p>
        </section>
      ) : posts.length === 0 ? (
        <section className="surface-ring flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
          <span className="mb-2 grid size-11 place-items-center rounded-md bg-brand-wash text-accent shadow-[inset_0_0_0_1px_var(--brand-lift)] dark:bg-s2">
            <SquarePen size={21} strokeWidth={1.7} aria-hidden />
          </span>
          <h2 className="type-h3">Nothing in this campaign yet</h2>
          <p className="type-body max-w-[42ch] text-muted">
            Add posts you have already written, and each one keeps its own body on each channel.
            Adding a post here does not change it.
          </p>
        </section>
      ) : (
        <>
          <CampaignGrid
            posts={posts}
            columns={columns}
            variants={variants}
            campaignId={campaign.id}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LiveCount count={liveCount} />
            {/* Says what the grid is, once, so a reader does not have to infer
                the rule from the shapes. */}
            <p className="type-sm text-muted">
              Every channel publishes on its own — a column can be out while another is still
              waiting.
            </p>
          </div>
        </>
      )}

      <DeleteCampaignButton campaignId={campaign.id} campaignName={campaign.name} />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/campaigns"
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 self-start')}
    >
      <ArrowLeft size={14} strokeWidth={2} aria-hidden />
      All campaigns
    </Link>
  )
}

/**
 * UTC on purpose. The stored value is a `date` input's `YYYY-MM-DD` at midnight
 * UTC, so rendering in the reader's local zone shows the previous day anywhere
 * west of Greenwich — a start date the customer never typed.
 */
function fullDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
