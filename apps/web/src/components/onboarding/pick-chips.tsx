'use client'

import { cn } from '@/lib/utils'

export interface PickChipsProps<T extends string> {
  legend: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (value: T) => void
  /** Radio group name — must be unique on the screen. */
  name: string
  /**
   * True when this value was defaulted rather than read from their words. The
   * chip is drawn provisional AND says "guessed" in text: UI_RULES' greyscale
   * test means a dashed border alone cannot carry the claim.
   */
  assumed?: boolean
}

/**
 * One pick, as a radio group of chips.
 *
 * Native `<input type="radio">` under each chip rather than buttons with
 * `aria-checked`: arrow-key navigation, the roving tab stop and form semantics
 * all come free and correct, and every one of them is something a hand-rolled
 * version gets subtly wrong.
 */
export function PickChips<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
  name,
  assumed = false,
}: PickChipsProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {legend}
        {assumed ? (
          <span className="rounded-pill border border-dashed border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
            guessed
          </span>
        ) : null}
      </legend>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option === value
          return (
            <label
              key={option}
              // The kit's `.sl-chip`: 28px, pill, and an INSET RING rather than
              // a border so selecting one cannot shift the row by a pixel.
              //
              // The selected chip is solid INK, not orange. That is the kit's
              // `.sl-chip.is-on`, and it matters here more than anywhere: this
              // step shows three chip groups at once, so an orange selected
              // state painted three oranges on one screen — "orange everywhere,
              // nothing stands out" (RETHEME.md §9). Orange stays rationed to
              // the one action that moves you forward.
              className={cn(
                'inline-flex h-7 cursor-pointer items-center rounded-full px-[10px] text-[13px] font-[550] transition-micro',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                checked
                  ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                  : 'text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--line-firm)]',
                // A guessed-and-still-unconfirmed pick stays visibly provisional.
                checked && assumed && 'shadow-[inset_0_0_0_1px_var(--line-firm)]',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {labels[option]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
