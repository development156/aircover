import Link from 'next/link'
import { BrainCircuit } from 'lucide-react'

import { BrainHeader } from '@/components/brain/brain-header'
import { DerivedCard } from '@/components/brain/derived-card'
import { ConfidenceCard } from '@/components/brain/confidence-card'
import { SectionsList } from '@/components/brain/sections-list'
import { BRAIN_SECTIONS } from '@/lib/brand/fields'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { readBrain } from '@/lib/brand/read-brain'

export const metadata = { title: 'Brand Brain' }

/**
 * A link wearing the button's clothes. `<Button asChild>` is not the route for
 * this — Button always renders a loading slot beside its children, so Radix's
 * Slot receives two and throws (see the note in ui/button.tsx).
 */
function OnboardingLink({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/onboarding" className={buttonVariants({ variant: 'primary' })}>
      {children}
    </Link>
  )
}

/**
 * The Brand Brain's home — every field, what kind it is, where it came from, and
 * whether a person has confirmed it.
 *
 * Until now this existed only as step 3 of onboarding, which meant the core of
 * the product was reachable exactly once and never again. Nothing here charges
 * credits: editing a field writes one `manual` version through the RPC, and the
 * only paid path (a full re-resolve) lives on /onboarding behind its own cost
 * label.
 */
export default async function BrainPage() {
  const brain = await readBrain()

  if (brain.status === 'no-workspace') {
    return (
      <div className="space-y-grid">
        <EmptyState
          icon={BrainCircuit}
          title="Create a workspace to build a Brand Brain"
          body="A Brand Brain belongs to a workspace and you don't have one yet. Nothing failed — there is simply no brain to show."
          action={<CreateWorkspaceButton variant="primary" />}
        />
      </div>
    )
  }

  // A workspace with no brain is a first run, not a fault. The remedy is the
  // resolve, and it stays the page's one action.
  //
  // The note that used to sit here said rendering empty cards "at 0/15 would
  // claim a brain exists and is blank". That is right about a TALLY and only
  // about a tally, so the structure below carries none: no ring, no percentage,
  // no n/n. What it does carry is the list of sections, which is the reference's
  // own "Sections" container and the answer to the question a first run actually
  // has — what is a Brand Brain made of? Replacing that with one sentence left
  // the most important screen in the product describing itself in the abstract.
  if (brain.status === 'no-brain') {
    return (
      <div className="space-y-grid">
        <EmptyState
          icon={BrainCircuit}
          title="Sahoda doesn't know your brand yet"
          body="The Brand Brain is what every caption, campaign and reply is written from. Give Sahoda a spark and it will resolve a first draft you can correct."
          action={<OnboardingLink>Set up your Brand Brain</OnboardingLink>}
          tip="You approve and correct what it resolves — you never start from a blank form."
        />

        <section className="surface-ring rounded-card bg-surface" aria-labelledby="brain-will-hold">
          <header className="flex min-h-[46px] items-center border-b border-line-soft px-4 py-3">
            <h2 id="brain-will-hold" className="text-[14px] font-semibold tracking-[-0.01em]">
              Sections
            </h2>
          </header>
          <ul>
            {BRAIN_SECTIONS.map((section) => (
              <li
                key={section.key}
                className="flex items-baseline justify-between gap-4 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{section.title}</p>
                  <p className="mt-[1px] text-[12.5px] text-muted">{section.blurb}</p>
                </div>
                {/* No percentage and no n/n. There is no brain to measure. */}
                <span className="shrink-0 text-[13px] text-muted">&mdash;</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    )
  }

  if (brain.status === 'unreadable') {
    return (
      <div className="space-y-grid">
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          Could not read your Brand Brain just now — reload to try again. Nothing has changed and
          nothing was charged.
        </div>
      </div>
    )
  }

  return (
    // The reference's `.split` — a lead card and a navigable list on the left,
    // a narrower aside on the right. Replaces a flat 2-column grid of five
    // equal cards, which gave no reading order and no way to see which part of
    // the brand was least settled.
    <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-grid max-wide:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-grid">
        <ConfidenceCard provenance={brain.provenance} />
        <SectionsList provenance={brain.provenance} />
      </div>

      <aside className="flex flex-col gap-grid">
        {/* The single most useful thing to do next. It was the second half of
            BrainHeader; here it becomes the aside's lead, which is where the
            reference puts its own "suggested improvement". */}
        <BrainHeader provenance={brain.provenance} version={brain.version} />
        <DerivedCard alignment={brain.active.alignment} provenance={brain.provenance} />
      </aside>
    </div>
  )
}
