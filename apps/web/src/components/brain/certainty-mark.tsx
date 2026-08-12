import type { FieldState } from '@/lib/brand/provenance'
import { cn } from '@/lib/utils'

/**
 * A field's certainty, as the Certainty System's own vocabulary.
 *
 * Two of the four levels, chosen rather than invented (UI_RULES_v3 forbids a
 * fifth treatment):
 *
 *   confirmed -> `.is-real`      solid fill. A person wrote this. It happened.
 *   guessed   -> `.is-proposed`  dashed. Sahoda suggests it; provisional.
 *
 * The rules' own sentence for this transition is "approving a proposed item turns
 * the dash solid", which is exactly what confirming a field does.
 *
 * `.is-committed` and `.is-simulated` are deliberately unused here.
 * `.is-committed` means "you approved it; it WILL happen" — a claim about the
 * future, which a brand fact is not. `.is-simulated` asserts a thing is NOT real,
 * and a model's guess about your voice is a weak claim, not a false one.
 */
const MARKS: Record<FieldState, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'is-real' },
  guessed: { label: 'Guess', className: 'is-proposed' },
}

export function CertaintyMark({ state, className }: { state: FieldState; className?: string }) {
  const mark = MARKS[state]
  return (
    <span
      data-certainty={state === 'confirmed' ? 'real' : 'proposed'}
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2 py-[2px] text-[11.5px] leading-[16px] font-semibold',
        mark.className,
        className,
      )}
    >
      {mark.label}
    </span>
  )
}

/**
 * The value's own container echoes the chip: dashed while it is a guess, solid
 * once a person has confirmed it. Same structural signal at a second scale, so
 * the state is legible while scanning without reading a single chip.
 */
export function valueBoxClass(state: FieldState): string {
  return state === 'confirmed'
    ? 'border border-solid border-line-firm bg-bg'
    : 'border border-dashed border-line-firm bg-transparent'
}
