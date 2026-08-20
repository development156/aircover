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
 */
export function ContextPane() {
  return (
    <>
      <PaneHeader>
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Customer</h2>
      </PaneHeader>

      <PaneScroll>
        {/* The third of three empty states this screen used to say in three
            different visual languages. Quiet, like the list pane: the loud one
            is the thread pane, because that is the one carrying the reason the
            inbox is empty and the button that fixes it (docs/26 §4.1). */}
        <CardEmpty body="Open something from the list and what Sahoda knows about that person appears here." />
      </PaneScroll>
    </>
  )
}
