import Link from 'next/link'
import {
  ArrowRight,
  CalendarHeart,
  MessageSquareQuote,
  PackagePlus,
  Rss,
  TrendingDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertChip, InertField, RoadmapBanner } from '@/components/roadmap/inert'
import { InertToggle, NotRunningNote } from '@/components/roadmap/parts'
import { creditWord } from '@/lib/credit-words'

export const metadata = { title: 'Playbooks' }

/**
 * PLAYBOOKS — recipes, and deliberately not a canvas.
 *
 * ── THE DECISION THIS SCREEN IS THE RESULT OF ────────────────────────────────
 * PRD §5.3 removed the node-based workflow canvas from v1 and replaced it with
 * this. The reasoning is in the doc and it is worth keeping in the code, because
 * a canvas is what every session's instinct reaches for when it reads
 * "automation": people running one shop do not build directed graphs, the canvas
 * competes with Zapier and n8n at high build cost, and the projected Starter-tier
 * usage was near zero. Five recipes with two or three fields each deliver most
 * of the value at a small fraction of the cost.
 *
 * So this screen is a LIBRARY, not an editor. There is no canvas, no node, no
 * connector and no dry-run console anywhere in it, and if a future session is
 * tempted to add one, the reason it was cut is above.
 *
 * ── EACH CARD SHOWS THE THREE THINGS A RECIPE IS ─────────────────────────────
 * What sets it off, what it makes, and where the result lands. The third is the
 * one most automation UIs omit and the one that matters most here: a Playbook
 * obeys the Autonomy Dial like everything else. It creates drafts and approval
 * requests. It never publishes around your setting, and saying so on the card is
 * cheaper than a support ticket.
 *
 * ── FIGURES ──────────────────────────────────────────────────────────────────
 * The credit price comes from pricing.config.json, which is a published fact
 * about Sahoda. Nothing else numeric appears: no run counts, no "used by 400
 * businesses", no last-run timestamps. There have been no runs.
 */

const PLAYBOOKS: ReadonlyArray<{
  icon: LucideIcon
  name: string
  when: string
  makes: string
  lands: string
  fields: readonly string[]
  group: string
}> = [
  {
    icon: Rss,
    name: 'New article, new post',
    when: 'Something new appears on a feed you follow — your own blog, an industry site.',
    makes: 'A short post in your voice, with your take rather than a summary.',
    lands: 'Your Planner as a draft.',
    fields: ['Feed address', 'How often to check', 'Which channels'],
    group: 'Content',
  },
  {
    icon: PackagePlus,
    name: 'New product, small campaign',
    when: 'You add a product, or a form on your site tells Sahoda one has landed.',
    makes: 'A three-post run: the tease, the launch, the reminder.',
    lands: 'A campaign, with the three posts grouped under it.',
    fields: ['What counts as a launch', 'How many days to spread it over'],
    group: 'Commerce',
  },
  {
    icon: MessageSquareQuote,
    name: 'New review, reply ready',
    when: 'A review arrives on Google Business Profile.',
    makes: 'A reply written for that review, in your voice, never sent on its own.',
    lands: 'Your Inbox, as a draft reply you approve.',
    fields: ['Which ratings to draft for'],
    group: 'Reviews',
  },
  {
    icon: CalendarHeart,
    name: 'The festival calendar',
    when: 'A festival or holiday your customers keep is coming up.',
    makes: 'A suggestion a few days ahead, tied to what you actually sell.',
    lands: 'Your Planner as a brief, early enough to change your mind.',
    fields: ['Which calendars', 'How many days of warning'],
    group: 'Calendar',
  },
  {
    icon: TrendingDown,
    name: 'A quiet post, remade',
    when: 'A post does clearly worse than your own recent average.',
    makes: 'A handful of different angles on the same idea, through Remix.',
    lands: 'Your Planner as drafts, for you to pick from.',
    fields: ['How far below average counts'],
    group: 'Content',
  },
]

const GROUPS = ['All', 'Content', 'Reviews', 'Calendar', 'Commerce'] as const

export default function PlaybooksPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Small standing instructions: when this happens, write that. You fill in a few blanks and turn it on.">
          Playbooks
        </PageTitle>
        <InertButton primary>Suggest a playbook</InertButton>
      </div>

      <RoadmapBanner what="A playbook watches for one thing and drafts one thing — no wiring, no canvas, a few fields each." />

      {/* Chips keep their names and drop their counts: a count would claim a
          collection of the reader's enabled playbooks exists and is empty. */}
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((group, index) => (
          <InertChip key={group} on={index === 0}>
            {group}
          </InertChip>
        ))}
      </div>

      <ul className="grid gap-3 wide:grid-cols-2">
        {PLAYBOOKS.map((book) => (
          <li key={book.name} className="is-proposed flex flex-col gap-3 rounded-card p-4">
            <div className="flex items-start gap-3">
              <book.icon
                size={17}
                strokeWidth={1.8}
                aria-hidden
                className="mt-[3px] shrink-0 text-muted"
              />
              <div className="min-w-0 flex-1">
                <h2 className="type-h3 text-ink">{book.name}</h2>
                <p className="type-eyebrow mt-1 text-muted">{book.group}</p>
              </div>
              <InertToggle label="Off" />
            </div>

            {/* The three things a recipe is, as a definition list — the labels
                are the structure, and they are the same three on every card so
                the set can be compared by scanning one column. */}
            <dl className="grid gap-2">
              <div className="flex gap-2">
                <dt className="type-eyebrow w-[52px] shrink-0 pt-[3px] text-muted">When</dt>
                <dd className="type-sm min-w-0 text-muted">{book.when}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="type-eyebrow w-[52px] shrink-0 pt-[3px] text-muted">Makes</dt>
                <dd className="type-sm min-w-0 text-muted">{book.makes}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="type-eyebrow w-[52px] shrink-0 pt-[3px] text-muted">Lands in</dt>
                <dd className="type-sm min-w-0 text-muted">{book.lands}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              {book.fields.map((field) => (
                <InertField key={field} label={field} />
              ))}
            </div>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="playbooks-rules"
        className="surface-ring rounded-card bg-surface p-4"
      >
        <h2 id="playbooks-rules" className="type-h3">
          Two rules that will not change
        </h2>
        <ul className="mt-2 grid gap-2">
          <li className="type-body flex gap-2 text-muted">
            <ArrowRight size={15} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0" />
            <span>
              A playbook never publishes around your{' '}
              <Link href="/loop" className="font-[550] text-accent underline underline-offset-2">
                autonomy setting
              </Link>
              . It makes drafts and approval requests, and your dial decides what happens to them.
            </span>
          </li>
          <li className="type-body flex gap-2 text-muted">
            <ArrowRight size={15} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0" />
            <span>
              Every run is written down &mdash; what set it off, what it made, and what it cost. A
              run costs <span className="num">{creditCost('playbook_run')}</span>{' '}
              {creditWord(creditCost('playbook_run'))}, plus whatever the thing it writes costs on
              its own.
            </span>
          </li>
        </ul>
      </section>

      <NotRunningNote>
        None of these is running. There is no playbook stored for your workspace, nothing is
        watching a feed or a review, and the switch on each card is a picture of a switch.
      </NotRunningNote>
    </div>
  )
}
