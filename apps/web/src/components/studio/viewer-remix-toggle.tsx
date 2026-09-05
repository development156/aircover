import { Lock, RefreshCw } from 'lucide-react'

/**
 * "KEEP WITH THIS ONE" — ON BY DEFAULT, AND LOCKED WHEN IT CANNOT WORK.
 *
 * ── WHY A LOCKED SPAN, NEVER A DISABLED BUTTON ───────────────────────────────
 * `design-lint.mjs` rule 3: a `<button disabled>` still tab-stops to nothing
 * and still reads as "a control exists here" to a screen reader. The `Lock`
 * icon on a plain `<span>` is the shape this screen already uses for
 * `COMING_SOON_COUNT` in the chip row this control sits beside.
 *
 * ── WHY LOCKED AT ALL, RATHER THAN A LIVE TOGGLE THAT DOES NOTHING ───────────
 * `studio_generations.remixed_from` is a written, unapplied migration. A toggle
 * that reads ON and silently records nothing is the exact defect this whole
 * redesign exists to remove, so the caller passes `locked` whenever it could
 * not confirm the column is reachable, and this component never guesses.
 *
 * Rendered with `basis-full` so it takes its own line under the chip row
 * rather than fighting the pills before it for space: `extraControls` is a
 * single flex-wrap slot, and a sentence this long wrapping mid-row read worse
 * than a control on its own line.
 */
export function ViewerRemixToggle({
  locked,
  on,
  onChange,
}: {
  locked: boolean
  on: boolean
  onChange: (next: boolean) => void
}) {
  if (locked) {
    return (
      <div className="basis-full pt-1" data-guide="studio-remix-toggle">
        <span className="flex items-center gap-1.5 type-sm text-muted">
          <Lock className="size-[12px]" aria-hidden />
          Sahoda cannot yet remember which picture a version came from, so Draw again always starts
          a separate picture.
        </span>
      </div>
    )
  }

  return (
    <div className="basis-full flex flex-col gap-1 pt-1" data-guide="studio-remix-toggle">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(!on)}
        className={`flex h-[32px] w-fit items-center gap-1.5 rounded-pill px-3 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          on
            ? 'bg-primary text-primary-foreground'
            : 'surface-ring bg-s2 text-muted hover:bg-surface-3'
        }`}
      >
        <RefreshCw className="size-[13px]" aria-hidden />
        Keep with this one
      </button>
      <span className="type-sm text-muted">
        {on
          ? 'Saves the result as a version of this picture. Turn it off to start a separate picture from the same words and settings.'
          : 'Starts a separate picture from the same words and settings, not a version of this one.'}
      </span>
    </div>
  )
}
