import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PostMedia } from '@sahoda/shared'
import type { VariantExtras } from '@/lib/posts/variant-extras'

import { VersionCard } from './version-card'
import { settingsInUse } from './channel-settings'

vi.mock('@/app/actions/posts-ai', () => ({ rewriteSelection: vi.fn() }))

/**
 * THE SETTINGS FOLD, AND THE ONE THING IT MUST NEVER DO.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 * A version card for an untouched channel rendered ten separate blocks, and four
 * channels put roughly forty controls on one screen. Six of those blocks are
 * settings a writer picks once and rarely, so they fold.
 *
 * ── WHAT WOULD MAKE THIS TEST WORTHLESS ──────────────────────────────────────
 * Asserting only that the fold starts shut. That passes against a fold welded
 * shut, which would hide a poll somebody built and be strictly worse than the
 * noise it removed. So every case here has its control: the SAME card, the SAME
 * channel, with and without a value in `extras`.
 *
 * The rendering is the WHOLE `VersionCard`, not `ChannelSettings` alone, because
 * the claim is about what a writer meets on the screen. A test that mounted the
 * fold by itself would pass even if the card stopped rendering it.
 */

const NO_MEDIA: PostMedia[] = []

function card(channel: 'x' | 'instagram' | 'gbp', extras: VariantExtras) {
  return render(
    <VersionCard
      channel={channel}
      state={{
        body: 'Chai',
        extras,
        dirty: false,
        saving: false,
        error: null,
        conflict: null,
        version: 1,
        following: false,
        permalink: null,
        relinkedFrom: null,
      }}
      media={NO_MEDIA}
      format={null}
      onFormatChange={() => {}}
      onBodyChange={() => {}}
      onExtrasChange={() => {}}
      onSave={() => {}}
      onKeepMine={() => {}}
      onUseTheirs={() => {}}
      canonicalBody=""
      onRelink={() => {}}
      onUndoRelink={() => {}}
    />,
  )
}

/** The fold's own element, so an assertion cannot match some other disclosure. */
function fold(channel: string): HTMLDetailsElement {
  const element = document.querySelector(`[data-channel-settings="${channel}"]`)
  expect(element, `no settings fold rendered for ${channel}`).not.toBeNull()
  return element as HTMLDetailsElement
}

describe('the per-channel settings fold', () => {
  test('starts shut on a channel with nothing set, and the poll goes with it', () => {
    card('x', {} as VariantExtras)

    expect(fold('x').open).toBe(false)
    // jsdom keeps a shut `details`' children in the document, so presence proves
    // nothing here. Visibility is the claim, and jest-dom resolves it against the
    // ancestor `details` exactly as a browser does.
    expect(screen.getByLabelText('Add a poll')).not.toBeVisible()
  })

  test('but the kind of post never folds, because it changes this card’s media rules', () => {
    card('x', {} as VariantExtras)

    // The control a writer touches every time stays out, next to the meter whose
    // verdict it moves. This is the half that makes the fold a hierarchy fix
    // rather than a lid.
    expect(screen.getByLabelText('Kind of post')).toBeVisible()
  })

  test('opens itself when a setting carries a value, because a fold must not swallow state', () => {
    card('x', { poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 } } as VariantExtras)

    expect(fold('x').open).toBe(true)
    expect(screen.getByLabelText('Add a poll')).toBeVisible()
  })

  test('names what is set in the summary, and keeps naming it once the writer shuts it', () => {
    card('x', { poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 } } as VariantExtras)

    const summary = within(fold('x')).getByText('More settings').closest('summary')
    expect(summary).not.toBeNull()
    expect(within(summary as HTMLElement).getByText('Poll')).toBeInTheDocument()

    // Shut it the way a person does. The name has to survive, or the fold is a lid
    // over state the writer can no longer see.
    fireEvent.click(summary as HTMLElement)
    ;(fold('x') as HTMLDetailsElement).open = false
    fireEvent(fold('x'), new Event('toggle'))

    expect(within(summary as HTMLElement).getByText('Poll')).toBeInTheDocument()
  })

  test('a channel whose settings are all absent still gets the fold, never a bare gap', () => {
    // Google Business has no poll and no AI label, but it does have the button and
    // the topic — so the fold is populated on every channel that reaches it.
    card('gbp', {} as VariantExtras)

    expect(fold('gbp').open).toBe(false)
    expect(screen.getByLabelText('Button')).not.toBeVisible()
  })
})

describe('what counts as a setting in use', () => {
  test('reports each one by the name the card uses', () => {
    expect(
      settingsInUse('x', null, { poll: { options: [], durationMinutes: 60 } } as VariantExtras),
    ).toEqual(['Poll'])
    expect(settingsInUse('instagram', null, { firstComment: '#chai' } as VariantExtras)).toEqual([
      'First comment',
    ])
    expect(settingsInUse('gbp', null, { gbpCta: 'BOOK' } as VariantExtras)).toEqual(['Button'])
  })

  test('an emptied box is not a setting: no co-authors is nobody', () => {
    // `collaborators` stores `[]` rather than dropping the key, so a `!== undefined`
    // test would report a co-author on a post that has none and hold the fold open
    // forever.
    expect(settingsInUse('instagram', null, { collaborators: [] } as VariantExtras)).toEqual([])
    expect(settingsInUse('instagram', null, { collaborators: ['@a'] } as VariantExtras)).toEqual([
      'Co-author',
    ])
  })

  test('an unticked AI label is not a setting, and a ticked one is', () => {
    expect(settingsInUse('x', null, { aiGenerated: false } as VariantExtras)).toEqual([])
    expect(settingsInUse('x', null, { aiGenerated: true } as VariantExtras)).toEqual(['AI label'])
  })

  test('hashtags are NOT reported, because they have their own field on the card', () => {
    // Naming them here would state one fact in two places, which is the defect this
    // fold exists to reduce rather than add to.
    expect(settingsInUse('x', null, { hashtags: ['#chai'] } as VariantExtras)).toEqual([])
  })

  test('the kind of post is NOT reported either, for the same reason', () => {
    expect(settingsInUse('x', 'thread', {} as VariantExtras)).toEqual([])
  })
})
