import Link from 'next/link'
import { Activity, Radar as RadarIcon, Timer } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { creditWord } from '@/lib/credit-words'
import { ChangeFeed } from '@/components/radar/change-feed'
import { RadarScope } from '@/components/radar/radar-scope'
import { WatchBoard } from '@/components/radar/watch-board'
import { WatchCard } from '@/components/radar/watch-card'
import { connectedChannels } from '@/app/actions/radar'
import { radarScanEnabled } from '@/lib/cron/radar-enabled'
import { watchCards } from '@/lib/radar/cards'
import { radarStore } from '@/lib/radar/read'
import { nextScanDate } from '@/lib/radar/schedule'
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
 * ── THE 2026-09-06 REDESIGN: THE RADAR ARRIVES WITH THE FIRST WATCH ─────────
 * The instrument used to be drawn beside the headline on every visit, with an
 * empty sky when nobody was watched. `RadarScope` was already honest about the
 * marks; what it could not fix is that a radar face is the most confident object
 * on the screen, and it was at its largest on the visit where Sahoda knew the
 * least. So the first screen is now the introduction and the form and nothing
 * else, the radar appears when there is something on it, and the moment between
 * the two is a real transition rather than a page that silently reflows.
 *
 * The `h1` is unchanged, and deliberately: it is pinned in `e2e/helpers/headings.ts`
 * and asserted by a smoke spec whose fixture is a brand-new workspace — that is,
 * by the empty state below. `PageTitle` is still not used here, for the reason it
 * was never used here: a feature that has to explain itself to a first-time
 * reader needs a headline that is a sentence, and `PageTitle` renders a noun.
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
  const cards = watchCards(snapshot)
  const watching = cards.length > 0
  // Both computed on the SERVER. A date computed in the reader's browser is a
  // different answer on the evenings that straddle midnight in UTC, and React
  // re-renders the mismatch; the switch is an environment variable this process
  // can read and the browser cannot.
  const nextScan = nextScanDate(new Date())
  const scanArmed = radarScanEnabled()

  return (
    <div className="space-y-grid">
      {/* ── THE HERO ────────────────────────────────────────────────────────
          Two shapes, one band. With nobody watched it is a single column at
          reading width and there is no instrument in it; with a watch list it
          narrows and the radar takes the right-hand cell, drawing exactly as
          many marks as there are businesses. */}
      <section
        className={
          watching
            ? 'grid items-center gap-6 wide:grid-cols-[minmax(0,1fr)_minmax(0,340px)]'
            : 'mx-auto w-full max-w-[720px]'
        }
      >
        <div className="min-w-0">
          <p className="type-eyebrow flex items-center gap-2 text-accent">
            <RadarIcon size={15} strokeWidth={1.9} aria-hidden />
            Radar
          </p>
          <h1 className={`mt-2 max-w-[24ch] text-ink ${watching ? 'type-h1' : 'type-display'}`}>
            Stay ahead of what matters.
          </h1>
          <p className="type-body mt-2 max-w-[52ch] text-muted">
            Track the businesses, websites and listings that matter to your brand. Sahoda reads them
            once a week and tells you what actually moved.
          </p>
        </div>

        {watching ? (
          <div className="mx-auto w-full max-w-[340px] max-narrow:max-w-[240px]">
            <RadarScope marks={cards.length} scanning={scanning} />
          </div>
        ) : null}
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
          {/* The instrument AND the cards are rendered HERE, on the server, and
              handed in as nodes. `watch-board.tsx` is a client component, and
              importing them into it put this route 12.6 kB over its byte budget:
              static SVG and static markup that never needed to reach the browser
              as JavaScript at all. The board keeps only what genuinely needs it
              — which of three states is showing, the filter, and the form. */}
          <WatchBoard
            items={cards.map((card) => ({
              id: card.competitor.id,
              changed: card.status.claim === 'changed',
              card: <WatchCard card={card} nextScan={nextScan} scanArmed={scanArmed} />,
            }))}
            scope={<RadarScope marks={Math.max(cards.length, 1)} scanning={scanning} />}
            nextScan={nextScan}
            perScan={perScan}
          />

          {/* ── WHAT CHANGED, UNDER THE LIST RATHER THAN BESIDE IT ──────────
              It stays on THIS route, and that is not a layout preference: the
              certainty marks and the draft-a-reply control are asserted here by
              two specs, and moving the feed to the detail page would leave both
              with nothing to measure. It renders only when there is genuinely
              something in it, so the watch list is the whole screen until Radar
              has read something. */}
          {snapshot.days.length > 0 ? (
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

              <ChangeFeed
                days={snapshot.days}
                competitors={snapshot.competitors}
                channels={channels}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
