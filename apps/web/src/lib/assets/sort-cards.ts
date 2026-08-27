import { displayName, type AssetCard } from '@/lib/assets/view'

/**
 * F3 — sort the grid and the list from the SAME order, always.
 *
 * Pure and total: never throws, never drops a file, never changes the
 * length of what it is given. A sort is a re-ordering, not a filter, and a
 * bug that turned it into one would be invisible in every test that only
 * checks the FIRST few rows.
 */
export type SortField = 'name' | 'added' | 'size'
export type SortDirection = 'asc' | 'desc'

export interface SortOption {
  field: SortField
  direction: SortDirection
}

export const DEFAULT_SORT: SortOption = { field: 'added', direction: 'desc' }

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  name: 'Name',
  added: 'Date added',
  size: 'Size',
}

function compare(option: SortOption, a: AssetCard, b: AssetCard): number {
  const dir = option.direction === 'asc' ? 1 : -1
  switch (option.field) {
    case 'name':
      return dir * displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' })
    case 'added':
      return dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt))
    case 'size': {
      // `bytes: null` sinks to the BOTTOM regardless of direction — "largest
      // first" and "smallest first" both mean "sort what Sahoda could weigh,
      // then put what it could not after it", never "null coerces to 0 and
      // wins smallest-first" or "flips to the top on the reverse pass".
      const an = a.bytes
      const bn = b.bytes
      if (an === null && bn === null) return 0
      if (an === null) return 1
      if (bn === null) return -1
      return dir * (an - bn)
    }
  }
}

/** A new array, same length, same members, re-ordered. */
export function sortCards(cards: readonly AssetCard[], option: SortOption): AssetCard[] {
  return [...cards].sort((a, b) => compare(option, a, b))
}
