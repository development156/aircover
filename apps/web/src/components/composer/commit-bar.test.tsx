import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { CommitBar } from './commit-bar'

/**
 * WHEN THE BAR EARNS ITS SPACE, AND WHEN IT DOES NOT.
 *
 * `docs/34` §10 counted the composer the worst screen in the product and named
 * this among the reasons: the widest element on it read "No changes yet" and
 * carried no control. It had no test of any kind, which is why it survived two
 * audits.
 *
 * The interesting half is the DISTINCTION. `idle` is a statement about changes,
 * not about content — a reloaded post with a body is legitimately idle, and
 * there the bar carries "Send it" and belongs. Hiding on `idle` alone would take
 * the finish link away from every reloaded post, which is a worse defect than
 * the one being fixed and is the obvious wrong repair.
 */

const props = {
  status: 'idle' as const,
  unsavedVersions: 0,
  canFinish: false,
}

/** The visible strip, as opposed to the always-present live region. */
const visibleBar = () => document.querySelector('.sticky')

describe('the commit bar shows itself only when it has something to carry', () => {
  test('a brand new post with nothing typed gets no bar at all', () => {
    render(<CommitBar {...props} />)
    expect(visibleBar()).toBeNull()
  })

  test('...but a screen reader is still told the state', () => {
    // THE TRADE THIS FIX HAD TO NOT MAKE. An `aria-live` container added to the
    // DOM at the same moment its text changes is not reliably announced, so
    // removing the element outright would cost the first "Post not saved yet" —
    // swapping a visual defect for an accessibility one.
    render(<CommitBar {...props} />)
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live!.textContent).toMatch(/no changes yet/i)
  })

  test('a reloaded post that is idle but finishable KEEPS the bar', () => {
    // The wrong repair would hide on `idle` alone and take "Send it" away from
    // every post that has been reloaded — which is most of them.
    render(<CommitBar {...props} canFinish />)
    expect(visibleBar()).not.toBeNull()
    expect(screen.getByRole('link', { name: /send it/i })).toBeInTheDocument()
  })

  test('an unsaved version brings the bar back even with nowhere to finish', () => {
    render(<CommitBar {...props} unsavedVersions={2} />)
    expect(visibleBar()).not.toBeNull()
    // The count sits in its own `tabular-nums` span (numbers must not shuffle),
    // so the sentence is split across elements and a flat string match misses
    // it. Read the live region's text instead — which is what is announced.
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toMatch(
      /2\s*versions not saved/i,
    )
  })

  test('any status other than idle brings the bar back', () => {
    for (const status of ['unsaved', 'saving', 'saved', 'error'] as const) {
      const { unmount } = render(<CommitBar {...props} status={status} />)
      expect(visibleBar(), `status ${status} must render the bar`).not.toBeNull()
      unmount()
    }
  })

  test('a failed save is visible, not only announced', () => {
    // The one state where silence would be a lie about the reader's work.
    render(<CommitBar {...props} status="error" />)
    expect(visibleBar()).not.toBeNull()
    expect(screen.getByText(/post not saved$/i)).toBeInTheDocument()
  })
})

/**
 * ── THE BAR NO LONGER SAVES, AND THAT HAS TO STAY DELIBERATE ────────────────
 *
 * "Save all versions" lived here, floating over the page, while sending lived
 * four screens down in the finish panel. Two endings to the same piece of work,
 * in two places, one of them covering the other. Both now sit together in
 * `SendControls` under the dry run, and BOTH of them write every unsaved version
 * first.
 *
 * Putting a save button back on this bar would rebuild the split, so it is
 * asserted rather than left to memory. The counterweight below is the point: an
 * empty bar would satisfy an absence assertion on its own.
 */
describe('the bar reports, and does not commit', () => {
  test('carries no button of any kind', () => {
    render(<CommitBar {...props} status="unsaved" unsavedVersions={3} canFinish />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('still carries the way to the end of the page', () => {
    render(<CommitBar {...props} status="unsaved" unsavedVersions={3} canFinish />)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '#finish')
  })

  test('names the destination for what waiting work will get there', () => {
    // "Send it" beside "3 versions not saved" reads as the control that makes
    // the work safe, and it never was — it scrolls. With versions outstanding
    // the label says both halves of what is down there.
    render(<CommitBar {...props} status="unsaved" unsavedVersions={3} canFinish />)

    expect(screen.getByRole('link', { name: /Save and send/i })).toBeInTheDocument()
  })

  test('and drops the save half of that label once nothing is outstanding', () => {
    // Promising a save when there is nothing to save is the same defect in the
    // other direction.
    render(<CommitBar {...props} status="saved" unsavedVersions={0} canFinish />)

    expect(screen.getByRole('link', { name: /^Send it$/i })).toBeInTheDocument()
  })

  test('still counts the unsaved versions, which is the bar’s whole job now', () => {
    render(<CommitBar {...props} status="unsaved" unsavedVersions={3} canFinish />)

    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/versions not saved/)).toBeInTheDocument()
  })
})
