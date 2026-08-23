import { CardEmpty } from '@/components/empty-state'
import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'

/**
 * The customer context pane (reference `.inbox__col--ctx`).
 *
 * ── WHAT THE REFERENCE PUTS HERE, AND WHY MOST OF IT IS NOT BUILT ────────────
 * The reference shows: an order count, lifetime spend, an AI summary of the
 * customer, a suggested reply, a list of previous conversations, and an internal
 * notes field. In this product NONE of those has a data source. There is no
 * orders table, no spend record, no CRM history and no notes store, and the
 * summary and suggested reply are model output this pass may not generate.
 *
 * Rendering them with zeroes would be the worst available option: "Orders 0 ·
 * Lifetime ₹0" is not an empty state, it is a false statement about a customer
 * who may well have ordered ten times. So the pane keeps its STRUCTURE and its
 * header — the layout is the thing being ported — and says nothing it cannot
 * back.
 *
 * ── AND IT STAYS QUIET ───────────────────────────────────────────────────────
 * An earlier pass listed the four missing things as dashed cards. On a screen
 * where the list and the thread are both empty that made the CONTEXT pane the
 * loudest element — the least important column drawing the most attention, on
 * the one screen where the user needs to look at the other two. A single line
 * is the correct weight for a pane describing a person nobody has selected.
 *
 * The pane hides entirely below 1180px, exactly as the reference does: at that
 * width the list and the thread are what matter, and context is the first thing
 * the reference drops.
 *
 * The copy says "something from the list", not "a conversation": this same pane
 * serves messages, comments AND reviews, and naming one of the three made it
 * wrong on the other two.
 *
 * ── AND IT SAYS NOTHING WHEN THERE IS NOTHING TO OPEN ────────────────────────
 * "Open something from the list" is an instruction that cannot be followed when
 * the list is provably empty, and it was the THIRD pane announcing nothing on
 * the one screen every new workspace sees (QA #21). The pane keeps its header —
 * the structure is the thing being ported — and drops the line.
 */
export function ContextPane({
  hasSomethingToOpen = true,
}: {
  /** False only when the list beside this pane is provably empty. */
  hasSomethingToOpen?: boolean
}) {
  return (
    <>
      <PaneHeader>
        <h2 className="type-h3">Customer</h2>
      </PaneHeader>

      <PaneScroll className="p-3">
        {/* The third of three empty states this screen used to say in three
            different visual languages. Quiet, like the list pane: the loud one
            is the thread pane, because that is the one carrying the reason the
            inbox is empty and the button that fixes it (docs/26 §4.1). */}
        {hasSomethingToOpen ? (
          <CardEmpty body="Open something from the list and what Sahoda knows about that person appears here." />
        ) : (
          /**
           * ── A TITLED VOID IS NOT RESTRAINT ────────────────────────────────
           * This branch rendered `null`, for a reason that was right as far as
           * it went: "Open something from the list" is a remedy nobody can carry
           * out when the list is provably empty, and it made this the THIRD pane
           * announcing nothing.
           *
           * MEASURED at 1440 on a workspace with no connection: the result was a
           * 292x740 column carrying the word "Customer" and not one other mark.
           * A pane that makes a promise in its header and then delivers a void
           * reads as a render that failed, and it was the largest single area of
           * dead space in the product.
           *
           * The third option neither branch took: say what the pane is FOR. This
           * sentence is in the future tense and its subject is Sahoda, so it is
           * not an instruction that cannot be followed, not a claim that the
           * workspace has nothing, and — the line this pane exists to hold — not
           * a statement about a customer. "Orders 0 · Lifetime ₹0" is refused
           * here for the same reason it always was.
           *
           * `type-meta text-muted`, top-aligned, not a `CardEmpty`: the weight
           * is what stopped it competing, and the weight is kept.
           *
           * AND IT IS A DESCRIPTION, NOT AN INSTRUCTION. The first draft of this
           * read "Open something from the list and what Sahoda knows about that
           * person shows here", and `context-pane.test.tsx` refused it — rightly.
           * An imperative is an instruction whatever tense follows it, and this
           * branch runs precisely when the list is provably empty, so "open
           * something from the list" is a remedy nobody can carry out. The test
           * was NOT loosened to admit the sentence; the sentence changed.
           *
           * "a person", not "the sender": this same pane serves messages,
           * comments AND reviews, and naming one of the three makes it wrong on
           * the other two.
           */
          <p className="type-meta text-muted">
            What Sahoda knows about a person appears in this column, once there is something here to
            open.
          </p>
        )}
      </PaneScroll>
    </>
  )
}
