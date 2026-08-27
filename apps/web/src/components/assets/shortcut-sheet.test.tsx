import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { LIBRARY_SHORTCUTS } from './library-shortcuts'
import { ShortcutSheet } from './shortcut-sheet'
import { useLibraryShortcuts } from './use-library-shortcuts'

beforeEach(() => {
  // `<dialog>` is not implemented in jsdom; `ShortcutSheet` renders through
  // `Modal`, which only ever calls these two. Same stub `crop-decline.test.tsx`
  // uses for the same reason.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
})

/**
 * F5: "Build it from the same source the shortcut handler uses so the
 * sheet cannot list a shortcut that does not work."
 *
 * Two halves. The first renders the sheet from `LIBRARY_SHORTCUTS` and
 * checks it lists every entry and nothing else. The second drives
 * `useLibraryShortcuts` — the SAME array's actual implementation — through
 * every GLOBAL key it names and asserts the matching callback really fires,
 * so a row on the sheet can never outlive the check that made it true.
 */

function ShortcutHarness(props: {
  onFocusSearch: () => void
  onEscape: () => void
  onListView: () => void
  onGridView: () => void
  onSelectAll: () => void
  onShowShortcuts: () => void
}) {
  useLibraryShortcuts(props)
  return <input aria-label="elsewhere" />
}

describe('F5: the shortcut sheet lists exactly what the screen implements', () => {
  it('renders one row per entry in LIBRARY_SHORTCUTS, with its real keys and description', () => {
    render(<ShortcutSheet open onClose={() => {}} />)

    for (const entry of LIBRARY_SHORTCUTS) {
      expect(screen.getByText(entry.keys)).toBeInTheDocument()
      expect(screen.getByText(entry.description)).toBeInTheDocument()
    }
    // Nothing extra: nine named rows, nine `<kbd>` elements, not ten.
    expect(screen.getAllByRole('definition')).toHaveLength(LIBRARY_SHORTCUTS.length)
  })

  it('is not shown (never called `showModal`) while `open` is false', () => {
    render(<ShortcutSheet open={false} onClose={() => {}} />)
    // `<dialog>` markup exists either way — `Modal` mounts it once and
    // toggles `showModal()`/`close()`, same as every dialog-backed overlay
    // in this app — so the claim under test is the native open STATE, not
    // whether the JSX rendered at all.
    expect(document.querySelector('dialog')?.open).toBeFalsy()
  })
})

describe('F5: every GLOBAL entry the sheet lists is a key the handler actually checks', () => {
  it('/ and Ctrl/Cmd+F both focus search, as the sheet promises', async () => {
    const onFocusSearch = vi.fn()
    const user = userEvent.setup()
    render(
      <ShortcutHarness
        onFocusSearch={onFocusSearch}
        onEscape={() => {}}
        onListView={() => {}}
        onGridView={() => {}}
        onSelectAll={() => {}}
        onShowShortcuts={() => {}}
      />,
    )
    await user.keyboard('/')
    expect(onFocusSearch).toHaveBeenCalledTimes(1)
    await user.keyboard('{Control>}f{/Control}')
    expect(onFocusSearch).toHaveBeenCalledTimes(2)
  })

  it('Esc clears the search or exits Select, as the sheet promises', async () => {
    const onEscape = vi.fn()
    const user = userEvent.setup()
    render(
      <ShortcutHarness
        onFocusSearch={() => {}}
        onEscape={onEscape}
        onListView={() => {}}
        onGridView={() => {}}
        onSelectAll={() => {}}
        onShowShortcuts={() => {}}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('Ctrl/Cmd+1 and +2 switch view, as the sheet promises', async () => {
    const onListView = vi.fn()
    const onGridView = vi.fn()
    const user = userEvent.setup()
    render(
      <ShortcutHarness
        onFocusSearch={() => {}}
        onEscape={() => {}}
        onListView={onListView}
        onGridView={onGridView}
        onSelectAll={() => {}}
        onShowShortcuts={() => {}}
      />,
    )
    await user.keyboard('{Control>}1{/Control}')
    expect(onListView).toHaveBeenCalledTimes(1)
    await user.keyboard('{Control>}2{/Control}')
    expect(onGridView).toHaveBeenCalledTimes(1)
  })

  it('? opens the shortcut sheet, as the sheet promises about itself', async () => {
    const onShowShortcuts = vi.fn()
    const user = userEvent.setup()
    render(
      <ShortcutHarness
        onFocusSearch={() => {}}
        onEscape={() => {}}
        onListView={() => {}}
        onGridView={() => {}}
        onSelectAll={() => {}}
        onShowShortcuts={onShowShortcuts}
      />,
    )
    await user.keyboard('?')
    expect(onShowShortcuts).toHaveBeenCalledTimes(1)
  })

  it('? while typing in a field does not fire — a real question mark must still be typeable', async () => {
    const onShowShortcuts = vi.fn()
    const user = userEvent.setup()
    render(
      <ShortcutHarness
        onFocusSearch={() => {}}
        onEscape={() => {}}
        onListView={() => {}}
        onGridView={() => {}}
        onSelectAll={() => {}}
        onShowShortcuts={onShowShortcuts}
      />,
    )
    await user.click(screen.getByLabelText('elsewhere'))
    await user.keyboard('?')
    expect(onShowShortcuts).not.toHaveBeenCalled()
  })
})
