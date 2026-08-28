import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

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
  onSaveDraft: vi.fn(async () => true),
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
    // The wrong repair would hide on `idle` alone and strip the controls from
    // every post that has been reloaded — which is most of them. The control it
    // checks for is now a BUTTON labelled "Save" rather than a link labelled
    // "Send it" (REQUESTS §33); the claim — the bar is not empty on a reloaded
    // post — is unchanged.
    render(<CommitBar {...props} canFinish />)
    expect(visibleBar()).not.toBeNull()
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeInTheDocument()
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
 * ── THE BAR SAVES AGAIN, AND THE LAST VERSION OF THIS BLOCK SAID IT MUST NOT ─
 *
 * The previous tests here asserted "carries no button of any kind". That was my
 * reading, not a founder ruling: I had moved both endings into `SendControls` on
 * the argument that a floating save and a distant send put the two endings to
 * one piece of work in two places.
 *
 * REVERSED BY THE FOUNDER (REQUESTS §33), and the reversal is right for a reason
 * the old argument missed: a writer three screens up a long composer should not
 * have to travel to the end of the page to make their work safe. The split was
 * never the problem. Two DIFFERENT save functions were.
 *
 * So these are retargeted rather than deleted, and what they now pin is the
 * thing that actually went wrong before: there is ONE save, `saveAllAndWait`,
 * and both places call it. The bar and the panel cannot disagree about what
 * "saved" means because there is nothing for them to disagree with.
 */
describe('the bar commits, through the same one save the panel uses', () => {
  test('carries a real Save as draft, not a link dressed as one', () => {
    render(<CommitBar {...props} status="unsaved" unsavedVersions={3} canFinish />)

    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeInTheDocument()
  })

  test('Save as draft calls the save and does NOT move the reader', async () => {
    // The point of having it up here. A writer mid-page wants their work
    // written down where they are, not to be thrown to the foot of the document.
    const onSaveDraft = vi.fn(async () => true)
    const before = window.location.hash
    render(
      <CommitBar
        {...props}
        status="unsaved"
        unsavedVersions={3}
        canFinish
        onSaveDraft={onSaveDraft}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1))
    expect(window.location.hash).toBe(before)
  })

  /**
   * ── "SAVE" HAS TO ACTUALLY SAVE ──────────────────────────────────────────
   * This control was a bare `<a href="#finish">` labelled "Save and send". It
   * saved nothing; it scrolled. The founder asked for it to read "Save", and a
   * scroll link called Save is the vaguest possible label on the most important
   * word on the screen — CLAUDE.md rule 1, a sentence must never become vaguer
   * than the truth it replaces.
   *
   * It saves, then goes. Both halves are asserted, and the ORDER is asserted
   * separately below, because jumping first would move the page out from under
   * a write still in flight.
   */
  test('Save writes the work before it goes anywhere', async () => {
    const onSaveDraft = vi.fn(async () => true)
    render(
      <CommitBar
        {...props}
        status="unsaved"
        unsavedVersions={3}
        canFinish
        onSaveDraft={onSaveDraft}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.location.hash).toBe('#finish'))
  })

  test('and it does not jump while the write is still in flight', async () => {
    // THE ORDERING GUARD. `void onSaveDraft(); jump()` looks identical on
    // screen and loses the work of anyone who closes the tab on arrival.
    let release: (value: boolean) => void = () => {}
    const onSaveDraft = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)))
    window.location.hash = ''
    render(
      <CommitBar
        {...props}
        status="unsaved"
        unsavedVersions={3}
        canFinish
        onSaveDraft={onSaveDraft}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalled())
    // Still writing: the page must not have moved.
    expect(window.location.hash).toBe('')

    release(true)
    await waitFor(() => expect(window.location.hash).toBe('#finish'))
  })

  test('asks to be taken there, every press, not only the first', async () => {
    // ── THE PRESS THAT DID NOTHING, AND NOTHING WAS WATCHING ────────────────
    // The address was the whole mechanism: the bar set `#finish` and the screen
    // listened for `hashchange`. Assigning a hash that is ALREADY `#finish`
    // fires no event, so a reader who saved, went back to the words and saved
    // again saved their post and watched the screen sit still. MEASURED before
    // this existed; three separate mutations of the jump left the suite green.
    const onFinish = vi.fn()
    const onSaveDraft = vi.fn(async () => true)
    window.location.hash = 'finish'

    render(
      <CommitBar
        {...props}
        status="unsaved"
        unsavedVersions={1}
        canFinish
        onSaveDraft={onSaveDraft}
        onFinish={onFinish}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))
    // And AFTER the write, for the same reason the address is set after it.
    expect(onSaveDraft).toHaveBeenCalledTimes(1)
    window.location.hash = ''
  })

  test('offers Save as draft even with nowhere to finish', () => {
    // No channels picked, so there is no Send it section to go to. The work
    // still has to be saveable.
    render(<CommitBar {...props} status="unsaved" unsavedVersions={1} canFinish={false} />)

    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save$/i })).not.toBeInTheDocument()
  })

  test('still counts the unsaved versions, which is the other half of its job', () => {
    render(<CommitBar {...props} status="unsaved" unsavedVersions={3} canFinish />)

    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/versions not saved/)).toBeInTheDocument()
  })
})
