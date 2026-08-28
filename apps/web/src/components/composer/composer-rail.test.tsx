import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { ComposerRail } from './composer-rail'
import { composerSteps } from '@/lib/posts/composer-steps'

afterEach(cleanup)

const NONE = [] as unknown as ChannelSet
const TWO = ['x', 'linkedin'] as unknown as ChannelSet

function rail(
  over: {
    body?: string
    channels?: ChannelSet
    active?: 1 | 2 | 3
    onSelect?: (index: 1 | 2 | 3) => void
    onSelectChannel?: (channel: Channel) => void
  } = {},
) {
  const channels = over.channels ?? NONE
  return render(
    <ComposerRail
      steps={composerSteps({ body: over.body ?? '', channels })}
      channels={channels}
      active={over.active ?? 1}
      onSelect={over.onSelect ?? vi.fn()}
      onSelectChannel={over.onSelectChannel ?? vi.fn()}
    />,
  ).container
}

/**
 * THE MAP DOWN THE SIDE.
 *
 * The claims worth keeping here are the ones a person meets: a part they have
 * not earned is still LISTED, it says why in words, and pressing it does
 * nothing at all. The dimming is the part that is only cosmetic, and it is
 * still asserted, because a control that looks ordinary and refuses the click
 * reads as a broken product rather than a locked one.
 */
describe('a part nobody has earned yet', () => {
  test('is listed, with its name readable', () => {
    rail()

    // Never removed. "Where did the platforms go" is a question the product
    // cannot answer once it has stopped rendering the answer.
    expect(screen.getByText('Each platform')).toBeVisible()
    expect(screen.getByText('Send it')).toBeVisible()
  })

  test('says what to do about it, in words — and the two nothings differ', () => {
    const container = rail()

    // A padlock with no sentence is indistinguishable from a fault. And the two
    // locked rows are not saying the same thing twice: one explains that there
    // is nothing to shape yet, the other that there is nowhere to send it.
    const second = container.querySelector('[data-rail-step="2"]')?.textContent ?? ''
    const third = container.querySelector('[data-rail-step="3"]')?.textContent ?? ''

    expect(second).toMatch(/write your post first/i)
    expect(third).toMatch(/write your post first/i)
    expect(second).not.toBe(third)
  })

  test('refuses the press rather than moving anything', () => {
    const onSelect = vi.fn()
    const container = rail({ onSelect })

    fireEvent.click(container.querySelector('[data-rail-step="2"] button') as HTMLElement)
    fireEvent.click(container.querySelector('[data-rail-step="3"] button') as HTMLElement)

    expect(onSelect).not.toHaveBeenCalled()
  })

  test('is announced as refused, and stays reachable by keyboard', () => {
    const container = rail()
    const row = container.querySelector('[data-rail-step="2"] button') as HTMLElement

    // `aria-disabled`, never `disabled`: a disabled button leaves the tab order,
    // which takes the padlock and its sentence away from exactly the reader who
    // most needs to be told why.
    expect(row.getAttribute('aria-disabled')).toBe('true')
    expect(row).not.toHaveProperty('disabled', true)
  })

  test('looks unavailable as well as being unavailable', () => {
    const container = rail()
    const row = container.querySelector('[data-rail-step="2"] button') as HTMLElement

    expect(row.className.split(/\s+/)).toContain('opacity-60')
  })

  test('marks itself so a screen can be checked at a glance', () => {
    const container = rail()

    expect(container.querySelector('[data-rail-step="2"]')?.getAttribute('data-rail-locked')).toBe(
      'true',
    )
  })
})

describe('the rail as a whole', () => {
  test('the rows are in the order the numbers claim', () => {
    // ── ORDER IS THE RULING, AND THE NUMBERS ARE NOT THE ORDER ──────────────
    // Every other assertion in this file finds a row by its `data-rail-step`
    // attribute, so all of them stay green while the three rows render 2, 3, 1
    // on screen. A reader trusts the position over the number and is wrong.
    const container = rail({ body: 'Fresh bread.', channels: TWO })
    const order = [...container.querySelectorAll('[data-rail-step]')].map((el) =>
      el.getAttribute('data-rail-step'),
    )

    expect(order).toEqual(['1', '2', '3'])
  })

  test('each row says what its part is for, and says the right one', () => {
    const container = rail({ body: 'Fresh bread.', channels: TWO })
    const text = (index: number) =>
      container.querySelector(`[data-rail-step="${index}"] button`)?.textContent ?? ''

    // Swapping two of these leaves the titles right and tells a writer that
    // part one is where a post gets scheduled.
    expect(text(1)).toMatch(/the words/i)
    expect(text(2)).toMatch(/one version per platform/i)
    expect(text(3)).toMatch(/schedule it, or send it now/i)
  })

  test('it is a named list of three, not a heap of buttons', () => {
    const container = rail({ body: 'Fresh bread.', channels: TWO })

    // The name is what a screen reader reads out on arrival, and the list is
    // what tells the reader there are three of these and which one they are on.
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toMatch(/three parts/i)
    expect(container.querySelectorAll('ol > li')).toHaveLength(3)
  })

  test('every row says which panel it drives, and names it', () => {
    const container = rail({ body: 'Fresh bread.', channels: TWO })

    for (const index of [1, 2, 3]) {
      const row = container.querySelector(`[data-rail-step="${index}"] button`)
      expect(row?.getAttribute('id')).toBe(`rail-step-${index}`)
      expect(row?.getAttribute('aria-controls')).toBe('composer-panel')
    }
  })
})

describe('a part that is open', () => {
  test('selects when pressed, and says which one', () => {
    const onSelect = vi.fn()
    const container = rail({ body: 'Fresh bread.', onSelect })

    fireEvent.click(container.querySelector('[data-rail-step="2"] button') as HTMLElement)
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  test('carries no padlock sentence, because there is nothing to explain', () => {
    rail({ body: 'Fresh bread.', channels: TWO })

    expect(screen.queryByText(/write your post first/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pick at least one channel/i)).not.toBeInTheDocument()
  })

  test('does NOT look unavailable', () => {
    // The other half of the dimming claim, and the one that went missing when
    // the numbered sections were replaced by this rail: a working row that
    // looks greyed out is the same defect as a refused one that looks fine,
    // pointed the other way. Dimming every row would have satisfied every
    // other test in this file.
    const container = rail({ body: 'Fresh bread.', channels: TWO })

    for (const index of [1, 2, 3]) {
      const row = container.querySelector(`[data-rail-step="${index}"] button`) as HTMLElement
      expect(row.className.split(/\s+/)).not.toContain('opacity-60')
    }
  })

  test('the one filling the screen is the one marked current', () => {
    const container = rail({ body: 'Fresh bread.', channels: TWO, active: 3 })

    const current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.closest('[data-rail-step]')?.getAttribute('data-rail-step')).toBe('3')
  })
})

describe('the platforms nested under the second part', () => {
  test('each chosen platform is listed by name', () => {
    const container = rail({ body: 'Fresh bread.', channels: TWO })

    expect(container.querySelector('[data-rail-channel="x"]')?.textContent).toMatch(/^X$/)
    expect(container.querySelector('[data-rail-channel="linkedin"]')?.textContent).toMatch(
      /linkedin/i,
    )
  })

  test('pressing one asks for that platform, by name', () => {
    const onSelectChannel = vi.fn()
    const container = rail({ body: 'Fresh bread.', channels: TWO, onSelectChannel })

    fireEvent.click(container.querySelector('[data-rail-channel="linkedin"]') as HTMLElement)
    expect(onSelectChannel).toHaveBeenCalledWith('linkedin')
  })

  test('nothing is listed when nothing is chosen', () => {
    const container = rail({ body: 'Fresh bread.' })
    expect(container.querySelector('[data-rail-channel]')).toBeNull()
  })

  test('they hang under the second part and nowhere else', () => {
    // A platform listed under "Send it" would be a different claim about what
    // that part does, and it is the kind of thing a refactor moves by accident.
    const container = rail({ body: 'Fresh bread.', channels: TWO })
    const nested = container.querySelector('[data-rail-channel="x"]')

    expect(nested?.closest('[data-rail-step]')?.getAttribute('data-rail-step')).toBe('2')
  })
})
