import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { CampaignStatusSchema, type CampaignStatus } from '@sahoda/shared'

import { CampaignForm } from '@/components/campaigns/campaign-form'
import { CampaignTable } from '@/components/campaigns/campaign-table'
import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { Unreadable } from '@/components/design-system/absence-row'
import { readCampaigns } from '@/lib/campaigns/read'
import { CAMPAIGN_STATUS_LABEL } from '@/lib/campaigns/status-label'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Campaigns' }

/**
 * CAMPAIGNS — a real screen over real rows.
 *
 * ── WHAT THIS REPLACED, AND WHY IT HAD TO GO ─────────────────────────────────
 * The page here until now was a drawing: three fictional cards reading "A
 * campaign you launched" / "One still being written" / "One that has finished",
 * with an em dash in every figure slot and a comment explaining that there was
 * no campaigns table. There is one. `campaigns` and `campaign_posts` are applied
 * to production with row-level security and four policies each, and nothing was
 * reading them.
 *
 * Two things about that drawing were wrong even as a drawing, and both are worth
 * naming so they do not come back:
 *
 *   1. IT RENDERED AN EM DASH FOR EVERY MISSING FIGURE — Spent, Reach,
 *      Conversions, ROAS, Health. The absence vocabulary has no mark for "there
 *      is no such quantity": you delete the slot. A dash in a Spend row claims
 *      there is a spend figure and it is merely unknown, which is a stronger and
 *      falser claim than saying nothing.
 *
 *   2. ITS FILTER CHIPS READ "Completed" — a word the status column has never
 *      accepted. It says `finished`. A filter built from that label would have
 *      matched nothing forever while looking exactly like an empty workspace.
 *
 * ── THE FIGURES THIS SCREEN IS ALLOWED ───────────────────────────────────────
 * A count of rows in `campaign_posts`, the union of the member posts' channels,
 * and the dates and stage the customer typed. That is all, and every one of them
 * is selected rather than modelled. There is no budget, no spend, no ROAS and no
 * health score anywhere on this route, because there is no table behind any of
 * them — see `packages/shared/src/db/campaigns.ts` for the full argument.
 */

/** `all` is not a status; it is the absence of the filter. Kept out of the enum. */
type Filter = 'all' | CampaignStatus

function readFilter(raw: string | undefined): Filter {
  if (raw === undefined || raw === 'all') return 'all'
  const parsed = CampaignStatusSchema.safeParse(raw)
  // An unknown value in the URL falls back to `all` rather than filtering to
  // nothing: a mistyped query string should not look like an empty workspace.
  return parsed.success ? parsed.data : 'all'
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>
}) {
  const { stage } = await searchParams
  const filter = readFilter(stage)
  const read = await readCampaigns()

  return (
    <div className="space-y-grid">
      {/* THE one primary action on this view — and only ever one of it.
          Rendered here when there IS a list to add to. On the empty screen the
          empty state's own button is the primary, and showing both would put
          two identical primaries on one view, which means neither is the main
          action. Playwright caught exactly that: a by-name lookup matched two
          elements on the empty screen.

          It is also absent for the other two reads: with no workspace there is
          nothing to create a campaign in, and after a failed read the list may
          already hold the name you are about to collide with. */}
      <PageTitle
        sub="Group posts under one push, and read them together."
        actions={read.status === 'ok' && read.rollups.length > 0 ? <CampaignForm /> : null}
      >
        Campaigns
      </PageTitle>

      {read.status === 'no-workspace' ? (
        <EmptyState
          icon={Megaphone}
          title="Create a workspace first"
          body="Campaigns belong to a workspace. Make one and this screen fills up."
          action={<CreateWorkspaceButton />}
        />
      ) : read.status === 'unreadable' ? (
        // NOT an empty state. "You have no campaigns" and "we could not read
        // your campaigns" are different claims, and offering Create as the
        // remedy for the second one is how a customer ends up with two.
        <section className="surface-ring flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
          <Unreadable what="Your campaigns" />
          <h2 className="type-h3 mt-1">Sahoda could not read your campaigns</h2>
          <p className="type-body max-w-[42ch] text-muted">
            The list did not come back this time. Reload. This is not a sign that you have none, and
            making a new one would not help.
          </p>
        </section>
      ) : read.rollups.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          body="A campaign is a named push (Diwali week, a new menu) that a handful of posts belong to, so you can plan and read them together."
          action={<CampaignForm />}
          tip="Name it after the thing you would say out loud. You can add posts straight after."
        />
      ) : (
        <>
          <StageFilter rollups={read.rollups} active={filter} />
          <CampaignTable
            rollups={read.rollups.filter(
              (rollup) => filter === 'all' || rollup.campaign.status === filter,
            )}
          />
          {/* The one honest note about what this screen does NOT do. Without it
              a stage column reads as something that keeps itself current. */}
          <p className="type-sm text-muted">
            Nothing moves a campaign between stages on its own. You set the stage when you are
            ready.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * The stage filter, as LINKS.
 *
 * Each one changes the URL, so each is an anchor: cmd-click opens a new tab, the
 * choice survives a reload, and a screen reader finds them in the page's link
 * list. `router.push` from a button does none of that.
 *
 * ── THE COUNTS ARE REAL, WHICH IS WHY THEY ARE ALLOWED ───────────────────────
 * The screen this replaced dropped its counts, correctly, because there was no
 * table to count. There is one now, the rows are in hand, and every number here
 * is `rollups.filter(…).length` — a count of what is on this page. A stage with
 * no campaigns shows `0`, and that zero is a fact rather than a guess.
 */
function StageFilter({
  rollups,
  active,
}: {
  rollups: readonly { campaign: { status: CampaignStatus } }[]
  active: Filter
}) {
  const options: ReadonlyArray<{ value: Filter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: rollups.length },
    ...CampaignStatusSchema.options.map((status) => ({
      value: status as Filter,
      label: CAMPAIGN_STATUS_LABEL[status],
      count: rollups.filter((rollup) => rollup.campaign.status === status).length,
    })),
  ]

  return (
    <nav aria-label="Filter campaigns by stage">
      <ul className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const current = option.value === active
          return (
            <li key={option.value}>
              <Link
                href={option.value === 'all' ? '/campaigns' : `/campaigns?stage=${option.value}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'type-sm inline-flex items-center gap-1.5 rounded-pill px-3 py-[5px] font-[550] transition-micro',
                  'max-narrow:min-h-[44px]',
                  current
                    ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                    : 'text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink',
                )}
              >
                {option.label}
                <span className="num tabular-nums">{option.count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
