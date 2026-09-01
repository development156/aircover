import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MediaPeek } from './media-peek'

// jsdom implements <dialog> but not `showModal`, which the Modal calls on open.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(cleanup)

/**
 * THE PHOTO ON A POST TILE.
 *
 * The whole point of this component is that it keeps THREE cases apart, and the
 * tests are organised around them rather than around the markup: no photo, a
 * photo we can show, and a photo we cannot. Collapsing the last two into the
 * first is the defect that would send a writer to attach a second copy of a
 * photo that is already there.
 */
describe('the photo preview on a post tile', () => {
  test('renders nothing at all when the post has no photo', () => {
    const { container } = render(<MediaPeek items={[]} postTitle="Beta Launch" />)

    // Not a placeholder, not an empty frame, not a muted "no image" chip. A post
    // without a photo is not missing anything, and eight tiles each carrying a
    // grey square would say otherwise.
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the photo and says which post it belongs to', () => {
    render(
      <MediaPeek
        items={[{ id: 'm1', url: 'https://signed.example/a.jpg', alt: 'A chai cup' }]}
        postTitle="Cardamom Chai"
      />,
    )

    const button = screen.getByRole('button', { name: 'Preview the photo on Cardamom Chai' })
    expect(button).toBeVisible()
    // The name carries the post title because a screen reader hears eight of
    // these in a row and "Preview the photo" would not distinguish them.
    expect(screen.getByRole('img', { name: 'A chai cup' })).toBeVisible()
  })

  test('marks a photo it could not fetch, and never passes it off as no photo', () => {
    const { container } = render(
      <MediaPeek items={[{ id: 'm1', url: null, alt: null }]} postTitle="Beta Launch" />,
    )

    // The load-bearing case. The bucket is private and signing can fail on its
    // own, so "we have a photo and could not fetch it" is a real state — and it
    // is NOT the empty state. The control must still be there and still say a
    // photo exists.
    expect(container).not.toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: /^Preview the photo/ })).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  test('opens a full look, and only when asked', async () => {
    const user = userEvent.setup()
    render(
      <MediaPeek
        items={[{ id: 'm1', url: 'https://signed.example/a.jpg', alt: 'A chai cup' }]}
        postTitle="Cardamom Chai"
      />,
    )

    // A ~325px tile cannot show a photo anyone can judge, so the thumbnail is a
    // way in rather than the answer. It must not be open before it is pressed.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Preview the photo/ }))
    expect(screen.getByRole('dialog', { name: 'Cardamom Chai' })).toBeVisible()
  })

  test('counts the extra photos honestly, and counts them as photos', async () => {
    const user = userEvent.setup()
    render(
      <MediaPeek
        items={[
          { id: 'm1', url: 'https://signed.example/a.jpg', alt: null },
          { id: 'm2', url: 'https://signed.example/b.jpg', alt: null },
          { id: 'm3', url: null, alt: null },
        ]}
        postTitle="Beta Launch"
      />,
    )

    // Three attached, one thumbnail shown, so "+2" is what is behind it. The
    // unsignable third is INCLUDED in that count: it is attached, and a count
    // that quietly skipped it would understate the post's own media.
    expect(screen.getByText('+2')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Preview 3 photos on Beta Launch' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /^Preview 3 photos/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('3 photos attached')
    // Two render, and the third states its own case rather than being dropped.
    // Scoped to the DIALOG: a bare `getAllByRole('img')` also catches the
    // thumbnail on the tile and would read 3, which is the right answer to a
    // different question.
    expect(within(dialog).getAllByRole('img')).toHaveLength(2)
    expect(dialog).toHaveTextContent(/could not be loaded just now/i)
    expect(dialog).toHaveTextContent(/nothing has been lost/i)
  })

  test('never leaves a photo without a name a screen reader can use', () => {
    render(
      <MediaPeek
        items={[{ id: 'm1', url: 'https://signed.example/a.jpg', alt: null }]}
        postTitle="Cardamom Chai"
      />,
    )

    // `post_media.alt` is usually null, and `alt=""` is not "undescribed" — it
    // is a claim that the image is DECORATIVE, which removes it from the
    // accessibility tree altogether. These are content photos. The fallback
    // names what is actually known and does not describe the picture, because
    // nothing here has seen it.
    expect(screen.getByRole('img', { name: 'Photo attached to Cardamom Chai' })).toBeVisible()
  })

  test('opens again after it has been closed', async () => {
    const user = userEvent.setup()
    render(
      <MediaPeek
        items={[{ id: 'm1', url: 'https://signed.example/a.jpg', alt: null }]}
        postTitle="Beta Launch"
      />,
    )

    // ── THE ONE-SHOT DIALOG ─────────────────────────────────────────────────
    // `Modal`'s effect is `if (open && !el.open) el.showModal()`. Escape closes
    // the NATIVE dialog on its own; if the parent's `open` is not put back to
    // false, pressing the thumbnail again sets `true` over `true`, React does
    // not re-render, and the preview never opens for the rest of the session.
    // An audit mutation replaced `onClose` with a no-op and all seven tests
    // stayed green. Nothing else here presses this button twice.
    const button = screen.getByRole('button', { name: /^Preview the photo/ })
    await user.click(button)
    expect(screen.getByRole('dialog')).toBeVisible()

    screen.getByRole('dialog').dispatchEvent(new Event('close'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(button)
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  test('shows the FIRST photo on the tile, not just any of them', () => {
    render(
      <MediaPeek
        items={[
          { id: 'm1', url: 'https://signed.example/first.jpg', alt: 'The first one' },
          { id: 'm2', url: 'https://signed.example/second.jpg', alt: 'The second one' },
        ]}
        postTitle="Beta Launch"
      />,
    )

    // `listPostMedia` orders by `created_at` so the first row is the one the
    // writer attached first, and the tile is claiming to represent the post.
    // Indexing from the wrong end shows a real photo from the right post and is
    // therefore invisible unless asserted: an audit mutation changed `items[0]`
    // to `items[items.length - 1]` and every test stayed green.
    const thumb = screen.getAllByRole('img')[0]
    expect(thumb).toHaveAttribute('src', 'https://signed.example/first.jpg')
  })

  test('keeps a finger-sized target on touch', () => {
    render(
      <MediaPeek
        items={[{ id: 'm1', url: 'https://signed.example/a.jpg', alt: null }]}
        postTitle="Beta Launch"
      />,
    )

    // docs/26 §9: every tappable control clears 44px, desktop stays dense. The
    // thumbnail is 36px so the channel chips fit beside it on a 300px tile, and
    // the floor is applied where touch is — so BOTH classes have to be there.
    // Shrinking it to a uniform small square passed every other test here.
    const classes = screen.getByRole('button').className.split(/\s+/)
    expect(classes).toContain('size-9')
    expect(classes).toContain('max-narrow:size-11')
  })

  test('keeps the “+2” readable in dark, where --ink inverts to white', () => {
    render(
      <MediaPeek
        items={[
          { id: 'm1', url: 'https://signed.example/a.jpg', alt: null },
          { id: 'm2', url: 'https://signed.example/b.jpg', alt: null },
        ]}
        postTitle="Beta Launch"
      />,
    )

    // ── A DARK-MODE PAIR NO OTHER CHECK IN THIS REPO LOOKS AT ───────────────
    // `--ink` inverts to #ffffff in dark, so `bg-ink text-white` alone is white
    // on white at 1.00:1. Every other `bg-ink text-white` in the app carries the
    // `dark:` escape; this one did not, and design-lint has no dark-pair rule,
    // so it certified the badge green. It only appears on posts with two or more
    // photos, which is why a screenshot sweep would not have caught it either.
    //
    // Asserted on the class tokens because jsdom resolves no custom properties
    // and can compute no contrast — this is the strongest check available here,
    // and it is exactly the token that was missing.
    const classes = screen.getByText('+1').className.split(/\s+/)
    expect(classes).toContain('bg-ink')
    expect(classes).toContain('dark:bg-white')
    expect(classes).toContain('dark:text-[var(--canvas)]')
  })

  test('lays two photos out side by side, never stacked one under the other', async () => {
    const user = userEvent.setup()
    render(
      <MediaPeek
        items={[
          { id: 'm1', url: 'https://signed.example/a.jpg', alt: null },
          { id: 'm2', url: 'https://signed.example/b.jpg', alt: null },
        ]}
        postTitle="Grand Visitor Day"
      />,
    )

    await user.click(screen.getByRole('button', { name: /Preview 2 photos/ }))

    // ── THE DEFECT, REPORTED FROM THE SCREEN ─────────────────────────────────
    // Two photos were laid out `space-y-3`, each `max-h-[60dvh] w-full`. Two
    // similar pictures that way read as ONE tall picture being scrolled: the
    // pair in the report were near-identical logos and the boundary between
    // them was invisible. A stack is not wrong because the gap is small — it is
    // wrong because nothing in it says which photo is which.
    //
    // A class assertion, and here is the honest limit: jsdom has no layout
    // engine, so nothing here can prove two cells sit on one row. What it CAN
    // prove is the thing that regressed — the container going back to a stack.
    // Read as whole tokens, because `space-y-3` contains no substring that
    // `grid` does not also survive.
    const figure = screen.getAllByRole('figure')[0]
    const container = figure?.parentElement
    const classes = (container?.className ?? '').split(/\s+/)
    expect(classes).toContain('grid')
    expect(classes).toContain('narrow:grid-cols-2')
    expect(classes).not.toContain('space-y-3')
  })

  test('numbers each photo, so two alike are still two', async () => {
    const user = userEvent.setup()
    render(
      <MediaPeek
        items={[
          { id: 'm1', url: 'https://signed.example/a.jpg', alt: null },
          { id: 'm2', url: 'https://signed.example/b.jpg', alt: null },
        ]}
        postTitle="Grand Visitor Day"
      />,
    )

    await user.click(screen.getByRole('button', { name: /Preview 2 photos/ }))

    // The caption is the half of the fix that survives without layout: even
    // stacked on a phone, "Photo 1 of 2" and "Photo 2 of 2" tell a reader where
    // one ends and the next begins. Two identical logos cannot do that alone.
    expect(screen.getByText(/Photo 1 of 2/)).toBeVisible()
    expect(screen.getByText(/Photo 2 of 2/)).toBeVisible()
  })

  test('a single photo is NOT gridded, and is not told it is one of one', async () => {
    const user = userEvent.setup()
    render(
      <MediaPeek
        items={[{ id: 'm1', url: 'https://signed.example/a.jpg', alt: null }]}
        postTitle="Cardamom Chai"
      />,
    )

    await user.click(screen.getByRole('button', { name: /Preview the photo/ }))

    // One photo gets the whole width, because there is nothing to compare it
    // against and halving it would be a worse look for no reason. And "Photo 1
    // of 1" is noise about a fact already on the screen.
    const figure = screen.getAllByRole('figure')[0]
    const classes = (figure?.parentElement?.className ?? '').split(/\s+/)
    expect(classes).not.toContain('grid')
    expect(screen.queryByText(/Photo 1 of 1/)).not.toBeInTheDocument()
  })

  test('sits above the card’s stretched link so the thumbnail is clickable at all', () => {
    render(
      <MediaPeek
        items={[{ id: 'm1', url: 'https://signed.example/a.jpg', alt: null }]}
        postTitle="Beta Launch"
      />,
    )

    // The card's title is an anchor with an `::after` covering the whole card.
    // Anything interactive that is not above it receives no clicks — the press
    // opens the editor instead, which looks like the preview simply not working.
    // Class tokens, not a substring: `z-10` would also match `z-100`.
    const classes = screen.getByRole('button').className.split(/\s+/)
    expect(classes).toContain('relative')
    expect(classes).toContain('z-10')
  })
})
