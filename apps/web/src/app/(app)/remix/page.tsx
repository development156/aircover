import Link from 'next/link'
import {
  FileText,
  Film,
  Images,
  Link2,
  Mail,
  MessageCircle,
  Newspaper,
  SquarePen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertField, RoadmapBanner } from '@/components/roadmap/inert'
import { NotRunningNote } from '@/components/roadmap/parts'
import { creditWord } from '@/lib/credit-words'

export const metadata = { title: 'Remix' }

/**
 * REMIX — one thing you already made, turned into everything else.
 *
 * ── THE LAYOUT IS THE ARGUMENT ───────────────────────────────────────────────
 * The whole feature is a one-to-many, so the screen is drawn as one: a single
 * source block at the top, then a fan of outputs below it. A grid of equal cards
 * would say "here are seven features"; a source above a fan says "these seven
 * all come from that one", which is the thing a reader has to understand before
 * the feature makes sense to them.
 *
 * ── EACH OUTPUT NAMES ITS COUNT ONLY WHERE THE SPEC FIXES ONE ────────────────
 * FSD M3.3 fixes some of these — "3–8 posts", "2–10 slides" — and those are
 * facts about what Sahoda produces, in the same class as a price. What is NOT
 * shown anywhere is a figure about the reader: no "you have 12 posts to remix",
 * no predicted performance on any derivative, no source library count. Nothing
 * has been remixed.
 *
 * ── AND THE ATTRIBUTION LINE IS NOT DECORATION ───────────────────────────────
 * Remix takes someone's long-form work as input, sometimes the customer's own
 * and sometimes not. The spec stores source attribution on every derivative.
 * Saying so on the screen, before anyone pastes anything, is the difference
 * between a repurposing tool and a plagiarism machine.
 */

const OUTPUTS: ReadonlyArray<{ icon: LucideIcon; name: string; what: string }> = [
  {
    icon: SquarePen,
    name: 'Three to eight posts',
    what: 'Each takes one idea from the source and says it on its own, per channel.',
  },
  {
    icon: Images,
    name: 'A carousel outline',
    what: 'The argument, split across slides, in an order that holds attention.',
  },
  {
    icon: Film,
    name: 'A reel script',
    what: 'Timed beats — what is said, what is shown, and how long each takes.',
  },
  {
    icon: Mail,
    name: 'An email',
    what: 'A subject line and a body, written to be opened rather than admired.',
  },
  {
    icon: Newspaper,
    name: 'A blog outline',
    what: 'Headings and the point each one makes, ready for the SEO writer.',
  },
  {
    icon: MessageCircle,
    name: 'A WhatsApp broadcast',
    what: 'Short, and written to be read on a lock screen.',
  },
]

export default function RemixPage() {
  return (
    <div className="space-y-grid">
      <PageTitle sub="Paste one good thing you already wrote, and get a week of posts out of it.">
        Remix
      </PageTitle>

      <RoadmapBanner what="Remix will take one long piece — an article, a video, a talk — and write the shorter things that carry it." />

      {/* THE SOURCE. One block, full width, above everything, because there is
          exactly one of it and everything below descends from it. */}
      <section aria-labelledby="remix-source" className="is-proposed rounded-card p-4">
        <h2 id="remix-source" className="type-h3 text-ink">
          Start with one thing
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          An address, or the text itself. A blog post, a YouTube video, a talk you gave, a long post
          that did well &mdash; anything with more in it than one caption can hold.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link2 size={15} strokeWidth={1.8} aria-hidden className="shrink-0 text-muted" />
          <InertField label="Paste an address, or the words themselves" />
          <InertButton primary>Remix it</InertButton>
        </div>
      </section>

      {/* The fan. A single row of a downward mark would be decoration; the
          heading says the relationship in words instead. */}
      <section aria-labelledby="remix-outputs" className="flex flex-col gap-3">
        <div>
          <h2 id="remix-outputs" className="type-h2">
            And get all of these from it
          </h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            Every one written in your voice from your Brand Brain, not summarised. You keep the ones
            you want and throw the rest away before anything is saved.
          </p>
        </div>

        <ul className="grid gap-2 wide:grid-cols-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
          {OUTPUTS.map((output) => (
            <li
              key={output.name}
              data-inert-control
              className="is-proposed flex flex-col gap-1.5 rounded-card p-3 select-none"
            >
              <output.icon size={16} strokeWidth={1.8} aria-hidden className="text-muted" />
              <span className="type-h3 text-ink">{output.name}</span>
              <span className="type-sm text-muted">{output.what}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="remix-terms" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="remix-terms" className="type-h3">
          Two things about how this works
        </h2>
        <ul className="type-body mt-2 grid gap-2 text-muted">
          <li className="flex gap-2">
            <FileText size={15} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0" />
            <span>
              Where it came from is stored on every piece. If the source was somebody else&rsquo;s
              work, that stays attached to the derivative rather than being quietly lost.
            </span>
          </li>
          <li className="flex gap-2">
            <SquarePen size={15} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0" />
            <span>
              One price for the whole batch &mdash;{' '}
              <span className="num">{creditCost('remix_pack')}</span>{' '}
              {creditWord(creditCost('remix_pack'))} &mdash; and you see everything before anything
              is saved. Discarding a piece costs nothing extra and refunds nothing; the writing has
              already happened.
            </span>
          </li>
        </ul>
      </section>

      <NotRunningNote>
        Nothing can be remixed yet. The field above does not accept an address, and no batch has
        been produced for your workspace. Writing a post from scratch works today in{' '}
        <Link href="/create/post" className="font-[550] text-accent underline underline-offset-2">
          the composer
        </Link>
        .
      </NotRunningNote>
    </div>
  )
}
