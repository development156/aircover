import { creditWord } from '@/lib/credit-words'

/**
 * A spending button's label, with its cost in it.
 *
 * UI_RULES_v3 puts the price in the label — `Rewrite · 1 credit` — never in a
 * tooltip, so the user reads what they are about to spend before they commit to
 * spending it.
 *
 * This exists as ONE element on purpose. Written inline, the label is three
 * nodes — text, the number's span, text — and every button here is a `gap-2`
 * inline-flex, which makes all three separate flex items and adds an 8px gap on
 * both sides of the number on top of the spaces already in the markup. The cost
 * ends up visibly adrift from the sentence it belongs to. As one span it is one
 * flex item, and the button's gap goes back to separating the icon from the
 * label, which is the only thing it was ever meant to do.
 */
export interface CostLabelProps {
  /** Verb-first, sentence case: "Plan my week", "Generate site". */
  action: string
  /** Server-owned credit cost. Never hardcoded at the call site. */
  cost: number
}

export function CostLabel({ action, cost }: CostLabelProps) {
  return (
    <span>
      {action} · <span className="tabular-nums">{cost}</span> {creditWord(cost)}
    </span>
  )
}
