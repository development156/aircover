import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { VariantConflictNotice } from './variant-conflict-notice'
import type { SaveConflict } from '@/lib/posts/state'

/**
 * A CONFLICT NOTICE IS THE SECOND WAY TO LOSE WORK.
 *
 * Two tabs on one post today: last write wins, and the loser is never told —
 * measured on the QA account, tab B's sentence replaced by tab A's while both
 * screens read "Saved". The fix needs a version column and a compare-and-set,
 * which is a migration (docs/23_Concurrent_Edit_Plan.md), so nothing produces
 * this state yet.
 *
 * The notice ships FIRST anyway, and these tests are why that is not
 * ceremonial: if the migration landed against a UI that could only render a
 * generic save error, the writer would keep their text, be unable to save it,
 * and not be told why — worse than losing it silently.
 *
 * Every assertion below is one of the five rules in the plan document. The
 * easiest version of this screen to build is a dialog saying "this changed,
 * reload?" — which destroys a paragraph on a reflex — so each rule is pinned
 * rather than described.
 */

const CONFLICT: SaveConflict = {
  channel: 'instagram',
  theirs: 'Fresh sourdough from six, every morning this week.',
  version: 4,
}

function renderNotice(overrides: Partial<React.ComponentProps<typeof VariantConflictNotice>> = {}) {
  const onKeepMine = vi.fn()
  const onUseTheirs = vi.fn()
  render(
    <VariantConflictNotice
      conflict={CONFLICT}
      onKeepMine={onKeepMine}
      onUseTheirs={onUseTheirs}
      {...overrides}
    />,
  )
  return { onKeepMine, onUseTheirs }
}

describe('VariantConflictNotice', () => {
  test('names the CHANNEL, because a conflict is per-variant', () => {
    renderNotice()

    // "This post changed" is not actionable when four channels each hold their
    // own copy. The display label, never the raw key.
    expect(screen.getByRole('alert')).toHaveTextContent('Someone else saved the Instagram version')
  })

  test('shows the other version in full rather than summarising it', () => {
    renderNotice()

    // "The saved version is different" gives the writer nothing to decide with.
    expect(screen.getByText(CONFLICT.theirs)).toBeInTheDocument()
  })

  test('says plainly that nothing of theirs has been lost', () => {
    renderNotice()

    expect(screen.getByRole('alert')).toHaveTextContent(/nothing of yours has been lost/i)
  })

  test('offers exactly two verbs and no way to dismiss', () => {
    renderNotice()

    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Keep mine', 'Use the saved version'])
    // A dismiss leaves a variant that cannot save and a writer typing into a box
    // whose contents can no longer land.
    expect(screen.queryByRole('button', { name: /dismiss|close|ok/i })).toBeNull()
  })

  test('"Use the saved version" hands the text back to the caller, never writing it', async () => {
    const user = userEvent.setup()
    const { onUseTheirs, onKeepMine } = renderNotice()

    await user.click(screen.getByRole('button', { name: 'Use the saved version' }))

    // Into the BOX, so it can still be edited or undone. A component that saved
    // it here would make the safer-sounding button the destructive one.
    expect(onUseTheirs).toHaveBeenCalledWith(CONFLICT.theirs)
    expect(onKeepMine).not.toHaveBeenCalled()
  })

  test('"Keep mine" re-sends without touching the local text', async () => {
    const user = userEvent.setup()
    const { onKeepMine, onUseTheirs } = renderNotice()

    await user.click(screen.getByRole('button', { name: 'Keep mine' }))

    expect(onKeepMine).toHaveBeenCalledTimes(1)
    expect(onUseTheirs).not.toHaveBeenCalled()
  })

  test('the version is never shown to the customer', () => {
    renderNotice()

    // It is a number the database needs and the shop owner cannot use.
    expect(screen.getByRole('alert').textContent).not.toMatch(/\b4\b/)
  })
})
