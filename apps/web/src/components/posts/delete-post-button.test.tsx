import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DeletePostButton } from './delete-post-button'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: () => refresh(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}))
vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('@/app/actions/posts', () => ({ deletePost: vi.fn() }))

const { deletePost } = await import('@/app/actions/posts')
const deleteMock = vi.mocked(deletePost)

// jsdom implements <dialog> but not `showModal`, which the Modal calls on open.
// Without these the dialog never reaches its open state and every assertion
// below would be about a dialog that is not showing — passing or failing for
// the wrong reason.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
  deleteMock.mockReset()
  refresh.mockReset()
})
afterEach(cleanup)

/**
 * DELETING A POST.
 *
 * The behaviour these guard is the one that was broken on screen: the confirm
 * step used to expand inside the card, and on the tile grid it overflowed so
 * far that Confirm was pushed off the edge — a delete you could start and not
 * finish. Every assertion here is about what a person can read and reach.
 */
describe('deleting a post', () => {
  test('deletes NOTHING until the dialog is confirmed', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Weekend slow-reading nook" compact />)

    await user.click(screen.getByRole('button', { name: 'Delete Weekend slow-reading nook' }))

    // The single most important assertion in this file. One press opens a
    // question; it does not remove anything.
    expect(deleteMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  test('names the post in the dialog, not just "this post"', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Weekend slow-reading nook" compact />)
    await user.click(screen.getByRole('button', { name: /^Delete/ }))

    // Eight tiles on a screen and one dialog: "Delete this post?" would be
    // answerable only by remembering which trash icon was pressed.
    expect(screen.getByText('Delete “Weekend slow-reading nook”?')).toBeVisible()
  })

  test('says the draft cannot be recovered, and states the credit rule without inventing a charge', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Beta Launch" compact />)
    await user.click(screen.getByRole('button', { name: /^Delete/ }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/cannot be undone/i)

    // The credit sentence is CONDITIONAL on purpose. This component cannot know
    // whether any credits were spent on this particular post, so it states the
    // rule ("spent when the work was done, deleting does not bring them back")
    // and never the fact. An unconditional "you spent credits on this" would be
    // a claim about someone's account that the product cannot stand behind.
    expect(dialog).toHaveTextContent(/does not bring them back/i)
    expect(dialog.textContent).toMatch(/if sahoda wrote or improved/i)
    expect(dialog.textContent).not.toMatch(/you spent \d/i)

    // Attached photos are NOT deleted — the cascade drops the link row, not the
    // asset and not the file. "anything attached to it goes too" was the first
    // wording and it was broader than the truth.
    expect(dialog.textContent).toMatch(/photos stay in your library/i)
  })

  test('does not claim a post that already went out will come down', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Beta Launch" compact liveElsewhere />)
    await user.click(screen.getByRole('button', { name: /^Delete/ }))

    // The worst sentence this dialog could carry. Deleting reaches Sahoda's own
    // records and nothing else — the live post stays up on X, LinkedIn or
    // Google. A reader told "it goes for good" would believe otherwise and not
    // go and remove it. Evidence-driven: shown when a permalink proves the post
    // really reached a platform.
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/does not take it down/i)
    expect(dialog.textContent).toMatch(/delete it on the platform itself/i)
  })

  test('says nothing about platforms for a post that never went out', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Beta Launch" compact />)
    await user.click(screen.getByRole('button', { name: /^Delete/ }))

    // The other direction, and it is not decoration. Telling someone their
    // never-published draft is still live somewhere is its own false claim, and
    // an unconditional sentence would say exactly that on eight tiles out of
    // nine on this screen.
    expect(screen.getByRole('dialog').textContent).not.toMatch(/take it down|already gone out/i)
  })

  test('can be dismissed by Escape, the X and the backdrop, not only by “Keep it”', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Beta Launch" compact />)
    await user.click(screen.getByRole('button', { name: /^Delete Beta Launch$/ }))

    // Every one of those three paths runs through the Modal's `onClose`, and
    // NOTHING else in this file exercises it: an audit mutation replaced
    // `onClose={close}` with a no-op and all eight tests stayed green while
    // Escape, the close button and the backdrop all silently stopped working.
    // Driving the dialog's own close event is what covers all three at once.
    const dialog = screen.getByRole('dialog')
    dialog.dispatchEvent(new Event('close'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleteMock).not.toHaveBeenCalled()
  })

  test('deletes the right post when confirmed, then refreshes', async () => {
    const user = userEvent.setup()
    deleteMock.mockResolvedValue({ ok: true })
    render(<DeletePostButton postId="p-42" title="Beta Launch" compact />)

    await user.click(screen.getByRole('button', { name: /^Delete Beta Launch$/ }))
    await user.click(screen.getByRole('button', { name: 'Delete Beta Launch for good' }))

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('p-42'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  test('keeps the post and says why when the delete is refused', async () => {
    const user = userEvent.setup()
    deleteMock.mockResolvedValue({ ok: false, message: 'That post is not in this workspace.' })
    render(<DeletePostButton postId="p1" title="Beta Launch" compact />)

    await user.click(screen.getByRole('button', { name: /^Delete Beta Launch$/ }))
    await user.click(screen.getByRole('button', { name: /for good$/ }))

    // "The post is still here" is the load-bearing half: a failure that only
    // said what went wrong would leave the reader unsure whether it half-worked.
    await waitFor(() => expect(screen.getByText(/The post is still here/)).toBeVisible())
    expect(refresh).not.toHaveBeenCalled()

    // ── AND THE DIALOG MUST BE GONE, WHICH `toBeVisible` CANNOT TELL YOU ─────
    // The error renders on the CARD, behind the dialog. jsdom has no top layer
    // and no inertness, so with the dialog still open `toBeVisible()` passes
    // while a real browser puts the dialog over the message and makes it
    // unfocusable: MEASURED in Chromium, `elementFromPoint` over the error
    // returns the <dialog>. An audit mutation removed the close-on-failure and
    // every test stayed green. This is the assertion that goes red for it.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('backing out deletes nothing', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Beta Launch" compact />)

    await user.click(screen.getByRole('button', { name: /^Delete Beta Launch$/ }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(deleteMock).not.toHaveBeenCalled()
  })

  test('a closed dialog puts nothing at all into the page', async () => {
    const user = userEvent.setup()
    render(
      <>
        <DeletePostButton postId="p1" title="Beta Launch" compact />
        <DeletePostButton postId="p2" title="Cardamom Chai" compact />
      </>,
    )

    // `Modal` renders its <dialog> — and its <h2> title — whether or not it is
    // showing. Mounted unconditionally, eight tiles put eight “Delete “…”?”
    // headings into the document permanently: invisible on screen, present to
    // anything reading the page as text. That is not hypothetical; it broke
    // `post-card-heading.test.tsx`, which looked for a post's title and found
    // two matches, its own heading and this dialog's.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/Delete “Beta Launch”\?/)).not.toBeInTheDocument()

    // And exactly one appears once a question is actually asked — the second
    // tile's dialog is still not mounted, so two cannot collide.
    await user.click(screen.getByRole('button', { name: 'Delete Cardamom Chai' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Delete “Cardamom Chai”?' })).toBeVisible()
  })

  test('uses the app’s ordinary buttons, with no bespoke danger colour', async () => {
    const user = userEvent.setup()
    render(<DeletePostButton postId="p1" title="Beta Launch" compact />)
    await user.click(screen.getByRole('button', { name: /^Delete Beta Launch$/ }))

    // There is no red in this palette, so the guard is that the confirm control
    // is the SAME primary as every other one — not that it is some hue. The
    // failure this catches is a call site reaching for a bespoke variant to make
    // delete "look dangerous", which is how a one-off palette starts.
    //
    // ── WHY THIS SPLITS ON WHITESPACE INSTEAD OF USING `toContain` ───────────
    // It was written as `className).toContain('bg-primary')` and that assertion
    // was WORTHLESS: swapping the button to the `destructive` variant left all
    // seven tests green, because destructive is `bg-ink … hover:bg-primary` and
    // the substring matched the HOVER class. Caught by mutating the variant and
    // watching nothing go red. Class lists are token lists, so the comparison
    // has to be over tokens.
    const classes = (el: Element) => el.className.split(/\s+/)
    expect(classes(screen.getByRole('button', { name: /for good$/ }))).toContain('bg-primary')
    expect(classes(screen.getByRole('button', { name: 'Keep it' }))).toContain('bg-surface')
  })
})
