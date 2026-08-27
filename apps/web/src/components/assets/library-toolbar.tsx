'use client'

import { LayoutGrid, ListChecks, PanelLeft, Rows3, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { SortMenu } from '@/components/assets/sort-menu'
import type { LibraryView } from '@/components/assets/library-view-storage'
import type { SortOption } from '@/lib/assets/sort-cards'
import { cn } from '@/lib/utils'

/**
 * The strip above the grid: the search box (passed in as `children`, so this
 * file does not have to know about tokens or saved searches), Sort (F3),
 * Details (F4), grid/list, and Select. On a phone the folders column is gone
 * — `onOpenSidebarOnPhone` opens it as a sheet instead of shrinking the grid
 * to make room.
 */
export function LibraryToolbar({
  view,
  onViewChange,
  selectMode,
  onToggleSelectMode,
  allSelected,
  onSelectAll,
  onOpenSidebarOnPhone,
  sort,
  onSortChange,
  children,
}: {
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  selectMode: boolean
  onToggleSelectMode: () => void
  /** True when every file on screen is already selected. Flips the label. */
  allSelected: boolean
  /** Selects everything on screen, or clears it when it is already all selected. */
  onSelectAll: () => void
  onOpenSidebarOnPhone: () => void
  sort: SortOption
  onSortChange: (next: SortOption) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <button
        type="button"
        onClick={onOpenSidebarOnPhone}
        aria-label="Open folders"
        data-guide="assets.openFolders"
        className="surface-ring-firm grid size-9 shrink-0 place-items-center rounded-sm bg-surface text-muted transition-micro hover:text-ink narrow:hidden max-narrow:min-h-[44px] max-narrow:min-w-[44px]"
      >
        <PanelLeft size={16} aria-hidden />
      </button>

      <div className="min-w-[220px] flex-1">{children}</div>

      <SortMenu sort={sort} onSortChange={onSortChange} />

      <div
        role="group"
        aria-label="View"
        className="surface-ring-firm flex shrink-0 items-center gap-0.5 rounded-pill bg-surface p-0.5"
      >
        <ViewButton
          active={view === 'grid'}
          label="Grid view"
          icon={LayoutGrid}
          onClick={() => onViewChange('grid')}
        />
        <ViewButton
          active={view === 'list'}
          label="List view"
          icon={Rows3}
          onClick={() => onViewChange('list')}
        />
      </div>

      {/* ── NEXT TO Select, NOT IN THE BULK BAR ────────────────────────────
          The bulk bar renders nothing until something is selected, so a
          select-all living there could never be the FIRST thing you press —
          which is the only time anyone wants it. Here it appears the moment
          select mode is on, beside the control that turned it on. */}
      {selectMode ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="flex shrink-0 items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 type-sm font-semibold text-ink transition-micro hover:bg-s1 max-narrow:min-h-[44px]"
        >
          <ListChecks size={14} aria-hidden />
          {/* The label says what the press DOES, not what is true now. "All
              selected" would be a status pretending to be a button. */}
          {allSelected ? 'Select none' : 'Select all'}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onToggleSelectMode}
        aria-pressed={selectMode}
        data-guide="assets.select"
        className="flex shrink-0 items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 type-sm font-semibold text-ink transition-micro hover:bg-s1 max-narrow:min-h-[44px]"
      >
        {selectMode ? <X size={14} aria-hidden /> : <ListChecks size={14} aria-hidden />}
        {selectMode ? 'Cancel' : 'Select'}
      </button>
    </div>
  )
}

function ViewButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-7 place-items-center rounded-pill transition-micro',
        active ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-ink',
      )}
    >
      <Icon size={14} aria-hidden />
    </button>
  )
}
