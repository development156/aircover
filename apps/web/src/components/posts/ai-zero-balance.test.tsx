import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { creditCost, toChannelSet } from '@sahoda/shared'

import { GeneratePanel } from './generate-panel'
import { InlineRewrite } from './inline-rewrite'
import { GenerateImage } from './generate-image'

/**
 * WHAT EVERY PAID CONTROL SAYS WHEN THE WALLET IS EMPTY.
 *
 * ── WHY THIS IS WORTH ITS OWN FILE ───────────────────────────────────────────
 * The cost half of "costs shown before spend" is easy to check and easy to
 * believe: each control reads `creditCost(...)` and prints it beside the button.
 * The REFUSAL half is the half nobody sees, because every screenshot of a fresh
 * workspace shows 100 credits and the insufficient branch never renders.
 *
 * A branch that has never been rendered is a branch nobody has read. So each one
 * is driven here with an action that returns the shortfall, and the assertion is
 * on the SENTENCE — both numbers present, and the promise that nothing was
 * charged, because a refusal that leaves the customer wondering whether they
 * paid for it is the same failure as charging them.
 *
 * These three controls are inherited from wt-composer, not written here. This
 * file is the first thing that has watched them refuse.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const insufficient = (required: number) => ({
  ok: false as const,
  insufficient: true as const,
  required,
  available: 0,
})

vi.mock('@/app/actions/posts-ai', () => ({
  generateVariants: vi.fn(async () => insufficient(3)),
  rewriteCaption: vi.fn(async () => insufficient(1)),
}))
vi.mock('@/app/actions/posts-image', () => ({
  generateImage: vi.fn(async () => insufficient(6)),
}))

/** Both numbers, as digits, somewhere in the refusal. */
function expectsShortfall(required: number) {
  const body = document.body.textContent ?? ''
  // Printed so the sentence a person reads is on the record, not just its shape.
  console.log(`REFUSAL(${required}) → ${body.replace(/\s+/g, ' ').trim()}`)
  expect(body).toMatch(new RegExp(`\\b${required}\\b`))
  expect(body).toMatch(/\b0\b/)
}

describe('adapting per channel — 3 credits', () => {
  test('names the price before the click, from pricing.config.json', () => {
    render(
      <GeneratePanel
        channels={toChannelSet(['x'])}
        flush={async () => 'p1'}
        onGenerated={() => {}}
      />,
    )
    expect(creditCost('post_variants')).toBe(3)
    expect(document.body.textContent).toMatch(/3\s*credits/)
  })

  test('refuses with both numbers, and says nothing was charged', async () => {
    render(
      <GeneratePanel
        channels={toChannelSet(['x'])}
        flush={async () => 'p1'}
        onGenerated={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /adapt/i }))
    await screen.findByText(/needs/i)
    expectsShortfall(3)
    // The CLAIM, not the wording — this repo's own convention, so the sentence
    // can be rewritten freely and the guarantee cannot be lost.
    expect(document.body.textContent).toMatch(/not charged|nothing was charged/i)
  })
})

describe('rewriting a selection — 1 credit', () => {
  const SELECTED = { start: 0, end: 4 }

  test('names the price before the click', () => {
    render(<InlineRewrite body="Chai time" selection={SELECTED} onReplace={() => true} />)
    expect(creditCost('caption_rewrite')).toBe(1)
    expect(document.body.textContent).toMatch(/1\s*credit/)
  })

  test('refuses with both numbers, in English', async () => {
    render(<InlineRewrite body="Chai time" selection={SELECTED} onReplace={() => true} />)
    await userEvent.click(screen.getByRole('button', { name: /^rewrite$/i }))
    await screen.findByText(/needs/i)
    expectsShortfall(1)
    // A caption rewrite costs exactly 1, so this sentence had always read
    // "needs 1 credits" — found only by rendering the branch and READING it.
    expect(document.body.textContent).toMatch(/needs\s*1\s*credit and/)
    expect(document.body.textContent).not.toMatch(/1\s*credits and you have/)
  })
})

describe('making an image — 6 credits', () => {
  test('names the price before the click, and picks the CHEAPER tier', () => {
    render(<GenerateImage postId="p1" />)
    // `MESH_TASK_ACTION.image_generate` maps to `image_standard` (6), not
    // `image_premium` (12): a customer who asked for "an image" and was charged
    // for a tier they never chose has been overcharged, and the reverse never
    // happens.
    expect(creditCost('image_standard')).toBe(6)
    expect(document.body.textContent).toMatch(/6\s*credits/)
  })

  test('refuses with both numbers', async () => {
    render(<GenerateImage postId="p1" />)
    await userEvent.type(screen.getByPlaceholderText(/describe the picture/i), 'a cup of chai')
    await userEvent.click(screen.getByRole('button', { name: /make an image/i }))
    await screen.findByText(/needs/i)
    expectsShortfall(6)
  })
})
