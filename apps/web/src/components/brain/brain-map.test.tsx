import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { BRAIN_FIELDS } from '@/lib/brand/fields'
import {
  DORMANT_STATES,
  brainMapLayout,
  mapAriaLabel,
  mapLevel,
  type MapStates,
} from '@/lib/brand/brain-map'

import { BrainMap } from './brain-map'

const LAYOUT = brainMapLayout()

/** What the server hands the map: geometry, counts and the spoken label. */
function Map({ states: s, dormant = false }: { states: MapStates; dormant?: boolean }) {
  const level = mapLevel(s)
  return (
    <BrainMap
      layout={LAYOUT}
      level={level}
      ariaLabel={mapAriaLabel(level, dormant)}
      states={s}
      dormant={dormant}
    />
  )
}

function states(overrides: Record<string, 'confirmed' | 'intake'> = {}): MapStates {
  return { ...DORMANT_STATES, ...overrides }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('BrainMap', () => {
  test('draws one node per field, each carrying its state', () => {
    const { container } = render(
      <Map states={states({ 'hook.core_promise': 'confirmed', 'taboo.red_lines': 'intake' })} />,
    )
    const nodes = container.querySelectorAll('[data-node]')
    expect(nodes).toHaveLength(BRAIN_FIELDS.length)
    expect(container.querySelector('[data-node="hook.core_promise"]')).toHaveAttribute(
      'data-state',
      'confirmed',
    )
    expect(container.querySelector('[data-node="taboo.red_lines"]')).toHaveAttribute(
      'data-state',
      'intake',
    )
    expect(container.querySelector('[data-node="voice.descriptor"]')).toHaveAttribute(
      'data-state',
      'guessed',
    )
  })

  test('speaks the numbers, never the picture', () => {
    render(<Map states={states({ 'hook.core_promise': 'confirmed' })} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/1 of 15 fields confirmed/)
  })

  test('a page arriving does not pulse', () => {
    const { container } = render(<Map states={states({ 'hook.core_promise': 'confirmed' })} />)
    expect(container.querySelector('[data-lit="true"]')).toBeNull()
  })

  test('the node that just became confirmed lights, and only that one, then settles', () => {
    const { container, rerender } = render(<Map states={states()} />)

    rerender(<Map states={states({ 'hook.core_promise': 'confirmed' })} />)

    const lit = container.querySelectorAll('circle[data-lit="true"]')
    expect(lit).toHaveLength(1)
    expect(lit[0]!.closest('[data-node]')).toHaveAttribute('data-node', 'hook.core_promise')
    expect(container.querySelector('[data-core]')).toHaveAttribute('data-lit', 'true')

    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(container.querySelector('[data-lit="true"]')).toBeNull()
    // The state stays; only the pulse leaves.
    expect(container.querySelector('[data-node="hook.core_promise"]')).toHaveAttribute(
      'data-state',
      'confirmed',
    )
  })

  test('a field moving to intake does not pulse: nothing was confirmed', () => {
    const { container, rerender } = render(<Map states={states()} />)
    rerender(<Map states={states({ 'taboo.red_lines': 'intake' })} />)
    expect(container.querySelector('[data-lit="true"]')).toBeNull()
  })

  test('dormant draws the frame with no arc and says so', () => {
    const { container } = render(<Map states={DORMANT_STATES} dormant />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/not built yet/i)
    expect(container.querySelector('[data-core] .stroke-primary')).toBeNull()
  })
})
