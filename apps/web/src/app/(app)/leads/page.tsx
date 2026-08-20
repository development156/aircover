import Link from 'next/link'
import { FileInput, MessageCircle } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertChip, InertField, RoadmapBanner } from '@/components/roadmap/inert'
import { InertColumn, InertPanel, InertRow, NotRunningNote } from '@/components/roadmap/parts'

export const metadata = { title: 'Leads' }

/**
 * LEADS — a pipeline with five real stages and no way in yet.
 *
 * ── THE STAGE NAMES ARE NOT INVENTED, AND THAT IS WHY THEY ARE HERE ──────────
 * `new · contacted · qualified · won · lost` is the CHECK constraint on
 * `leads.status`, applied to production in `20260718000007_sites.sql`. The table
 * exists, it has row-level security and it has never held a row, because nothing
 * writes to it: the public form endpoint that was meant to feed it is not
 * mounted, and Sites renders its contact section formless for that exact reason
 * (a form that discards what you typed is worse than no form).
 *
 * So this screen draws the pipeline it will be — five columns, correctly named —
 * and states the true blocker rather than a date. The interesting thing to a
 * shop owner is not "when"; it is "what has to happen before an enquiry can
 * reach me", and that answer is short and checkable.
 *
 * ── NOT ONE COLUMN CARRIES A COUNT ───────────────────────────────────────────
 * `New 0` reads as "nobody has enquired this week", which is a claim about the
 * reader's business. The true claim is that nothing can enquire yet. Each column
 * says what would land in it instead — see `InertColumn` for the full argument.
 */

const STAGES = [
  { name: 'New', what: 'Somebody left their details and nobody has answered yet.' },
  { name: 'Contacted', what: 'You replied. The clock is now on them.' },
  { name: 'Qualified', what: 'They are real and they want the thing you sell.' },
  { name: 'Won', what: 'They bought, booked or walked in.' },
  { name: 'Lost', what: 'They did not. Worth knowing why, and Sahoda will ask.' },
] as const

export default function LeadsPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Everyone who got in touch, in one list, from first message to whether they bought.">
          Leads
        </PageTitle>
        <div className="flex flex-wrap gap-2">
          <InertButton>Export</InertButton>
          <InertButton primary>Add a lead</InertButton>
        </div>
      </div>

      <RoadmapBanner what="Leads will collect enquiries from your site's forms and your WhatsApp, and track each one to an answer." />

      <div className="flex flex-wrap items-center gap-2">
        <InertField label="Search a name, a number or an email" />
        <InertChip on>All</InertChip>
        <InertChip>Needs a reply</InertChip>
        <InertChip>This week</InertChip>
      </div>

      <section aria-labelledby="leads-pipeline" className="flex flex-col gap-3">
        <h2 id="leads-pipeline" className="type-h2">
          The five places a lead can be
        </h2>
        {/* Five across on a wide screen, two on a tablet, one on a phone. A
            horizontal-scrolling board is the usual answer and it hides the last
            two stages on the device most of these customers use. */}
        <div className="grid gap-2 wide:grid-cols-5 max-wide:grid-cols-2 max-narrow:grid-cols-1">
          {STAGES.map((stage) => (
            <InertColumn key={stage.name} name={stage.name} what={stage.what} />
          ))}
        </div>
      </section>

      <section aria-labelledby="leads-doors" className="flex flex-col gap-3">
        <div>
          <h2 id="leads-doors" className="type-h2">
            How someone gets in
          </h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            Two doors, and neither is open yet. This is the honest reason this screen is empty
            rather than waiting.
          </p>
        </div>

        <div className="grid gap-3 wide:grid-cols-2">
          <InertRow
            icon={FileInput}
            name="A form on your Sahoda site"
            note="Your generated site can carry a contact section. It renders without a form today, because the address that would receive one is not mounted — and a form that quietly drops an enquiry is worse than no form."
          />
          <InertRow
            icon={MessageCircle}
            name="A WhatsApp message"
            note="A message to your business number becomes a lead with the conversation attached. This needs the WhatsApp Business number verified, which is a review queue outside this codebase."
          />
        </div>

        <InertPanel
          title="And then what Sahoda does with it"
          what="A lead is a person waiting, so the useful part is the next move rather than the record."
        >
          <ul className="type-body grid gap-1.5 text-muted">
            <li>&mdash; Tells you it arrived, wherever you are.</li>
            <li>&mdash; Drafts a reply in your voice, grounded in what you sell. You send it.</li>
            <li>&mdash; Keeps the thread, so the next person to look knows what was said.</li>
            <li>&mdash; Asks you why a lost one was lost, and remembers the answer.</li>
          </ul>
        </InertPanel>
      </section>

      <NotRunningNote>
        There are no leads and there is no way to receive one yet. Your{' '}
        <Link href="/sites" className="font-[550] text-accent underline underline-offset-2">
          site
        </Link>{' '}
        can be generated and previewed today, but it is not deployed to an address the public can
        reach, so nothing can submit a form to it.
      </NotRunningNote>
    </div>
  )
}
