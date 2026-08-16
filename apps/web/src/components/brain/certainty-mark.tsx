import { Check, Sparkles } from 'lucide-react'

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
 *
 * ── WHY THERE IS NOW A GLYPH ─────────────────────────────────────────────────
 * This distinction is the one thing the reference design cannot express — it has
 * no concept of a field a human approved versus one a model inferred — so it has
 * to survive the port intact and stay legible at a glance.
 *
 * Fill weight alone (solid vs dashed) already survives greyscale. The glyph is
 * the second independent channel, matching the status ladder's rule that any ONE
 * signal is enough: a CHECK means a person checked it; the SPARKLE is the
 * reference's own mark for "the AI did this" (`.ai-mark`). So confirmed and
 * inferred differ by fill, by glyph AND by label — never by hue, which this
 * palette could not carry anyway.
 */
const MARKS: Record<
  FieldState,
  { label: string; className: string; Glyph: typeof Check; title: string }
> = {
  confirmed: {
    label: 'Confirmed',
    className: 'is-real',
    Glyph: Check,
    title: 'A person confirmed this value.',
  },
  guessed: {
    label: 'Guess',
    className: 'is-proposed',
    Glyph: Sparkles,
    title: 'Sahoda inferred this. Nobody has confirmed it yet.',
  },
}

export function CertaintyMark({ state, className }: { state: FieldState; className?: string }) {
  const mark = MARKS[state]
  return (
    <span
      data-certainty={state === 'confirmed' ? 'real' : 'proposed'}
      title={mark.title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-sm px-[7px] py-[2px] text-[11px] leading-[16px] font-semibold',
        mark.className,
        className,
      )}
    >
      {/* Decorative: the label beside it says the same thing in words, so a
          screen reader hearing both would hear the state twice. */}
      <mark.Glyph className="size-[11px] shrink-0" aria-hidden />
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
    ? 'border border-solid border-line-firm bg-surface'
    : 'border border-dashed border-line-firm bg-transparent'
}
