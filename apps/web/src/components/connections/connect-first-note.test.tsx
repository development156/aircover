import { render, screen } from '@testing-library/react'
import { toChannelSet } from '@sahoda/shared'
import { describe, expect, test, vi } from 'vitest'

import { ChannelPicker } from '@/components/posts/channel-picker'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'

import { ConnectFirstNote } from './connect-first-note'

/**
 * THE NOTE AND THE COMPOSER NAME THE SAME CHANNELS, BECAUSE THEY READ THE SAME RULE.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * MEASURED 2026-09-05 (docs/51, Q-12): on `/posts` and `/planner` the note under
 * "Connect a channel" listed six channels ending in Telegram, and the channel
 * row in the composer on the same screen offered five. The note read
 * `ChannelSchema.options`; the picker read `isOfferedForConnect`. Two screens
 * answering "where can a post go?" from two sources.
 *
 * ── WHY THE RULE IS MOCKED ───────────────────────────────────────────────────
 * Asserting "neither mentions Telegram" would pass for as long as Telegram
 * happens to be withheld, and say nothing about WHERE each surface gets its
 * list. Substituting the rule and requiring both surfaces to follow the
 * substitute proves the seam: a surface that reverts to `ChannelSchema.options`
 * renders six names against a rule that said two, and goes red here.
 */
vi.mock('@/lib/connections/offered-channels', () => ({
  offeredChannels: (keep: readonly string[] = []) =>
    ['x', 'gbp', ...keep.filter((c) => c !== 'x' && c !== 'gbp')] as string[],
}))

describe('the two surfaces derive their channel vocabulary from one source', () => {
  test('the note names exactly what the offer rule returns, in its words', () => {
    render(<ConnectFirstNote connections={{ status: 'ok', channels: new Set() }} />)

    expect(
      screen.getByText(`${CHANNEL_LABELS.x} · ${CHANNEL_LABELS.gbp}`, { exact: true }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Telegram|LinkedIn|Instagram|Facebook/)).not.toBeInTheDocument()
  })

  test('the composer offers exactly what the offer rule returns', () => {
    render(<ChannelPicker selected={toChannelSet([])} onChange={() => {}} />)

    const offered = screen.getAllByRole('button').map((b) => b.getAttribute('data-channel-tile'))
    expect(offered).toEqual(['x', 'gbp'])
  })

  test('the composer keeps what the post already carries, through the same rule', () => {
    render(<ChannelPicker selected={toChannelSet(['linkedin'])} onChange={() => {}} />)

    const offered = screen.getAllByRole('button').map((b) => b.getAttribute('data-channel-tile'))
    expect(offered).toEqual(['x', 'gbp', 'linkedin'])
  })
})
