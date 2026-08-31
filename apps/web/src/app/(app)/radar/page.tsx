import Link from 'next/link'
import { Activity, Radar as RadarIcon, Timer } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { creditWord } from '@/lib/credit-words'
import { ChangeFeed } from '@/components/radar/change-feed'
import { RadarScope } from '@/components/radar/radar-scope'
import { WatchForm, WatchRows } from '@/components/radar/watch-list'
import { WatchSummary } from '@/components/radar/watch-summary'
import { connectedChannels } from '@/app/actions/radar'
import { radarStore } from '@/lib/radar/read'
import { getActiveWorkspace } from '@/lib/workspaces'

export const metadata = { title: 'Radar' }

/**
 * RADAR — what the businesses beside you did, and what your brand says about it.
 *
 * ── THE DIFF, NOT THE STATE ──────────────────────────────────────────────────
 * There is no list of a competitor's posts on this screen and there is not meant
 * to be. Anybody can buy scraping; a feed of someone else's content is the
 * commodity half of this category and it is the half nobody reads twice. What is
 * here is what MOVED — a cadence that shifted, an offer that appeared, a price
 * that is not what it was at the last read — because a change is the only thing
 * a shop owner can act on this week.
 *
 * ── AND THE INTERPRETATION IS GROUNDED IN THE BRAND BRAIN ───────────────────
 * "They are competing on price" is worth nothing on its own. "They are competing
 * on price; your brain says you compete on same-day freshness, so answer with
 * what a bundle cannot copy" is worth something, and no other product can say it
 * because no other product holds this workspace's brain. That sentence is
 * HATCHED wherever it appears — it is an inference, and it carries no number,
 * because a number would give a judgement the authority of a measurement.
 *
 * ── THE THREE STATES OF THIS SCREEN ARE THREE DIFFERENT FACTS ───────────────
 *   collector 'absent'   the weekly scan is not built yet. Nobody is collecting.
 *   watching nobody      the collector is fine; you have not named anyone.
 *   watching, no reads   we have looked and nothing has come back yet.
 *
 * Rendering any two of those the same way is the failure this whole screen is
 * organised against, one level up from the per-day gaps in `ChangeFeed`. A
 * product that distinguishes "their page did not load" from "their week was
 * quiet" and then blurs its own three states has not understood its own point.
 *
 * ── THE 2026-08-29 REDESIGN, AND THE ONE THING IT WAS NOT ALLOWED TO DO ─────
 * The founder asked for a hero, a live radar and a two-column grid. All three
 * are here. What they also asked for, and what is deliberately absent, is a
 * radar full of pretty data points on a screen where nobody is being watched.
 *
 * `RadarScope` takes the REAL number of watches and draws that many marks, so a
 * first-time reader sees an empty sky rather than a picture of somebody else's
 * competitors. And the sweep only turns when `collector !== 'absent'` — an
 * animated scan over a collector that is not built is an animation claiming
 * work nobody is doing, which is the same defect as a fabricated number, moving.
 */
export default async function RadarPage() {
  const workspace = await getActiveWorkspace()
  const perScan = creditCost('radar_scan')

  if (!workspace) {
    return (
      <div className="space-y-grid">
        <PageTitle sub="What the businesses beside you are doing, and what your brand would say about it.">
          Radar
        </PageTitle>
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          Finish setting up your workspace and Radar appears here.
        </p>
      </div>
    )
  }

  const [snapshot, channels] = await Promise.all([
    radarStore().read(workspace.id),
    connectedChannels(),
  ])

  const scanning = snapshot.collector !== 'absent'

  return (
    <div className="space-y-grid">
      {/* ── THE HERO ────────────────────────────────────────────────────────
          The eyebrow, the headline and the radar, in one band. `PageTitle` is
          NOT used here and this is the second screen to make that call
          deliberately (see `greeting-banner.tsx` on /home): a product feature
          that has to explain itself to a first-time reader needs a headline
          that is a sentence, and `PageTitle` renders a noun. The `h1` is still
          an `h1`, so `every-section-loads.spec.ts` and the document outline are
          unchanged — it just says something. */}
      <section className="grid items-center gap-6 wide:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="min-w-0">
          <p className="type-eyebrow flex items-center gap-2 text-accent">
            <RadarIcon size={15} strokeWidth={1.9} aria-hidden />
            Radar
          </p>
          <h1 className="mt-2 type-display max-w-[24ch] text-ink">Stay ahead of what matters.</h1>
          <p className="type-body mt-2 max-w-[52ch] text-muted">
            What the businesses beside you are doing, and what your brand would say about it.
          </p>
        </div>
        <div className="mx-auto w-full max-w-[420px] max-narrow:max-w-[300px]">
          <RadarScope marks={snapshot.competitors.length} scanning={scanning} />
        </div>
      </section>

      {snapshot.collector === 'absent' ? (
        /* ── NOT COLLECTING ────────────────────────────────────────────────
           The screen is built; the weekly scan that fills it is not. Saying so
           plainly is the only honest option — an add form that cannot store
           anything would be a control that fails on use, which reads as a broken
           app rather than as an unshipped collector. */
        <section
          aria-labelledby="radar-not-collecting"
          className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4"
        >
          <h2 id="radar-not-collecting" className="type-h2">
            The weekly scan is not built yet
          </h2>
          <p className="type-body max-w-[68ch] text-muted">
            Radar reads a handful of public pages once a week and tells you what changed &mdash; a
            posting rhythm that shifted, an offer that appeared, a price that is not what it was.
            Then it says what your own positioning answers with, out of your Brand Brain. Nothing is
            being collected yet, which is why there is no watch list here to add to.
          </p>
          <p className="type-body max-w-[68ch] text-muted">
            What it will never do is put a number on a business it cannot see. No revenue, no ad
            spend, no customer count, and no engagement rate it did not measure &mdash; those are
            the figures every tool in this category prints and none of them can know.
          </p>
          <p className="type-sm flex items-center gap-1.5 text-muted">
            <Timer size={13} strokeWidth={1.8} aria-hidden />
            One scan per business per week, at <span className="num">{perScan}</span>{' '}
            {creditWord(perScan)} each. A page that will not load is skipped and not charged.
          </p>
          <p className="type-body max-w-[68ch] text-muted">
            What your own business is goes in the{' '}
            <Link href="/brain" className="font-[550] text-accent underline underline-offset-2">
              Brand Brain
            </Link>
            , and that part works today.
          </p>
        </section>
      ) : (
        <>
          {/* Twelve columns of intent, in two: the summary and the form on the
              left, the feed on the right. `items-start` rather than `stretch`
              so the feed does not grow to match a short left column, which is
              what turns a grid into two boxes of empty space. */}
          <div className="grid items-start gap-4 wide:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <WatchSummary competitors={snapshot.competitors} />
              <WatchForm />
            </div>

            <section
              aria-labelledby="radar-changes"
              className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-5"
            >
              <div>
                <h2 id="radar-changes" className="type-h3 flex items-center gap-2 text-ink">
                  <Activity size={16} strokeWidth={1.8} aria-hidden className="text-accent" />
                  What changed
                </h2>
                <p className="type-sm mt-1.5 max-w-[60ch] text-muted">
                  Radar reads the businesses you named and surfaces what actually moved.
                </p>
              </div>

              {snapshot.competitors.length === 0 ? (
                /* WATCHING NOBODY — and the empty state teaches rather than
                 reports. "No competitors yet" tells a reader something they can
                 already see; what they cannot see is what naming one would get
                 them. */
                <EmptyState
                  icon={RadarIcon}
                  title="You are not watching anyone yet"
                  body="Name a business above and Radar reads its public pages once a week, then tells you what moved (a new offer, a price that changed, a posting rhythm that shifted) and what your own brand would say back."
                  tip="Watch the shop your customers compare you against, not the biggest name in your category."
                />
              ) : snapshot.collector === 'watch-list-only' ? (
                /* WATCHING, BUT THIS SCREEN CANNOT READ THE READINGS.
                 An empty feed here would be a CLAIM — "nothing changed" — and
                 this binding has not earned it. See lib/radar/store.ts. */
                <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
                  Your watch list is stored, and the weekly readings are not wired into this screen
                  yet. This is not &ldquo;nothing changed&rdquo; &mdash; it is Radar not being able
                  to tell you either way, and those are different things.
                </p>
              ) : snapshot.days.length === 0 ? (
                <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
                  Nothing has been read yet. The first scan runs within the week, and what it finds
                  appears here newest first.
                </p>
              ) : (
                <ChangeFeed
                  days={snapshot.days}
                  competitors={snapshot.competitors}
                  channels={channels}
                />
              )}
            </section>
          </div>

          {/* The list itself, full width under the two columns. It is what
              "View all watches" in the summary anchors to, and it renders
              nothing at all when there is nobody on it. */}
          <WatchRows competitors={snapshot.competitors} />
        </>
      )}
    </div>
  )
}
