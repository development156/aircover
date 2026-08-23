import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The regression this file exists for: a paid rewrite going invisible.
 *
 * The component used to `return null` whenever the selection was empty. The
 * caret collapses on any click in the textarea, so clicking away during a
 * rewrite unmounted the pending lines AND the `stranded` box — the box that
 * exists precisely to hand back a result the user was CHARGED for but which
 * could not be spliced (because the body moved under it). Credit spent, model
 * output sitting in state, nothing on screen.
 */

const rewriteCaption = vi.fn()

vi.mock('@/app/actions/posts-ai', () => ({
  rewriteCaption: (...args: unknown[]) => rewriteCaption(...args),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const { InlineRewrite } = await import('./inline-rewrite')

const BODY = 'Fresh chai every morning at the corner shop.'
const SELECTION = { start: 0, end: 10 }

beforeEach(() => {
  vi.clearAllMocks()
  rewriteCaption.mockResolvedValue({
    ok: true,
    text: 'REWRITTEN TEXT',
    balanceAfter: 99,
    creditsCharged: 1,
  })
})

describe('InlineRewrite', () => {
  test('renders nothing when there is no selection and nothing outstanding', () => {
    const { container } = render(
      <InlineRewrite body={BODY} selection={null} onReplace={() => true} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('offers the rewrite, priced, once text is selected', () => {
    render(<InlineRewrite body={BODY} selection={SELECTION} onReplace={() => true} />)

    expect(screen.getByRole('button', { name: /^rewrite$/i })).toBeInTheDocument()
    const note = screen.getByText(/uses/i)
    expect(note.textContent?.replace(/\s+/g, ' ')).toMatch(/uses 1 credit/i)
  })

  test('keeps a charged-but-unplaceable rewrite on screen after the selection collapses', async () => {
    const user = userEvent.setup()
    // onReplace returning false is the "body moved under us" path: the user was
    // charged and the text could not be spliced.
    const { rerender } = render(
      <InlineRewrite body={BODY} selection={SELECTION} onReplace={() => false} />,
    )

    await user.click(screen.getByRole('button', { name: /^rewrite$/i }))
    expect(await screen.findByText(/REWRITTEN TEXT/)).toBeInTheDocument()

    // The user clicks elsewhere in the textarea — the caret collapses.
    rerender(<InlineRewrite body={BODY} selection={null} onReplace={() => false} />)

    // The charge already happened, so the result must survive.
    expect(screen.getByText(/REWRITTEN TEXT/)).toBeInTheDocument()
    expect(screen.getByText(/still charged/i)).toBeInTheDocument()
  })

  test('withdraws only the offer when the selection collapses, not the outcome', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <InlineRewrite body={BODY} selection={SELECTION} onReplace={() => false} />,
    )

    await user.click(screen.getByRole('button', { name: /^rewrite$/i }))
    await screen.findByText(/REWRITTEN TEXT/)
    rerender(<InlineRewrite body={BODY} selection={null} onReplace={() => false} />)

    // No selection means nothing to rewrite — the buttons should be gone...
    expect(screen.queryByRole('button', { name: /^rewrite$/i })).toBeNull()
    // ...but the paid result stays.
    expect(screen.getByText(/REWRITTEN TEXT/)).toBeInTheDocument()
  })

  test('discards the stranded rewrite only when the user says so', async () => {
    const user = userEvent.setup()
    render(<InlineRewrite body={BODY} selection={SELECTION} onReplace={() => false} />)

    await user.click(screen.getByRole('button', { name: /^rewrite$/i }))
    await screen.findByText(/REWRITTEN TEXT/)

    await user.click(screen.getByRole('button', { name: /discard this rewrite/i }))

    expect(screen.queryByText(/REWRITTEN TEXT/)).toBeNull()
  })

  test('keeps a failure visible after the selection collapses', async () => {
    const user = userEvent.setup()
    rewriteCaption.mockResolvedValue({
      ok: false,
      insufficient: false,
      message: 'The model returned an empty rewrite. You were not charged. Try again.',
    })
    const { rerender } = render(
      <InlineRewrite body={BODY} selection={SELECTION} onReplace={() => true} />,
    )

    await user.click(screen.getByRole('button', { name: /^rewrite$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not charged/i)

    rerender(<InlineRewrite body={BODY} selection={null} onReplace={() => true} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/not charged/i)
  })

  test('does not splice a successful rewrite twice', async () => {
    const user = userEvent.setup()
    const onReplace = vi.fn(() => true)
    render(<InlineRewrite body={BODY} selection={SELECTION} onReplace={onReplace} />)

    await user.click(screen.getByRole('button', { name: /^rewrite$/i }))

    expect(rewriteCaption).toHaveBeenCalledTimes(1)
    expect(onReplace).toHaveBeenCalledTimes(1)
  })

  test('counts the selection in code points so an emoji reads as one character', () => {
    // '🎉🎉' is 4 UTF-16 units but 2 characters — the engine counts the latter.
    const body = '🎉🎉 rest'
    render(<InlineRewrite body={body} selection={{ start: 0, end: 4 }} onReplace={() => true} />)

    expect(screen.getByText(/characters selected/i).textContent).toMatch(/\b2 characters/)
  })
})
