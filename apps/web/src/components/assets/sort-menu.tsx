'use client'

import { Select } from '@/components/ui/select'
import {
  SORT_FIELD_LABELS,
  type SortDirection,
  type SortField,
  type SortOption,
} from '@/lib/assets/sort-cards'

/** One row per field, each choosing its own ascending/descending word rather
 *  than a generic "A to Z" that would read wrong for Size and Date added. */
const DIRECTION_LABEL: Record<SortField, Record<SortDirection, string>> = {
  name: { asc: 'A to Z', desc: 'Z to A' },
  added: { asc: 'Oldest first', desc: 'Newest first' },
  size: { asc: 'Smallest first', desc: 'Largest first' },
}

const OPTIONS: readonly SortOption[] = [
  { field: 'added', direction: 'desc' },
  { field: 'added', direction: 'asc' },
  { field: 'name', direction: 'asc' },
  { field: 'name', direction: 'desc' },
  { field: 'size', direction: 'desc' },
  { field: 'size', direction: 'asc' },
]

const toValue = (o: SortOption): string => `${o.field}:${o.direction}`

/**
 * F3's control: name, date added, size, each ascending or descending.
 *
 * A native `<select>` (`components/ui/select.tsx`), not a bespoke menu —
 * that file's own reasoning ("Sahoda's selects choose between four channels
 * and a handful of plans; none of them needs a search field or a custom
 * row… the native control is better at this job than anything worth
 * building here") applies exactly as well to six sort orders as it does to
 * a channel picker.
 */
export function SortMenu({
  sort,
  onSortChange,
}: {
  sort: SortOption
  onSortChange: (next: SortOption) => void
}) {
  return (
    <Select
      aria-label="Sort"
      data-guide="assets.sort"
      value={toValue(sort)}
      wrapperClassName="w-auto max-w-none shrink-0"
      className="h-control w-auto rounded-pill border-0 bg-s2 pr-8 pl-3 type-sm font-semibold text-ink"
      onChange={(event) => {
        const [field, direction] = event.target.value.split(':') as [SortField, SortDirection]
        onSortChange({ field, direction })
      }}
    >
      {OPTIONS.map((option) => (
        <option key={toValue(option)} value={toValue(option)}>
          {SORT_FIELD_LABELS[option.field]}: {DIRECTION_LABEL[option.field][option.direction]}
        </option>
      ))}
    </Select>
  )
}
