import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { readBrain } from '@/lib/brand/read-brain'
import { readCitedPassages } from '@/lib/knowledge/store'

import ResolvePage from './page'

/**
 * The Signal Resolution Console's paid path.
 *
 * The screen's whole argument is that confirming and correcting here is FREE.
 * The one action that is not free, and that overwrites everything the person
 * just confirmed, shipped as accent-coloured words inside the muted paragraph
 * making that argument. The founder reported the identical shape on /brain and
 * ruled that this one match it.
 *
 * The guards pin the AFFORDANCE and the CLAIM, never the wording. The label is
 * matched through its verb, so the sentence stays rewritable; what may not
 * change silently is that the paid path is a control a person can see, that it
 * still goes to /onboarding, and that it still out-ranks nothing on a page
 * where every free control is secondary or ghost.
 */

vi.mock('@/lib/brand/read-brain', () => ({ readBrain: vi.fn() }))
vi.mock('@/lib/knowledge/store', () => ({ readCitedPassages: vi.fn() }))
vi.mock('@/app/actions/brand-field', () => ({
  confirmBrainField: vi.fn(),
  clearBrainField: vi.fn(),
}))
vi.mock('@/app/actions/workspace', () => ({ createWorkspace: vi.fn() }))

const OK = {
  status: 'ok' as const,
  active: DEMO_FALLBACK_PAYLOAD,
  version: 1,
  provenance: new Map(),
  meta: undefined,
  intake: undefined,
  source: 'resolved',
  appliedFromLearning: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readBrain).mockResolvedValue(OK)
  // A Map, not an array: `readCitedPassages` returns a keyed lookup and the
  // page indexes into it. An array typechecks as `never[]` and would have made
  // this fixture a different shape from the real read.
  vi.mocked(readCitedPassages).mockResolvedValue(new Map())
})

describe('/brain/resolve — the paid re-resolve', () => {
  test('is a control, not a run of text', async () => {
    render(await ResolvePage())

    // A <span> with an onClick, or the accent-coloured prose this replaced,
    // carries no role and never reaches this query.
    const control = screen.getByRole('link', { name: /re-run/i })
    expect(control).toHaveAttribute('href', '/onboarding')

    // `inline-flex` and `h-control` come from buttonVariants and from nowhere
    // else on this page. Restoring the inline link drops both.
    expect(control.className).toContain('inline-flex')
    expect(control.className).toContain('h-control')
  })

  test('does not out-rank the free path it sits beneath', async () => {
    render(await ResolvePage())
    const control = screen.getByRole('link', { name: /re-run/i })

    // Every free control on this view is secondary or ghost — the bulk accept
    // included, contrary to the note that used to sit in this file. A primary
    // here would make the paid, overwriting action the loudest thing on a
    // screen whose entire claim is that the work here is free.
    expect(control.className).toContain('bg-surface')
    expect(control.className).not.toContain('bg-primary')
  })

  test('the price and the consequence reach a screen reader before the press', async () => {
    render(await ResolvePage())
    const control = screen.getByRole('link', { name: /re-run/i })

    const describedBy = control.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const note = document.getElementById(describedBy as string)
    expect(note).not.toBeNull()

    // The two CLAIMS, not the sentence: paid, and it overwrites confirmed work.
    // Lifting the link out of the paragraph is the edit that could drop either.
    expect(note?.textContent).toMatch(/paid/i)
    expect(note?.textContent).toMatch(/confirmed/i)
  })

  test('the free path is still stated, and still stated first', async () => {
    render(await ResolvePage())

    const note = screen.getByText(/Confirming and correcting on this page is free/i)
    expect(note).toBeInTheDocument()
    // Order matters: the reader must meet "free" before "paid", or the button
    // below reads as the price of the whole screen.
    const text = note.textContent ?? ''
    expect(text.indexOf('free')).toBeLessThan(text.search(/paid/i))
  })
})
