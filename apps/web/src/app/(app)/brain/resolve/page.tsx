import Link from 'next/link'
import { BrainCircuit } from 'lucide-react'

import { OriginNote } from '@/components/brain/origin-note'
import { QueueLegend, ResolutionConsole } from '@/components/brain/resolution-console'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { readBrain } from '@/lib/brand/read-brain'
import { readCitedPassages } from '@/lib/knowledge/store'
import { queueTally, resolutionQueue } from '@/lib/brand/resolution-queue'

export const metadata = { title: 'Signal Resolution Console' }

/**
 * THE SIGNAL RESOLUTION CONSOLE.
 *
 * Named in `docs/05_Product_Roadmap_SAHODA_LABS.md` §4 and titled in
 * `docs/sahoda_brand_brain_demo.html`, and until now it existed in neither the
 * code nor the routes — a grep for the name returned the roadmap, the demo and
 * a comment in `packages/mesh/src/tasks/brand-guidelines.ts`, and nothing you
 * could open.
 *
 * ── WHAT IT IS FOR, AND WHY IT IS NOT ONBOARDING ─────────────────────────────
 * Doc 05 attaches the name to onboarding: "Onboarding = Signal Resolution
 * Console". That was true of the reference, where the console WAS the intake
 * wizard — six tabs of blank fields you fill in before anything is resolved.
 * The product went a different way, and better: onboarding asks one question,
 * reads a door, and resolves a whole brain in one pass. So the intake half of
 * the reference is built, shipped, and lives at /onboarding.
 *
 * The half that was never built is the one the name is actually about.
 * `brand_guidelines` returns fifteen fields that are all, at that moment,
 * guesses. `FieldMeta.confirmed` is the difference between a guess and an
 * answer, and it is what the ring counts, what the mesh writes from, and what
 * nothing in the app gave a person a place to work through. /brain shows the
 * fields grouped by section, which is the right shape for reading a brand and
 * the wrong shape for resolving one: the guesses are scattered across five
 * cards and two tabs, in an order that has nothing to do with which of them
 * Sahoda had no business making.
 *
 * This screen is that place. It is a QUEUE, not a form: one list, ordered by
 * entitlement (see `lib/brand/resolution-queue.ts`), where every row states
 * what Sahoda guessed and why it was allowed to, and offers the three things a
 * person can do about it — agree, correct, or empty it.
 *
 * Recorded in `docs/26_Design_System_v4.md` §13 so the name has exactly one
 * owner and doc 05's sentence does not read as describing something else.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────
 * ── WHAT IT SHOWS, AND WHAT IT STILL REFUSES TO ─────────────────────────────
 * This used to read "It shows no per-field evidence, because none is stored and
 * none can be derived". That was true of the only path that existed, and is now
 * true of only one of two.
 *
 * `brand_guidelines` reads the whole door text and writes fifteen fields in one
 * object, so a field it wrote has no traceable source and never will —
 * `lib/brand/brain-origin.ts` carries that argument and it is unchanged.
 *
 * A field proposed from the KNOWLEDGE LIBRARY came through `brand_extract`,
 * which cites a block index that `attachProvenance` resolves against a list
 * Sahoda built. Those fields name their document and quote their passage. Two
 * states, both said out loud, rather than one blanket claim printed above a
 * field that is visibly contradicting it.
 *
 * It never charges:
 * confirming is free, and the paid re-resolve is a link with its cost attached,
 * never a button on this page. And it never pre-selects a row, because a bulk
 * accept that arrives pre-ticked is a rubber stamp wearing a checkbox.
 */
export default async function ResolveConsolePage() {
  const brain = await readBrain()

  if (brain.status === 'no-workspace') {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="Create a workspace to resolve a Brand Brain"
        body="A Brand Brain belongs to a workspace and you don't have one yet. Nothing failed — there is simply nothing to resolve."
        action={<CreateWorkspaceButton variant="primary" />}
      />
    )
  }

  // A first run is not a fault, and it is not an empty queue either. There are
  // no guesses to resolve because there is nothing at all.
  if (brain.status === 'no-brain') {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="There is nothing to resolve yet"
        body="The console is where you settle what Sahoda guessed about your brand. It has not guessed anything yet, because it has not read anything yet."
        action={
          <Link href="/onboarding" className={buttonVariants({ variant: 'primary' })}>
            Set up your Brand Brain
          </Link>
        }
        tip="Sahoda resolves a first draft from a link, a PDF or one sentence. Everything it writes lands here as a guess for you to confirm."
      />
    )
  }

  if (brain.status === 'unreadable') {
    return (
      <div
        role="alert"
        className="type-body rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-danger"
      >
        Could not read your Brand Brain just now — reload to try again. Nothing has changed and
        nothing was charged.
      </div>
    )
  }

  const tally = queueTally(resolutionQueue(brain.active, brain.provenance))

  /**
   * ── THE HALF OF THIS SCREEN THAT USED TO BE IMPOSSIBLE ────────────────────
   * The header above says per-field evidence "is not stored and cannot be
   * derived", and that remains true of every field `brand_guidelines` wrote.
   * A field proposed FROM THE KNOWLEDGE LIBRARY is different: its citation was
   * resolved from a block index against a list Sahoda built, so it names a real
   * document and a real passage.
   *
   * Read in one round trip, keyed by field path. A field with no library
   * citation gets nothing — which is the ordinary case and is not a degraded
   * read. A citation whose read FAILED also gets nothing: a partial citation
   * would be a claim about where a value came from, built from a query that did
   * not answer.
   */
  const sources = Object.entries(brain.meta ?? {}).map(([path, meta]) => ({
    path,
    source: meta?.source,
  }))
  const cited = await readCitedPassages(
    sources.map((entry) => entry.source).filter((s): s is string => typeof s === 'string'),
  )
  const evidence = new Map(
    sources
      .map((entry) => {
        const passage = entry.source ? cited.get(entry.source) : undefined
        return passage ? ([entry.path, passage] as const) : null
      })
      .filter(
        (pair): pair is readonly [string, typeof cited extends Map<string, infer V> ? V : never] =>
          pair !== null,
      ),
  )

  return (
    <div className="flex flex-col gap-grid">
      <OriginNote
        source={brain.source}
        version={brain.version}
        appliedFromLearning={brain.appliedFromLearning}
      />

      {/*
        THE FINDING, stated before the queue.

        `tally.unearned` counts guesses on `asked` fields, and `FieldKindSchema`
        says of that kind: "only they know it. NEVER guessed." So this number is
        not a nag — it is the contract measured against the stored brain, and it
        is the reason the queue is ordered the way it is. It is derived from the
        registry and the provenance map on every render; nothing here is a
        figure no query could produce.
      */}
      {tally.total > 0 ? (
        <section
          className="surface-ring rounded-card bg-surface px-4 py-4"
          aria-labelledby="console-finding"
        >
          <h2 id="console-finding" className="type-h3 text-ink">
            <span className="num">{tally.total}</span> of{' '}
            <span className="num">{tally.registered}</span> fields are still Sahoda&rsquo;s guess
          </h2>
          <p className="type-body mt-1 text-muted">
            {tally.unearned > 0 ? (
              <>
                <span className="num font-[550] text-ink">{tally.unearned}</span> of them are things
                only you can actually know — what your customers fear, what Sahoda must never say,
                what you promise. Those come first in the list below, because a guess there is worth
                the least.
              </>
            ) : (
              <>
                What is left are the fields Sahoda is meant to draft — how you sound, how formal to
                be, which phrases are yours. Keep them or say them differently.
              </>
            )}
          </p>
          <div className="mt-3">
            <QueueLegend unearned={tally.unearned} proposed={tally.proposed} />
          </div>
        </section>
      ) : null}

      <ResolutionConsole payload={brain.active} provenance={brain.provenance} evidence={evidence} />

      {/*
        THE PAID PATH, as a link with its price attached and never as a button
        beside the free ones. docs/26 §1.5 allows one primary per view and it is
        the bulk accept; more to the point, a re-resolve rewrites every field
        including the ones just confirmed, so it is the opposite of what someone
        working through this queue is trying to do.
      */}
      <p className="type-sm text-muted">
        Confirming and correcting on this page is free and never calls a model.{' '}
        <Link
          href="/onboarding"
          className="font-semibold text-accent underline-offset-2 hover:underline"
        >
          Re-running the whole resolve
        </Link>{' '}
        is a separate, paid action that rewrites all {tally.registered} fields — including every one
        you have already confirmed.
      </p>
    </div>
  )
}
