import Link from 'next/link'
import type { Route } from 'next'
import { Image as ImageIcon, LineChart, Target, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { GatesLadder } from '@/components/ads/gates-ladder'
import { NotRunningNote } from '@/components/ads/inert-parts'
import { InertButton, InertChip } from '@/components/roadmap/inert'
import { DataTable } from '@/components/ui/data-table'

export const metadata = { title: 'Ads' }

/**
 * ADS · OVERVIEW — the ad campaign list, as it will be.
 *
 * ── THE TABLE IS EMPTY AND ITS COLUMNS ARE VISIBLE, ON PURPOSE ───────────────
 * `DataTable` renders its empty state INSIDE the table so the columns stay on
 * screen and the reader can see what would be there. That behaviour was written
 * for a workspace with no rows yet, and it is exactly what a roadmap screen
 * needs: the column headers are a promise about Sahoda, which is allowed, while
 * a figure in a cell would be a claim about the reader's business, which is not.
 *
 * So Spend, Results and Cost per result are named and empty. Not zeroed, not
 * dashed — a dash asserts the quantity exists and is merely unknown, and none of
 * these exist. There is no ad account behind this screen and no rupee has moved.
 *
 * ── THE FOUR CARDS BELOW ARE REAL LINKS ──────────────────────────────────────
 * They go to the other four Ads routes, which exist and load. Nothing in this
 * section is a dead end: the controls are pictures, the navigation is real.
 */

const AREAS: ReadonlyArray<{ href: Route; icon: LucideIcon; title: string; body: string }> = [
  {
    href: '/ads/creative',
    icon: ImageIcon,
    title: 'Creative',
    body: 'One ad, a different crop and a different line for every placement — the same rule your posts already follow across channels.',
  },
  {
    href: '/ads/targeting',
    icon: Target,
    title: 'Audience',
    body: 'Who sees it: a place, a radius, and the customer the Brand Brain already describes.',
  },
  {
    href: '/ads/budget',
    icon: Wallet,
    title: 'Budget',
    body: 'What you are willing to spend, how it is paced, and a record of every rupee that moved.',
  },
  {
    href: '/ads/performance',
    icon: LineChart,
    title: 'Results',
    body: 'What the spend bought, next to what the unpaid posts did in the same week.',
  },
]

export default function AdsPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {/* The reference's chips carry counts. There is no ad campaign to
              count, so they keep their names and lose their numbers — not a
              zero, which would claim the collection exists and is empty. */}
          <InertChip on>All</InertChip>
          <InertChip>Running</InertChip>
          <InertChip>Paused</InertChip>
          <InertChip>Finished</InertChip>
        </div>
        <div className="flex flex-wrap gap-2">
          <InertButton>Connect an ad account</InertButton>
          <InertButton primary>Create ad campaign</InertButton>
        </div>
      </div>

      <DataTable
        caption="Ad campaigns, and what each one spent and returned"
        columns={[
          { key: 'name', header: 'Ad campaign' },
          { key: 'placement', header: 'Where it runs' },
          { key: 'stage', header: 'Stage' },
          { key: 'spend', header: 'Spend', numeric: true },
          { key: 'results', header: 'Results', numeric: true },
          { key: 'cpr', header: 'Cost per result', numeric: true },
        ]}
        rows={[]}
        empty="No ad campaigns — Sahoda cannot run one yet. These are the columns it will report."
      />

      <GatesLadder />

      <section aria-labelledby="ads-areas" className="flex flex-col gap-3">
        <h2 id="ads-areas" className="type-h2">
          What Ads will be
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {AREAS.map((area) => (
            <li key={area.href}>
              <Link
                href={area.href}
                className="surface-ring flex h-full items-start gap-3 rounded-card bg-surface p-4 transition-micro hover:bg-s1"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-wash text-accent shadow-[inset_0_0_0_1px_var(--brand-lift)] dark:bg-s2">
                  <area.icon size={17} strokeWidth={1.8} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="type-h3 block">{area.title}</span>
                  <span className="type-sm mt-0.5 block text-muted">{area.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <NotRunningNote>
        Everything you can press on this screen works and goes somewhere real. Everything that looks
        like a control does not — there is no ad account, no bid and no spend behind any of it. Your
        posts, your planner and your credits are unaffected by anything here.
      </NotRunningNote>
    </div>
  )
}
