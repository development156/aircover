import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { ChannelSchema, type Channel } from '@sahoda/shared'

import { VariantTabs } from './variant-tabs'
import type { VariantsApi, VariantStates } from './use-variants'

/**
 * These tests exist because an adversarial review found that the roving
 * tabindex moved `aria-selected` without moving DOM focus. Since the key
 * handler is per-button and closes over its own channel, focus stranded on the
 * first tab meant every further ArrowRight recomputed from it — pressing right
 * twice landed on the SAME tab. That defect passed typecheck, the full unit
 * suite and a production build, because nothing here was reachable by a test.
 */

function states(bodies: Partial<Record<Channel, string>> = {}): VariantStates {
  const out = {} as VariantStates
  for (const channel of ChannelSchema.options) {
    out[channel] = {
      body: bodies[channel] ?? '',
      extras: {},
      dirty: false,
      saving: false,
      error: null,
    permalink: null,
    }
  }
  return out
}

function api(overrides: Partial<VariantsApi> = {}): VariantsApi {
  return {
    states: states(),
    setBody: vi.fn(),
    setExtras: vi.fn(),
    save: vi.fn(),
    applyGenerated: vi.fn(),
    ...overrides,
  }
}

const CHANNELS: Channel[] = ['x', 'gbp', 'linkedin']

describe('VariantTabs roving tabindex', () => {
  test('moves DOM focus with the selection, not just aria-selected', async () => {
    const user = userEvent.setup()
    render(<VariantTabs channels={CHANNELS} canonicalBody="" variants={api()} mediaCount={0} />)

    const tabs = screen.getAllByRole('tab')
    const [first, second] = tabs
    if (!first || !second) throw new Error('expected at least two tabs')

    first.focus()
    await user.keyboard('{ArrowRight}')

    expect(second).toHaveAttribute('aria-selected', 'true')
    // The half that was missing: without this, focus stays on `first`.
    expect(second).toHaveFocus()
  })

  test('advances one tab per ArrowRight instead of sticking on the second', async () => {
    const user = userEvent.setup()
    render(<VariantTabs channels={CHANNELS} canonicalBody="" variants={api()} mediaCount={0} />)

    const tabs = screen.getAllByRole('tab')
    const [first, , third] = tabs
    if (!first || !third) throw new Error('expected three tabs')

    first.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')

    // The exact regression: with focus stranded, the second press recomputes
    // from the FIRST tab and lands back on the second.
    expect(third).toHaveAttribute('aria-selected', 'true')
    expect(third).toHaveFocus()
  })

  test('wraps from the last tab to the first', async () => {
    const user = userEvent.setup()
    render(<VariantTabs channels={CHANNELS} canonicalBody="" variants={api()} mediaCount={0} />)

    const tabs = screen.getAllByRole('tab')
    const [first, , third] = tabs
    if (!first || !third) throw new Error('expected three tabs')

    third.focus()
    await user.keyboard('{ArrowRight}')

    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveFocus()
  })

  test('ArrowLeft wraps backwards from the first tab', async () => {
    const user = userEvent.setup()
    render(<VariantTabs channels={CHANNELS} canonicalBody="" variants={api()} mediaCount={0} />)

    const tabs = screen.getAllByRole('tab')
    const [first, , third] = tabs
    if (!first || !third) throw new Error('expected three tabs')

    first.focus()
    await user.keyboard('{ArrowLeft}')

    expect(third).toHaveFocus()
  })

  test('keeps exactly one tab in the tab order', async () => {
    const user = userEvent.setup()
    render(<VariantTabs channels={CHANNELS} canonicalBody="" variants={api()} mediaCount={0} />)

    const tabs = screen.getAllByRole('tab')
    const [first] = tabs
    if (!first) throw new Error('expected tabs')
    first.focus()
    await user.keyboard('{ArrowRight}')

    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  test('blocks only the channel whose own draft is over its own limit', () => {
    // 300 chars is over X's 280 but well under LinkedIn's 3000 — an over-limit
    // X draft must never mark LinkedIn as having an issue.
    const long = 'a'.repeat(300)
    render(
      <VariantTabs
        channels={CHANNELS}
        canonicalBody=""
        variants={api({ states: states({ x: long, linkedin: long }) })}
        mediaCount={0}
      />,
    )

    const flagged = screen
      .getAllByRole('tab')
      .filter((tab) => tab.querySelector('[aria-label="has an issue to fix"]') !== null)

    expect(flagged).toHaveLength(1)
    const [onlyFlagged] = flagged
    if (!onlyFlagged) throw new Error('expected exactly one flagged tab')
    expect(onlyFlagged).toHaveAttribute('id', 'variant-tab-x')
  })
})

/**
 * `MAX_MEDIA_COUNT` was unreachable: both call sites built the draft as
 * `{ body, hashtags, hasLink }` and never passed `mediaCount`, so
 * `validateVariant` read `draft.mediaCount ?? 0` and the rule could not fire
 * however many files were attached. A GBP post (limit 1) with four images
 * showed completely clean meters.
 */
describe('VariantTabs media-count rule', () => {
  test('flags the channel whose media limit the attached files exceed', () => {
    // Four attachments: X allows 4 and LinkedIn 9, but GBP allows exactly 1.
    render(<VariantTabs channels={CHANNELS} canonicalBody="" variants={api()} mediaCount={4} />)

    const flagged = screen
      .getAllByRole('tab')
      .filter((tab) => tab.querySelector('[aria-label="has an issue to fix"]') !== null)

    expect(flagged).toHaveLength(1)
    const [onlyFlagged] = flagged
    if (!onlyFlagged) throw new Error('expected exactly one flagged tab')
    expect(onlyFlagged).toHaveAttribute('id', 'variant-tab-gbp')
  })

  test('does not flag a count that is exactly at the limit', () => {
    render(<VariantTabs channels={CHANNELS} canonicalBody="" variants={api()} mediaCount={1} />)

    const flagged = screen
      .getAllByRole('tab')
      .filter((tab) => tab.querySelector('[aria-label="has an issue to fix"]') !== null)

    expect(flagged).toHaveLength(0)
  })

  test('states the media violation without offering a fix it cannot perform', () => {
    // GBP alone, so it is the active tab and its panel is the one rendered.
    render(<VariantTabs channels={['gbp']} canonicalBody="" variants={api()} mediaCount={4} />)

    expect(screen.getByRole('alert')).toHaveTextContent('gbp allows 1 media items.')
    // The panel cannot detach a file, so the CTA must be plain text, never a
    // button that does nothing.
    expect(screen.queryByRole('button', { name: 'Remove extra media' })).toBeNull()
    expect(screen.getByText('Remove extra media to continue.')).toBeInTheDocument()
  })
})
