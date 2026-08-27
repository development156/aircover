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
 * the sentence onto a plural verb for a single channel. It was found and fixed in
 * the schedule picker; this pins the same shape here.
 */

const noop = async () => true

const renderPublish = (channels: Channel[], connected?: ReadonlySet<Channel>) =>
  render(
    <PublishNow
      postId="p1"
      channels={toChannelSet(channels)}
      flush={noop}
      saveVariantNow={noop}
      statusRows={[]}
      connected={connected}
    />,
  )

const set = (...channels: Channel[]) => new Set<Channel>(channels)

/**
 * THE SHAPE CHANGED; THE CLAIMS DID NOT.
 *
 * Publishing used to be one press: a "Publish to X" button that sent the post
 * to a live account with nothing between the pointer landing and the post
 * existing. It is now pick-then-confirm, so the rail carries a chip per channel
 * and a second, named button does the act.
 *
 * Every assertion below was written against the old shape and is retargeted
 * rather than deleted — the thing each one protects (a channel named once, a
 * footnote that cannot describe an impossible action, Instagram's wait appearing
 * only where Instagram is involved) is unchanged and still worth guarding.
 */
const pick = (root: HTMLElement, channel: Channel): HTMLElement | null =>
  root.querySelector(`[data-publish-pick="${channel}"]`)

/** Choose a channel, which is what now reveals the confirm panel and its copy. */
function choose(root: HTMLElement, channel: Channel) {
  const chip = pick(root, channel)
  if (chip === null) throw new Error(`no pick chip for ${channel}`)
  fireEvent.click(chip)
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
    expect(pick(container, 'linkedin')).toBeInTheDocument()
  })

  test('says nothing when every picked channel is connected', () => {
    const { container } = renderPublish(['x', 'linkedin'], set('x', 'linkedin'))

    expect(screen.queryByText(/connected yet/)).not.toBeInTheDocument()
    expect(pick(container, 'x')).toBeInTheDocument()
  })

  test('does not warn about a channel that is not on the live rail', () => {
    // `onRail` is filtered before the gap is computed, so an unconnected channel that
    // cannot publish at all is not offered as something to go and connect.
    renderPublish(['linkedin'], set('linkedin'))

    expect(screen.queryByText(/connected yet/)).not.toBeInTheDocument()
  })

  test('a repeated CONNECTED channel offers one chip, not two identical ones', () => {
    // Same `text[]` hazard on the other branch of the split: `live` is derived from
    // the same duplicated list. Two identical X chips is both a wrong screen and a
    // duplicate React key.
    const { container } = renderPublish(['x', 'x'], set('x'))

    expect(container.querySelectorAll('[data-publish-pick="x"]')).toHaveLength(1)
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
 * this line. That is the argument for these four.
 */
describe('PublishNow — what the footnote may claim', () => {
  // The CLAIM, not the sentence. It reads "This posts to LinkedIn for real,
  // straight away" now that the confirm panel names its channel, so an
  // assertion anchored to the old word order would fail on correct copy.
  // Retargeted per CLAUDE.md rule 5 rather than deleted.
  const FOOTNOTE = /for real, straight away/i
  const INSTAGRAM_WAIT = /fifteen seconds/i

  test('says nothing about publishing when nothing can be published', () => {
    // No connection at all, so there is no button. A sentence describing what
    // the button does is a claim about an action nobody on this screen can take.
    renderPublish(['x', 'linkedin'], set())
    expect(screen.queryByText(FOOTNOTE)).not.toBeInTheDocument()
  })

  test('never names Instagram on a post that does not use Instagram', () => {
    // THE ONE THAT WOULD HAVE CAUGHT IT. The reader's only reasonable
    // conclusion from the old copy was that Sahoda thought this was an
    // Instagram post.
    renderPublish(['x', 'linkedin'], set('x', 'linkedin'))
    expect(screen.queryByText(INSTAGRAM_WAIT)).not.toBeInTheDocument()
  })

  test('does describe the publish once a channel is picked', () => {
    // The counterweight: silencing the line everywhere would be the other
    // failure, and a test that only asserts absence passes against a deleted
    // component. It now lives in the confirm panel, which is where a person is
    // about to act rather than where they are still choosing.
    const { container } = renderPublish(['x'], set('x'))
    choose(container, 'x')

    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument()
  })

  test('says nothing about publishing until a channel is picked', () => {
    // NEW, and it is the point of the confirm step: before a pick there is no
    // act to describe, and the old screen described one anyway.
    renderPublish(['x'], set('x'))
    expect(screen.queryByText(FOOTNOTE)).not.toBeInTheDocument()
  })

  test('keeps the Instagram wait where Instagram is the thing being published', () => {
    const { container } = renderPublish(['instagram'], set('instagram'))
    choose(container, 'instagram')

    expect(screen.getByText(INSTAGRAM_WAIT)).toBeInTheDocument()
  })

  /**
   * ── THIS CASE'S CLAIM CHANGED, AND IT CHANGED FOR THE BETTER ─────────────
   * It read "a mixed post keeps the wait, because Instagram is one of the
   * buttons". That was correct about the old screen and it was the weaker
   * behaviour: one footnote had to cover every button, so a person about to
   * publish to X was told how long Instagram takes.
   *
   * The confirm panel is per channel, so the sentence is now about the channel
   * actually being sent to. Retargeted rather than deleted, and the new
   * assertion is the opposite of the old one on purpose.
   */
  test('a mixed post names the wait only for the channel being sent to', () => {
    const { container } = renderPublish(['instagram', 'x'], set('instagram', 'x'))

    choose(container, 'x')
    expect(screen.queryByText(INSTAGRAM_WAIT)).not.toBeInTheDocument()

    choose(container, 'x') // toggle off
    choose(container, 'instagram')
    expect(screen.getByText(INSTAGRAM_WAIT)).toBeInTheDocument()
  })

  test('a mixed post where only the OTHER channel is connected drops the wait', () => {
    // `live` is the set a press would reach, not the set that was picked. With
    // Instagram unconnected there is no Instagram chip to pick, so neither the
    // sentence nor the act is reachable.
    const { container } = renderPublish(['instagram', 'x'], set('x'))

    expect(pick(container, 'instagram')).toBeNull()
    choose(container, 'x')
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument()
    expect(screen.queryByText(INSTAGRAM_WAIT)).not.toBeInTheDocument()
  })
})

/**
 * WHAT THE RAIL'S HEADING IS ALLOWED TO CLAIM.
 *
 * MEASURED in a rendered frame: a post on Instagram, LinkedIn and X, with
 * Instagram and LinkedIn live, printed the eyebrow "SEND IT TO ONE CHANNEL"
 * directly above TWO chips. Read as a heading over that rail it says the post
 * is going to a single channel, which is not what the screen means and not what
 * the post is doing. What is actually true is about the PRESS: each confirm
 * sends to one channel, and the reader can come back and send the other.
 *
 * So the fact moved to the footnote, where a person is choosing, and the
 * heading now names the act. These pin the claim rather than the wording.
 */
describe('PublishNow — what the rail heading claims', () => {
  test('never heads a two-chip rail with a sentence about one channel', () => {
    renderPublish(['instagram', 'linkedin'], set('instagram', 'linkedin'))

    // The defect verbatim. Deliberately exact: this is the string that shipped.
    expect(screen.queryByText(/Send it to one channel/i)).not.toBeInTheDocument()
  })

  test('still says the rail is for sending, so the heading is not merely absent', () => {
    // The counterweight. An assertion that only checks absence passes against a
    // deleted heading, which would be a worse screen than the wrong one.
    renderPublish(['instagram', 'linkedin'], set('instagram', 'linkedin'))

    expect(screen.getByText(/Send it now/i)).toBeInTheDocument()
  })

  test('states the one-at-a-time fact where the reader is choosing', () => {
    // Moved, not dropped. It is true and a person needs it: two live channels
    // means two presses, and a reader who expects one press to do both would
    // leave thinking half the post failed.
    renderPublish(['instagram', 'linkedin'], set('instagram', 'linkedin'))

    expect(screen.getByText(/sends to one at a time/i)).toBeInTheDocument()
  })

  test('does not claim "one at a time" when there is only one channel to send to', () => {
    // With a single live channel there is no second press to warn about, and
    // "one at a time" would be an implication the screen cannot cash: it reads
    // as though something else is queued behind it.
    renderPublish(['linkedin'], set('linkedin'))

    expect(screen.queryByText(/one at a time/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/Pick the channel\. Nothing is sent until you confirm it\./),
    ).toBeInTheDocument()
  })
})
