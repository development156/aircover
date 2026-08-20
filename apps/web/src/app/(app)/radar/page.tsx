import Link from 'next/link'
import { Building2, FileText, Megaphone, Timer } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertField, RoadmapBanner } from '@/components/roadmap/inert'
import { InertPanel, InertRow, NotRunningNote } from '@/components/roadmap/parts'

export const metadata = { title: 'Radar' }

/**
 * RADAR — watching a handful of competitors, and saying what it will not do.
 *
 * ── THE FIVE SLOTS ARE THE SIGNATURE, AND THEY ARE EMPTY ─────────────────────
 * PRD M9 caps this at five competitors. That cap is the interesting part of the
 * design and it is the honest thing to draw: five named, numbered slots, all of
 * them empty. It shows the shape of the feature (a short watch-list, not a feed)
 * without a single invented name — and an empty slot is a truthful picture of a
 * workspace watching nobody, which is every workspace.
 *
 * A competitor NAME would be the worst figure on this screen. Not a number, but
 * the same class of lie: a claim about the reader's market, invented.
 *
 * ── WHY THE LIMITS PANEL IS AS PROMINENT AS THE FEATURE ──────────────────────
 * Competitive tools are where a marketing product is most tempted to imply it
 * knows things it cannot know — follower counts it did not measure, "engagement"
 * on someone else's post, a spend estimate. Radar reads public pages. It cannot
 * see a private account, it cannot see what an ad cost, and it will not guess.
 * Saying that here, at the same weight as the feature, is what separates this
 * from every competitor-tracking screen that quietly makes numbers up.
 *
 * ── COMPETITORS LIVE HERE, NOT IN THE BRAND BRAIN ────────────────────────────
 * `/brain/competitors` used to be a second, near-identical coming-soon screen.
 * Two homes for one idea is how a reader learns to distrust the navigation, so
 * that route now redirects here. The Brand Brain holds what your business IS;
 * this holds what the businesses around it are doing.
 */

/** Five, because five is the cap. Numbered because a cap is a count. */
const SLOTS = [1, 2, 3, 4, 5] as const

export default function RadarPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Watch up to five businesses like yours, and get a short read on what they did each week.">
          Radar
        </PageTitle>
        <InertButton primary>Add a competitor</InertButton>
      </div>

      <RoadmapBanner what="Radar will check a few public pages once a week and tell you what changed, with two drafts that answer it." />

      <section aria-labelledby="radar-watchlist" className="flex flex-col gap-3">
        <div>
          <h2 id="radar-watchlist" className="type-h2">
            Your watch list
          </h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            Five places, entered by you &mdash; a website, a public Instagram, a Google Business
            Profile. Five is the limit on purpose: a watch list you actually read beats a feed you
            scroll past.
          </p>
        </div>

        <ul className="grid gap-2 wide:grid-cols-2">
          {SLOTS.map((slot) => (
            <li
              key={slot}
              data-inert-control
              className="is-proposed flex items-center gap-3 rounded-card px-3 py-3 select-none"
            >
              <span className="type-eyebrow num w-[18px] shrink-0 text-muted">{slot}</span>
              <Building2 size={15} strokeWidth={1.8} aria-hidden className="shrink-0 text-muted" />
              <span className="type-sm min-w-0 flex-1 text-muted">
                An address you have not added yet
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <InertField label="Website, Instagram handle or Google listing" />
          <InertButton>Add</InertButton>
        </div>
      </section>

      <section aria-labelledby="radar-digest" className="flex flex-col gap-3">
        <div>
          <h2 id="radar-digest" className="type-h2">
            What a week&rsquo;s read looks like
          </h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            One scan per business per week, then one page you can read in a minute.
          </p>
        </div>

        <div className="grid gap-3 wide:grid-cols-3">
          <InertPanel
            title="How often they post"
            what="Their rhythm over the last few weeks, next to yours."
          >
            <p className="type-sm text-muted">
              A shape, not a score. There is no ranking here and no winner.
            </p>
          </InertPanel>
          <InertPanel
            title="What did best for them"
            what="The posts of theirs that people responded to, and what they were about."
          >
            <p className="type-sm text-muted">
              Only what a public page shows. Sahoda does not estimate what it cannot see.
            </p>
          </InertPanel>
          <InertPanel
            title="Offers and launches"
            what="A price change, a new product, a sale that appeared this week."
          >
            <p className="type-sm text-muted">
              The thing most worth knowing, and the thing you would otherwise find out late.
            </p>
          </InertPanel>
        </div>

        <div className="grid gap-3 wide:grid-cols-2">
          <InertRow
            icon={FileText}
            name="A draft that answers it"
            note="Written from your Brand Brain — what you do differently, in your own words. Not a copy of theirs."
          />
          <InertRow
            icon={Megaphone}
            name="A second one, another angle"
            note="Two drafts per digest, so you can choose rather than edit the only one you were given."
          />
        </div>
      </section>

      <section aria-labelledby="radar-limits" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="radar-limits" className="type-h3">
          What Radar will never tell you
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Every tool in this category shows numbers about other people&rsquo;s businesses. Most of
          them are estimates presented as readings. Sahoda reads public pages, so there are three
          things it cannot know and will not invent:
        </p>
        <ul className="type-body mt-2 grid gap-1.5 text-muted">
          <li>&mdash; What a competitor spent on anything.</li>
          <li>&mdash; Anything behind a login, a private account or a paywall.</li>
          <li>&mdash; Their revenue, their customer count, or how they are doing.</li>
        </ul>
        <p className="type-sm mt-3 flex items-center gap-1.5 text-muted">
          <Timer size={13} strokeWidth={1.8} aria-hidden />
          One scan per business per week, at <span className="num">
            {creditCost('radar_scan')}
          </span>{' '}
          credits each. A page that will not load is skipped and not charged.
        </p>
      </section>

      <NotRunningNote>
        Nothing is being watched. There is no watch list stored for your workspace and no scan has
        run &mdash; which is why all five slots above are empty rather than showing a business
        Sahoda picked for you. What your own business is goes in the{' '}
        <Link href="/brain" className="font-[550] text-accent underline underline-offset-2">
          Brand Brain
        </Link>
        , and that part works today.
      </NotRunningNote>
    </div>
  )
}
