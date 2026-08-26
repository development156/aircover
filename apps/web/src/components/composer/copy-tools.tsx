'use client'

import { Eraser, Redo2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { TextHistory } from '@/lib/posts/use-text-history'

import { GlyphPicker } from './glyph-picker'

export interface CopyToolsProps {
  /**
   * The box these act on, named the way a person would say it: "Instagram copy",
   * "your post". Four of these sit on one screen at once, so it is what keeps
   * eight identically-shaped buttons distinguishable to a screen reader.
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
 * writes to the row, it is the only one that can fail, and it is the only one
 * that cannot be undone from here. So it does not live in this group — it stays
 * at the foot of the card, larger, on its own.
 *
 * That split is the answer to "arrange the buttons by what they do". Not a
 * toolbar of everything, which makes Save one icon among six and makes the
 * irreversible action the same size as the reversible ones.
 *
 * ── CLEAR IS NOT GUARDED BY A DIALOG, AND THAT IS DELIBERATE ─────────────────
 * "Are you sure?" is the cheap answer, and it charges every correct use for the
 * rare wrong one. Undo is the real answer: clearing pushes one step, the Undo
 * button beside it lights up the instant the box empties, and the words come
 * back whole with the caret where it was. A confirm dialog on an action with a
 * working undo is a dialog nobody reads.
 *
 * It also does NOT put the channel back to following the post. `use-variants`
 * is explicit about this: an emptied channel is a deliberate choice, and
 * refilling it from the post on the next keystroke elsewhere would undo it
 * silently. Relink is how a writer asks for that back, on purpose.
 */
export function CopyTools({ target, history, canClear, onClear, onInsert }: CopyToolsProps) {
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
      </div>

      <GlyphPicker target={target} onInsert={onInsert} />
    </div>
  )
}
