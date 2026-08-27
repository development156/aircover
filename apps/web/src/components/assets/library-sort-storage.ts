import {
  DEFAULT_SORT,
  type SortDirection,
  type SortField,
  type SortOption,
} from '@/lib/assets/sort-cards'

const SORT_KEY = 'sahoda.assets.sort'
const FIELDS: readonly SortField[] = ['name', 'added', 'size']
const DIRECTIONS: readonly SortDirection[] = ['asc', 'desc']

function isSortOption(value: unknown): value is SortOption {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    FIELDS.includes(candidate.field as SortField) &&
    DIRECTIONS.includes(candidate.direction as SortDirection)
  )
}

/**
 * Sort choice, remembered across visits — same shape and same reasoning as
 * `library-view-storage.ts`: wrapped in try/catch on both sides because this
 * runs once on the server (where `window` does not exist) and can throw in
 * private browsing or a full quota, and none of that should cost the screen
 * anything beyond falling back to the default order.
 */
export function readLibrarySort(): SortOption {
  try {
    const raw = window.localStorage.getItem(SORT_KEY)
    if (raw === null) return DEFAULT_SORT
    const parsed: unknown = JSON.parse(raw)
    return isSortOption(parsed) ? parsed : DEFAULT_SORT
  } catch {
    return DEFAULT_SORT
  }
}

export function writeLibrarySort(option: SortOption): void {
  try {
    window.localStorage.setItem(SORT_KEY, JSON.stringify(option))
  } catch {
    // The sort still applies for this visit. It just does not survive a reload.
  }
}
