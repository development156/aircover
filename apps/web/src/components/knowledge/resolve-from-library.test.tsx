import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ResolveFromLibrary } from './resolve-from-library'

const resolveFromLibrary = vi.fn()

vi.mock('@/app/actions/knowledge', () => ({
  resolveFromLibrary: (...args: unknown[]) => resolveFromLibrary(...args),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

/**
 * The 50-credit button, and the press that must not be able to happen by
 * accident.
 *
 * MEASURED, and it is why a confirmation earns its place here rather than being
 * friction: `20260822000200_propose_memory_event.sql` has no dedupe and no
 * unique key, so a second read does not refresh the first read's suggestions. It
 * writes another set beside them and charges again.
 *
 * These assert the GUARANTEE, never the wording: nothing spends on a re-run
 * without a second press, and the way out spends nothing.
 */

beforeEach(() => {
  resolveFromLibrary.mockReset()
  resolveFromLibrary.mockResolvedValue({ ok: true, message: 'Read it.' })
})

const COST = 50

describe('ResolveFromLibrary', () => {
  it('spends straight away the first time, because nothing is waiting', async () => {
    render(<ResolveFromLibrary cost={COST} waiting={0} />)

    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))

    expect(resolveFromLibrary).toHaveBeenCalledTimes(1)
  })

  it('shows the cost before that first spend', () => {
    render(<ResolveFromLibrary cost={COST} waiting={0} />)

    expect(screen.getByRole('button', { name: /read my library/i }).textContent).toMatch(/50/)
  })

  /** THE ONE THE FOUNDER ASKED FOR. */
  it('spends nothing on the first press when suggestions are already waiting', async () => {
    render(<ResolveFromLibrary cost={COST} waiting={3} />)

    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))

    expect(resolveFromLibrary).not.toHaveBeenCalled()
  })

  it('says how many are waiting, and that a second read adds to them rather than replacing them', async () => {
    render(<ResolveFromLibrary cost={COST} waiting={3} />)
    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))

    const text = document.body.textContent ?? ''
    expect(text).toMatch(/\b3\b/)
    expect(text).toMatch(/adds|beside/i)
    expect(text).toMatch(/rather than replacing/i)
    expect(text).toMatch(/50/)
  })

  it('backing out spends nothing and leaves the offer available', async () => {
    render(<ResolveFromLibrary cost={COST} waiting={3} />)
    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))
    /* The WAY OUT, matched by what it is for rather than by its exact words, so
       the label can be rewritten without deleting the guarantee. */
    await userEvent.click(screen.getByRole('button', { name: /leave them|keep|not now|cancel/i }))

    expect(resolveFromLibrary).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /read my library/i })).toBeEnabled()
  })

  it('confirming spends exactly once', async () => {
    render(<ResolveFromLibrary cost={COST} waiting={3} />)
    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))
    await userEvent.click(screen.getByRole('button', { name: /read it again/i }))

    expect(resolveFromLibrary).toHaveBeenCalledTimes(1)
  })

  /**
   * A count that did not answer is not permission to spend. Treating an
   * unreadable read as "nothing is waiting" is the one wrong answer that removes
   * the protection precisely when the product is already having trouble.
   */
  it('asks first when the count of waiting suggestions could not be read', async () => {
    render(<ResolveFromLibrary cost={COST} waiting={null} />)

    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))

    expect(resolveFromLibrary).not.toHaveBeenCalled()
    expect(document.body.textContent ?? '').toMatch(/read your library before/i)
  })

  /** A second press in the same visit is a re-run even if the page loaded empty. */
  it('asks before a second spend in the same visit', async () => {
    render(<ResolveFromLibrary cost={COST} waiting={0} />)

    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))
    expect(resolveFromLibrary).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /read my library/i }))
    expect(resolveFromLibrary).toHaveBeenCalledTimes(1)
    expect(document.body.textContent ?? '').toMatch(/already in this visit/i)
  })
})
