import Link from 'next/link'
import { creditCost } from '@sahoda/shared'

import { AutonomyDial } from '@/components/loop/autonomy-dial'
import { CycleStrip } from '@/components/loop/cycle-strip'
import { PageTitle } from '@/components/page-title'
import { RoadmapBanner } from '@/components/roadmap/inert'
import { NotRunningNote } from '@/components/roadmap/parts'

export const metadata = { title: 'The Loop' }

/**
 * THE LOOP — the product's headline promise, drawn whole and running nowhere.
 *
 * ── WHY THIS SECTION EXISTS BEFORE THE FEATURE DOES ──────────────────────────
 * "Learn → plan → create → test → publish → measure → learn again" is the thesis
 * the whole PRD is built on, and until now it appeared nowhere in the app. A
 * customer could use Sahoda for a month and never learn that the weekly cycle is
 * the point. That is a worse outcome than an honest roadmap screen.
 *
 * ── WHAT IS ACTUALLY BUILT, AND SAID PLAINLY BELOW ───────────────────────────
 * One piece of the Loop runs today and it is on another screen: "Plan my week"
 * on Home does the `plan` stage once, on demand, for the same 20 credits the
 * whole cycle will cost. That is a real link, not a consolation — it is the one
 * part a reader can go and use, and pretending it lived here would put a working
 * button on a page where nothing else works.
 *
 * ── THE PRICE IS ALLOWED; NOTHING ELSE NUMERIC IS ────────────────────────────
 * `creditCost('loop_cycle')` reads pricing.config.json, the single source for
 * every credit price in this product. A price is a fact about Sahoda, published
 * and checkable, in the same class as a channel name. It is NOT in the class of
 * thing this screen may not show — a reach figure, a post count, a predicted
 * score — because none of those is a fact about Sahoda; each would be a claim
 * about the reader's business that no query behind this page has earned.
 */
export default function LoopPage() {
  return (
    <div className="space-y-grid">
      <PageTitle sub="A weekly cycle that plans, writes, tests and reports — as far as you let it go on its own.">
        The Loop
      </PageTitle>

      <RoadmapBanner what="The Loop will run your week: it plans on Sunday, works through the week, and reports back on Monday." />

      <CycleStrip />
      <AutonomyDial />

      <section aria-labelledby="loop-today" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="loop-today" className="type-h3">
          One step of this already works
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          The <strong className="font-[550] text-ink">plan</strong> step runs today, on demand, from
          Home. It reads your Brand Brain and leaves a week of drafts in your Planner. What is
          missing is the rest of the circle: nothing collects last week&rsquo;s numbers yet, nothing
          reflects on them, and nothing reports back on Monday.
        </p>
        <p className="type-sm mt-3">
          <Link href="/home" className="font-[550] text-accent underline underline-offset-2">
            Plan a week from Home
          </Link>
          <span className="ml-2 text-muted">
            &middot; <span className="num">{creditCost('loop_cycle')}</span> credits, the same as a
            full cycle will cost
          </span>
        </p>
      </section>

      <NotRunningNote>
        Nothing on this page is scheduled. There is no cycle running for your workspace, no Sunday
        job and no Monday report, and no autonomy level is stored anywhere &mdash; which is why none
        of the four above is marked as yours.
      </NotRunningNote>
    </div>
  )
}
