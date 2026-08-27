'use client'

import { useId, useState } from 'react'
import { Eraser, Redo2, Smile, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { TextHistory } from '@/lib/posts/use-text-history'

import { GlyphPanel } from './glyph-panel'

export interface CopyToolsProps {
  /**
   * The box these act on, named the way a person would say it: "Instagram copy",
   * "your post". Five of these sit on one screen at once, so it is what keeps
   * twenty identically-shaped buttons distinguishable to a screen reader.
   */
  target: string
  history: TextHistory
  /** False when there is nothing in the box, so Clear is not offered on empty. */
  canClear: boolean
  onClear: () => void
  onInsert: (glyph: string) => void
}

/**
 * THE TOOLS THAT CHANGE YOUR WORDS, DIRECTLY UNDER THE BOX THEY CHANGE.
 *
 * ── THE ARRANGEMENT IS THE POINT ─────────────────────────────────────────────
 * Undo, redo, clear and insert do one thing in common and it is the only thing
 * that matters for where they live: they edit the text, immediately, and nothing
 * they do reaches the server. Every one of them is reversible by the two buttons
 * sitting beside it.
 *
 * Save is the opposite of all four. It is the only control on the card that
 * writes to the row, the only one that can fail, and the only one that cannot be
 * undone from here. So it does not live in this group: it stays at the foot of
 * the card, larger, on its own. That split is the answer to "arrange the buttons
 * by what they do" — not a toolbar of everything, which makes Save one icon
 * among six and gives the irreversible action the same weight as the reversible
 * ones.
 *
 * ── WHY THE PICKER IS A BUTTON AND NOT A <details> ───────────────────────────
 * It was a `<details>` first, and the screenshots settled it. MEASURED at 1440:
 * the summary rendered as a **full-width 40px bar** on every card, so each
 * version card carried TWO of them — this one and "More settings" — stacked with
 * the meter and the hashtag field, and the lightest control in the group was
 * drawn as the heaviest object in it. At 390 the same summary measured **40px
 * tall against the product's 44px touch floor**, which `<Button>` clears by
 * construction and a `<summary>` does not.
 *
 * A button with `aria-expanded` and `aria-controls` is not the popover machinery
 * a `<details>` was chosen to avoid — no portal, no positioning maths, no focus
 * trap, no outside-click listener. The panel simply renders below the row. What
 * it buys is that the control sits IN the row with the other three, which is
 * where the grouping above says it belongs.
 *
 * ── CLEAR IS NOT GUARDED BY A DIALOG, AND THAT IS DELIBERATE ─────────────────
 * "Are you sure?" charges every correct use for the rare wrong one. Undo is the
 * real answer: clearing pushes one step, the Undo button beside it lights up the
 * instant the box empties, and the words come back whole with the caret where it
 * was. A confirm dialog on an action with a working undo is a dialog nobody
 * reads.
 *
 * It also does NOT put the channel back to following the post. `use-variants` is
 * explicit about this: an emptied channel is a deliberate choice, and refilling
 * it from the post on the next keystroke elsewhere would undo it silently.
 * Relink is how a writer asks for that back, on purpose.
 *
 * ── AND THE PICKER STAYS OPEN AFTER AN INSERT ────────────────────────────────
 * Writers add two or three at a time. One that closed on every click would make
 * the second cost as much as the first.
 */
export function CopyTools({ target, history, canClear, onClear, onInsert }: CopyToolsProps) {
  const [picking, setPicking] = useState(false)
  const panelId = useId()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Undo the last change to ${target}`}
          disabled={history.undo === null}
          onClick={() => history.undo?.()}
        >
          <Undo2 aria-hidden />
          Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Redo the last undone change to ${target}`}
          disabled={history.redo === null}
          onClick={() => history.redo?.()}
        >
          <Redo2 aria-hidden />
          Redo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Clear ${target}`}
          disabled={!canClear}
          onClick={onClear}
        >
          <Eraser aria-hidden />
          Clear
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Add an emoji or symbol to ${target}`}
          aria-expanded={picking}
          aria-controls={panelId}
          onClick={() => setPicking((open) => !open)}
        >
          <Smile aria-hidden />
          Emoji
        </Button>
      </div>

      {picking ? <GlyphPanel id={panelId} target={target} onInsert={onInsert} /> : null}
    </div>
  )
}
