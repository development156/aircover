import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { toChannelSet, type Channel } from '@sahoda/shared'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { PublishNow } from './publish-now'

/**
 * The unconnected-channel warning, which had no test of its own.
 *
 * `PublishNow` is where this sentence was first written, and `ScheduleField` later
 * said the same fact in different words. The shared rule that resulted
 * (`lib/posts/connection-gap.ts`) is unit-tested, but nothing asserted that THIS
 * component renders it — so a change to the shared helper could alter the copy on
 * the Publish button with every suite still green. That is what these cover.
 *
 * The duplicate case is the one that matters most: `post.channels` is a `text[]`
 * off the row, not a set. An undeduplicated list reached the copy as
 * "LinkedIn and LinkedIn", which reads as two separate broken accounts and drags
 * the sentence onto a plural verb for a single channel.
 */

const noop = async () => true

const renderPublish = (channels: Channel[], connected?: ReadonlySet<Channel>) =>
  render(
    <PublishNow
      postId="p1"
      channels={toChannelSet(channels)}
      flush={noop}
      saveVariantNow={noop}
      saveAllVersions={noop}
      unsavedVersions={0}
      statusRows={[]}
      connected={connected}
    />,
  )

const set = (...channels: Channel[]) => new Set<Channel>(channels)

/**
 * ── THE SHAPE CHANGED TWICE; THE CLAIMS DID NOT ──────────────────────────────
 *
 * Publishing was one press per channel: a "Publish to X" button that sent the
 * post to a live account with nothing between the pointer landing and the post
 * existing. It became pick-a-chip-then-confirm. It is now ONE press that reaches
 * every connected channel, with a confirm step naming them and a result LIST
 * carrying one row per channel.
 *
 * Every assertion below was written against one of the older shapes and is
 * retargeted rather than deleted, because the thing each one protects is
 * unchanged: a channel named once, a footnote that cannot describe an impossible
 * action, and Instagram's wait appearing only where Instagram is involved.
 *
 * ONE CLAIM GENUINELY CHANGED and it says so where it sits: "a mixed post names
 * the wait only for the channel being sent to" was true of the chip rail and is
 * false now, because one press reaches both. The new assertion is the honest
 * one.
 */
const sendNow = (root: HTMLElement): HTMLElement | null => root.querySelector('[data-send-now]')

/** Press Send now, which is what reveals the confirm panel and its copy. */
function openConfirm(root: HTMLElement) {
  const button = sendNow(root)
  if (button === null) throw new Error('no Send now button')
  fireEvent.click(button)
}

describe('PublishNow — the unconnected-channel warning', () => {
  test('names a single unconnected channel, and offers to connect that one by name', () => {
    renderPublish(['linkedin'], set())

    expect(
      screen.getByText(/LinkedIn isn’t connected yet, so this can’t go out there\./),
    ).toBeInTheDocument()
    // Named, not generic: with exactly one channel missing the link can say which.
    expect(screen.getByRole('link', { name: /Connect LinkedIn/ })).toBeInTheDocument()
  })

  test('joins two unconnected channels and agrees with itself about the verb', () => {
    renderPublish(['x', 'linkedin'], set())

    expect(
      screen.getByText(/X and LinkedIn aren’t connected yet, so this can’t go out there\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Connect a channel/ })).toBeInTheDocument()
  })

  test('joins three without a serial comma, matching the rest of the app’s copy', () => {
    renderPublish(['x', 'gbp', 'linkedin'], set())

    expect(
      screen.getByText(/X, Google Business Profile and LinkedIn aren’t connected yet/),
    ).toBeInTheDocument()
  })

  test('a channel repeated in post.channels is named ONCE, in the singular', () => {
    // The defect this exists for. `['linkedin','linkedin']` is reachable straight off
    // the row, and before `unconnectedFrom` deduplicated it this rendered
    // "LinkedIn and LinkedIn aren’t connected yet" — two accounts named where one is
    // broken, on a plural verb the count had no right to.
    renderPublish(['linkedin', 'linkedin'], set())

    expect(
      screen.getByText(/LinkedIn isn’t connected yet, so this can’t go out there\./),
    ).toBeInTheDocument()
    expect(screen.queryByText(/LinkedIn and LinkedIn/)).not.toBeInTheDocument()
    // The count drives the link too, so this fails independently of the sentence if
    // the list is ever un-deduplicated again.
    expect(screen.getByRole('link', { name: /Connect LinkedIn/ })).toBeInTheDocument()
  })

  test('says nothing when the connection state is UNKNOWN, and still offers the button', () => {
    // `connected === undefined` means the read did not happen. Claiming a channel is
    // unconnected would send someone to reconnect an account that is fine, and hiding
    // the button would break publishing over a missing prop.
    const { container } = renderPublish(['linkedin'], undefined)

    expect(screen.queryByText(/isn’t connected yet/)).not.toBeInTheDocument()
    expect(sendNow(container)).toBeInTheDocument()
  })

  test('says nothing when every channel is connected', () => {
    const { container } = renderPublish(['x', 'linkedin'], set('x', 'linkedin'))

    expect(screen.queryByText(/connected yet/)).not.toBeInTheDocument()
    expect(sendNow(container)).toBeInTheDocument()
  })

  test('does not warn about a channel that is not on the live rail', () => {
    // `onRail` is filtered before the gap is computed, so an unconnected channel that
    // cannot publish at all is not offered as something to go and connect.
    renderPublish(['linkedin'], set('linkedin'))

    expect(screen.queryByText(/connected yet/)).not.toBeInTheDocument()
  })

  test('a repeated CONNECTED channel is listed once, not twice', () => {
    // Same `text[]` hazard on the other branch of the split: `live` is derived from
    // the same duplicated list. It used to render two identical X chips — both a
    // wrong screen and a duplicate React key. The chips are gone; the readout is
    // where a channel is now named, and the same dedupe has to hold there.
    const { container } = renderPublish(['x', 'x'], set('x'))

    expect(container.querySelectorAll('[data-channel-status="x"]')).toHaveLength(1)
  })
})

/**
 * THE FOOTNOTE THAT NAMED A CHANNEL THAT WAS NOT ON THE POST.
 *
 * MEASURED on this lane's baseline frame: a post carrying X and LinkedIn, with
 * neither connected, rendered "This posts for real, straight away. Instagram
 * takes about fifteen seconds to finish."
 *
 * Two claims, both false at once — a channel the post does not use, and a real
 * publish promised forty pixels below a block saying nothing could go out. All
 * eight assertions above passed with it in place, because none of them read
 * this line. That is the argument for these.
 */
describe('PublishNow — what the confirm panel may claim', () => {
  const FOOTNOTE = /for real, straight away/i
  const INSTAGRAM_WAIT = /fifteen seconds/i

  test('says nothing about publishing when nothing can be published', () => {
    // No connection at all, so there is no Send button. A sentence describing
    // what it does is a claim about an action nobody on this screen can take.
    const { container } = renderPublish(['x', 'linkedin'], set())

    expect(sendNow(container)).toBeNull()
    expect(screen.queryByText(FOOTNOTE)).not.toBeInTheDocument()
  })

  test('never names Instagram on a post that does not use Instagram', () => {
    // THE ONE THAT WOULD HAVE CAUGHT IT. The reader's only reasonable
    // conclusion from the old copy was that Sahoda thought this was an
    // Instagram post.
    const { container } = renderPublish(['x', 'linkedin'], set('x', 'linkedin'))
    openConfirm(container)

    expect(screen.queryByText(INSTAGRAM_WAIT)).not.toBeInTheDocument()
  })

  test('does describe the send once it is confirmed', () => {
    // The counterweight: silencing the line everywhere would be the other
    // failure, and a test that only asserts absence passes against a deleted
    // component. It lives in the confirm panel, which is where a person is
    // about to act rather than where they are still deciding.
    const { container } = renderPublish(['x'], set('x'))
    openConfirm(container)

    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument()
  })

  test('says nothing about publishing until Send now is pressed', () => {
    // The point of the confirm step: before the press there is no act to
    // describe, and the old screen described one anyway.
    renderPublish(['x'], set('x'))

    expect(screen.queryByText(FOOTNOTE)).not.toBeInTheDocument()
  })

  test('keeps the Instagram wait where Instagram is the thing being sent', () => {
    const { container } = renderPublish(['instagram'], set('instagram'))
    openConfirm(container)

    expect(screen.getByText(INSTAGRAM_WAIT)).toBeInTheDocument()
  })

  /**
   * ── THIS CASE'S CLAIM CHANGED, AND IT CHANGED BACK ───────────────────────
   * It first read "a mixed post keeps the wait, because Instagram is one of the
   * buttons". Then the chip rail arrived and it became "names the wait only for
   * the channel being sent to", which was correct about that shape.
   *
   * One press now reaches BOTH, so the wait is a fact about this send again and
   * hiding it would understate how long the reader is about to wait. The
   * assertion follows the behaviour rather than the wording, and both directions
   * are checked so it cannot pass by saying nothing.
   */
  test('a mixed post keeps the wait, because this one press reaches Instagram too', () => {
    const { container } = renderPublish(['instagram', 'x'], set('instagram', 'x'))
    openConfirm(container)

    expect(screen.getByText(INSTAGRAM_WAIT)).toBeInTheDocument()
    expect(screen.getByText(/This posts to Instagram and X for real/)).toBeInTheDocument()
  })

  test('a mixed post where only the OTHER channel is connected drops the wait', () => {
    // `live` is the set a press would reach, not the set that was chosen. With
    // Instagram unconnected it is not in `live`, so neither the sentence nor the
    // act is reachable for it.
    const { container } = renderPublish(['instagram', 'x'], set('x'))
    openConfirm(container)

    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument()
    expect(screen.queryByText(INSTAGRAM_WAIT)).not.toBeInTheDocument()
    expect(screen.getByText(/This posts to X for real/)).toBeInTheDocument()
  })
})

/**
 * WHAT THE SEND CONTROLS CLAIM ABOUT THEMSELVES.
 *
 * The rail heading once read "SEND IT TO ONE CHANNEL" above TWO chips — a
 * heading that made a claim about the POST rather than about the press. The
 * chips are gone and the claim is now the opposite one: this press reaches every
 * connected channel. It has to be said, because a reader who expects one channel
 * per press will not expect four posts.
 */
describe('PublishNow — what the send controls claim', () => {
  test('never says a press goes to one channel when it goes to two', () => {
    // The defect verbatim, from the shape before this one.
    renderPublish(['instagram', 'linkedin'], set('instagram', 'linkedin'))

    expect(screen.queryByText(/Send it to one channel/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/one at a time/i)).not.toBeInTheDocument()
  })

  test('offers both endings, named for what they do', () => {
    // The counterweight to every absence assertion above: a screen with neither
    // button would satisfy all of them.
    renderPublish(['linkedin'], set('linkedin'))

    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Send now/i })).toBeInTheDocument()
  })

  test('lists where the post is going, including the channels it cannot reach', () => {
    // The readout the schedule route already had and this one did not. It is the
    // answer to "where is this going", which is the question a person asks in
    // the second before pressing an irreversible button.
    const { container } = renderPublish(['instagram', 'linkedin', 'x'], set('instagram'))

    expect(container.querySelector('[data-channel-readout]')).not.toBeNull()
    expect(container.querySelectorAll('[data-channel-status]')).toHaveLength(3)
  })

  test('offers Save as draft even when nothing can be sent', () => {
    // Work still has to be safe on a post with no connections. Hiding both
    // buttons because one of them cannot work would strand the writer.
    const { container } = renderPublish(['linkedin'], set())

    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeInTheDocument()
    expect(sendNow(container)).toBeNull()
  })
})
