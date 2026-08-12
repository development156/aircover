import type { BrainField } from '@/lib/brand/fields'
import type { BrainLeaf } from '@/lib/brand/leaf'
import type { FieldState } from '@/lib/brand/provenance'
import { cn } from '@/lib/utils'

import { valueBoxClass } from './certainty-mark'

/**
 * A field's value at rest. Lists render one entry per line rather than joined
 * with commas — several of them (red lines, banned phrases) contain commas of
 * their own, and a joined string silently merges two rules into one.
 */
export function FieldValue({
  field,
  value,
  state,
}: {
  field: BrainField
  value: BrainLeaf
  state: FieldState
}) {
  const empty = Array.isArray(value) ? value.length === 0 : value.trim().length === 0

  return (
    <div className={cn('rounded-input px-3 py-2 text-[13.5px]', valueBoxClass(state))}>
      {empty ? (
        // Blank is a real answer to show: the model left it out, and it is the
        // one case where "guess" would overstate what is actually there.
        <p className="text-muted italic">Not set</p>
      ) : Array.isArray(value) ? (
        <ul className="flex flex-col gap-1">
          {value.map((entry, index) => (
            // Ordered, locally-keyed list with no stable ids upstream.
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="flex gap-2 text-ink">
              <span aria-hidden className="text-muted">
                &bull;
              </span>
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn('text-ink', field.kind === 'longtext' && 'leading-[20px]')}>{value}</p>
      )}
    </div>
  )
}
