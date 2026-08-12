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
              className={cn(
                'cursor-pointer rounded-pill border px-3 py-1.5 text-[13px] font-semibold transition-micro',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                checked
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-line bg-bg text-muted hover:border-primary hover:text-ink',
                checked && assumed && 'border-dashed',
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
