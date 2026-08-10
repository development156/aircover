import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { Channel } from '@sahoda/shared'

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
      channels={channels}
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
