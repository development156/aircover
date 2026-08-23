import { render, screen } from '@testing-library/react'
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
    renderPublish(['linkedin'], undefined)

    expect(screen.queryByText(/isn’t connected yet/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Publish to LinkedIn/ })).toBeInTheDocument()
  })

  test('says nothing when every picked channel is connected', () => {
    renderPublish(['x', 'linkedin'], set('x', 'linkedin'))

    expect(screen.queryByText(/connected yet/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Publish to X/ })).toBeInTheDocument()
  })

  test('does not warn about a channel that is not on the live rail', () => {
    // `onRail` is filtered before the gap is computed, so an unconnected channel that
    // cannot publish at all is not offered as something to go and connect.
    renderPublish(['linkedin'], set('linkedin'))

    expect(screen.queryByText(/connected yet/)).not.toBeInTheDocument()
  })

  test('a repeated CONNECTED channel offers one button, not two identical ones', () => {
    // Same `text[]` hazard on the other branch of the split: `live` is derived from
    // the same duplicated list. Two identical "Publish to X" buttons is both a wrong
    // screen and a duplicate React key.
    renderPublish(['x', 'x'], set('x'))

    expect(screen.getAllByRole('button', { name: /Publish to X/ })).toHaveLength(1)
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
  const FOOTNOTE = /posts for real, straight away/i
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

  test('does describe the publish when a channel can actually receive it', () => {
    // The counterweight: silencing the line everywhere would be the other
    // failure, and a test that only asserts absence passes against a deleted
    // component.
    renderPublish(['x'], set('x'))
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument()
  })

  test('keeps the Instagram wait where Instagram is the thing being published', () => {
    renderPublish(['instagram'], set('instagram'))
    expect(screen.getByText(INSTAGRAM_WAIT)).toBeInTheDocument()
  })

  test('a mixed post keeps the wait, because Instagram is one of the buttons', () => {
    renderPublish(['instagram', 'x'], set('instagram', 'x'))
    expect(screen.getByText(INSTAGRAM_WAIT)).toBeInTheDocument()
  })

  test('a mixed post where only the OTHER channel is connected drops the wait', () => {
    // `live` is the set a press would reach, not the set that was picked. With
    // Instagram unconnected the Instagram button does not exist, so neither
    // does the sentence about how long Instagram takes.
    renderPublish(['instagram', 'x'], set('x'))
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument()
    expect(screen.queryByText(INSTAGRAM_WAIT)).not.toBeInTheDocument()
  })
})
