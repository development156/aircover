import Link from 'next/link'
import { FileSpreadsheet, FileText, Globe, ScrollText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { InertButton, InertField, RoadmapBanner } from '@/components/roadmap/inert'
import { InertPanel, NotRunningNote } from '@/components/roadmap/parts'
import { DataTable } from '@/components/ui/data-table'

export const metadata = { title: 'Knowledge' }

/**
 * THE KNOWLEDGE LIBRARY — the facts a caption may quote, and where each came from.
 *
 * ── WHAT THIS IS FOR, AND WHY THE BRAND BRAIN IS NOT ENOUGH ──────────────────
 * The Brand Brain holds how the business SOUNDS and what it stands for. It does
 * not hold what a dosa costs, whether the clinic is open on Sunday, or what the
 * returns policy says. Those are the facts a customer actually asks about, and
 * they are exactly the facts a model will cheerfully make up if a post needs
 * one. The library is the store those come from, so a generated line can be
 * checked against a document instead of trusted.
 *
 * ── THE PROVENANCE COLUMN IS THE POINT OF THE WHOLE SCREEN ───────────────────
 * A fact with no source is the same thing as an invented fact that happens to be
 * right — you cannot tell them apart when it matters. So the table is built
 * around "where it came from" rather than around the fact itself, and there is
 * no free-text "notes" field anywhere: an untraceable note is how a wrong price
 * gets published under a real business's name.
 *
 * ── THERE IS NO TABLE BEHIND THIS, AND THAT IS SAID PLAINLY BELOW ────────────
 * Nothing in the schema stores a document, a fact, or a citation. That is not a
 * missing read; it is a missing store, and this screen names it rather than
 * rendering a search box over nothing. `DataTable` keeps its columns visible
 * while empty, which is exactly what a roadmap table needs: the headers are a
 * promise about Sahoda, and a figure in a cell would be a claim about the reader.
 */

const SOURCES: ReadonlyArray<{ icon: LucideIcon; name: string; what: string }> = [
  {
    icon: Globe,
    name: 'Your website',
    what: 'Re-read on a schedule, so a price you changed on the site stops being wrong here.',
  },
  {
    icon: FileText,
    name: 'A document you upload',
    what: 'A menu, a rate card, a policy, a brochure. PDF or image.',
  },
  {
    icon: FileSpreadsheet,
    name: 'A list you paste',
    what: 'Products and prices, opening hours, service areas — the things that change most.',
  },
  {
    icon: ScrollText,
    name: 'An answer you typed',
    what: 'A question customers keep asking, and the reply you would give.',
  },
]

export default function BrainKnowledgePage() {
  return (
    <div className="space-y-grid">
      <RoadmapBanner what="The Knowledge Library will hold the facts about your business that a post is allowed to state — each one with a source." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <InertField label="Search a fact, a price or a document" />
        <div className="flex flex-wrap gap-2">
          <InertButton>Add a fact</InertButton>
          <InertButton primary>Upload a document</InertButton>
        </div>
      </div>

      <DataTable
        caption="What Sahoda may state about your business, and where each fact came from"
        columns={[
          { key: 'fact', header: 'Fact' },
          { key: 'kind', header: 'Kind' },
          { key: 'source', header: 'Where it came from' },
          { key: 'checked', header: 'Last checked' },
        ]}
        rows={[]}
        empty="Nothing is stored yet. There is no library behind this screen — see below."
      />

      <section aria-labelledby="knowledge-sources" className="flex flex-col gap-3">
        <div>
          <h2 id="knowledge-sources" className="type-h2">
            Four ways a fact gets in
          </h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            Every one of them records where the fact came from and when it was last confirmed. A
            fact with no source is not stored.
          </p>
        </div>
        <div className="grid gap-2 wide:grid-cols-2">
          {SOURCES.map((source) => (
            <div
              key={source.name}
              data-inert-control
              className="is-proposed flex items-start gap-3 rounded-card p-3 select-none"
            >
              <source.icon
                size={16}
                strokeWidth={1.8}
                aria-hidden
                className="mt-[2px] shrink-0 text-muted"
              />
              <span className="min-w-0">
                <span className="type-h3 block text-ink">{source.name}</span>
                <span className="type-sm block text-muted">{source.what}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <InertPanel
        title="What it changes about what Sahoda writes"
        what="A library is only worth having if it constrains the writing. It does, in three ways."
      >
        <ul className="type-body grid gap-1.5 text-muted">
          <li>
            &mdash; A post that names a price, an opening time or a policy uses the stored one, or
            it does not name it.
          </li>
          <li>
            &mdash; A fact that has gone stale is flagged before it is used, not after it is
            published.
          </li>
          <li>
            &mdash; Nothing in the library is shared between workspaces, ever. It is your business,
            not training data.
          </li>
        </ul>
      </InertPanel>

      <NotRunningNote>
        Nothing is stored and nothing can be. This is a missing store rather than a missing screen:
        no table in the database holds a document, a fact or a citation, so the search box above
        would have nothing to search. What Sahoda does know about your brand today &mdash; voice,
        persona, promise, red lines &mdash; is on{' '}
        <Link href="/brain" className="font-[550] text-accent underline underline-offset-2">
          the overview
        </Link>
        .
      </NotRunningNote>
    </div>
  )
}
