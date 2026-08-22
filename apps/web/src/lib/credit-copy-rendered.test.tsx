import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE REFUSAL AND THE CONFIRMATION, RENDERED — not read from source.
 *
 * ── WHY A RENDER AND NOT A GREP ─────────────────────────────────────────────
 * `credit-words.test.ts` sweeps the source for the shape. It cannot tell you
 * what the screen SAYS. Every instance of this defect in this codebase was found
 * by putting the component on a screen:
 *
 *   "needs 1 credits"   the insufficient-credits refusal. A funded workspace
 *                       never reaches that branch, so nothing had ever displayed
 *                       it, and reading the JSX had not been enough for anyone.
 *   "1 credits used"    the SUCCESS toast on the SAME component, twenty lines
 *                       above the comment explaining the first fix.
 *                       `caption_rewrite` costs exactly 1, so that sentence had
 *                       never once been correct on any run, for any customer.
 *
 * So this drives the real `InlineRewrite` into both branches through its own
 * button and reads the rendered text back. Only the server action is faked —
 * everything from the action's return value to the DOM is the shipped code.
 */

const state = vi.hoisted(() => ({
  /** What `rewriteCaption` answers with. Drives which branch renders. */
  reply: null as unknown,
  /** Everything `toast.success` was handed, rendered to plain text. */
  toasts: [] as string[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@/app/actions/posts-ai', () => ({
  rewriteCaption: () => Promise.resolve(state.reply),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (node: unknown) => {
      state.toasts.push(flatten(node))
    },
    error: (node: unknown) => {
      state.toasts.push(flatten(node))
    },
  },
}))

/** React node → the words a reader would see, whitespace collapsed. */
function flatten(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join('')
  const el = node as { props?: { children?: unknown } }
  return flatten(el.props?.children)
}

import { InlineRewrite } from '@/components/posts/inline-rewrite'

const BODY = 'Fresh filter coffee, every morning.'
/** A selection over "Fresh filter coffee" — the whole component is gated on one. */
const SELECTION = { start: 0, end: 19 }

beforeEach(() => {
  state.reply = null
  state.toasts = []
})

function mount(): void {
  render(<InlineRewrite body={BODY} selection={SELECTION} onReplace={() => true} />)
}

async function pressRewrite(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /rewrite/i }))
}

describe('the caption rewrite, at the cost it actually charges', () => {
  test('the refusal reads "needs 1 credit", rendered', async () => {
    state.reply = { ok: false, insufficient: true, required: 1, available: 0 }

    mount()
    await pressRewrite()

    const alert = await screen.findByText(/needs/)
    const text = (alert.textContent ?? '').replace(/\s+/g, ' ')

    // THE WHOLE CLAIM, and the one a funded workspace can never see.
    expect(text).toMatch(/needs 1 credit and you have 0/)
    expect(text).not.toMatch(/1 credits/)
    // And it still names a remedy that can work.
    expect(screen.getByRole('link', { name: /top up/i })).toBeTruthy()
  })

  test('the success toast reads "1 credit used", rendered', async () => {
    state.reply = {
      ok: true,
      text: 'Filter coffee, fresh daily',
      creditsCharged: 1,
      balanceAfter: 99,
    }

    mount()
    await pressRewrite()

    await waitFor(() => expect(state.toasts.length).toBe(1))
    const text = state.toasts[0]!.replace(/\s+/g, ' ')

    // This sentence had never been correct. `caption_rewrite` is priced at 1 in
    // pricing.config.json and this component charges nothing else, so every
    // successful rewrite ever performed said "1 credits used".
    expect(text).toMatch(/1 credit used/)
    expect(text).not.toMatch(/1 credits used/)
    expect(text).toMatch(/99 left/)
  })

  test('a plural figure still takes the plural word, rendered', async () => {
    // The other half. A component that had simply been changed to say "credit"
    // would pass both tests above and be wrong the moment the price moves.
    state.reply = { ok: false, insufficient: true, required: 6, available: 2 }

    mount()
    await pressRewrite()

    const text = ((await screen.findByText(/needs/)).textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toMatch(/needs 6 credits and you have 2/)
  })

  test('a non-credit failure is rendered verbatim, with no charge claim added', async () => {
    state.reply = {
      ok: false,
      insufficient: false,
      message: 'The model did not answer. Nothing was charged.',
    }

    mount()
    await pressRewrite()

    const text = ((await screen.findByText(/model did not answer/)).textContent ?? '').replace(
      /\s+/g,
      ' ',
    )
    // The action owns the charge statement; the component must not append a
    // second one. Two "nothing was charged" sentences is how a contradiction
    // gets shipped when the action cannot confirm the charge.
    expect(text).toBe('The model did not answer. Nothing was charged.')
  })
})
