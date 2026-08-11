import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Post, PostMedia, PostVariant } from '@sahoda/shared'
import { toChannelSet } from '@sahoda/shared'

/**
 * The regression this file exists for:
 *
 * the body textarea carried `onBlur={() => setSelection(null)}` while the
 * rewrite toolbar returned null on an empty selection. `focusout` is a discrete
 * event, so React flushes it synchronously — mousedown on "Rewrite" blurred the
 * textarea, the toolbar unmounted, and `mouseup` landed on nothing, so **click
 * never fired**. Tabbing to the buttons blurred it too. One of the two paid AI
 * actions on this screen was unreachable by any input method, and it passed
 * typecheck, 461 unit tests and a production build.
 *
 * The server actions are mocked because this asserts reachability, not billing.
 */

const rewriteCaption = vi.fn()
const generateVariants = vi.fn()
const savePost = vi.fn()
const saveVariant = vi.fn()
const simulatePublish = vi.fn()
const attachMedia = vi.fn()
const detachMedia = vi.fn()

vi.mock('@/app/actions/posts-ai', () => ({
  rewriteCaption: (...args: unknown[]) => rewriteCaption(...args),
  generateVariants: (...args: unknown[]) => generateVariants(...args),
}))
vi.mock('@/app/actions/posts', () => ({
  savePost: (...args: unknown[]) => savePost(...args),
  saveVariant: (...args: unknown[]) => saveVariant(...args),
}))
vi.mock('@/app/actions/posts-publish', () => ({
  simulatePublish: (...args: unknown[]) => simulatePublish(...args),
}))
// The media pane refreshes the server render after an attach/detach. There is
// no app-router context in jsdom, so `useRouter` needs a stand-in.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
// The media pane now calls real server actions. `posts-media` reaches
// `lib/posts/read`, which is `server-only` — Next replaces a 'use server'
// module with an RPC stub on the client, but vitest resolves the real one.
vi.mock('@/app/actions/posts-media', () => ({
  attachMedia: (...args: unknown[]) => attachMedia(...args),
  detachMedia: (...args: unknown[]) => detachMedia(...args),
}))

const { PostEditor } = await import('./post-editor')

const BODY = 'Fresh chai every morning at the corner shop.'

const post: Post = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Morning chai',
  body: BODY,
  status: 'draft',
  channels: toChannelSet(['x']),
  scheduled_at: null,
  origin: 'manual',
  created_by: 'user_1',
  created_at: '2026-07-19T00:00:00.000Z',
  updated_at: '2026-07-19T00:00:00.000Z',
}

const variants: PostVariant[] = []
const media: PostMedia[] = []

/**
 * Select a range inside the body textarea the way a user drag would.
 *
 * React's `onSelect` comes from its SelectEventPlugin, which recomputes the
 * selection on focus/mouse/key events — a bare `select` dispatch does not reach
 * it. Setting the range and then releasing a key is what a real selection does.
 */
async function selectInBody(user: ReturnType<typeof userEvent.setup>, start: number, end: number) {
  const textarea = screen.getByLabelText(/body/i) as HTMLTextAreaElement
  await user.click(textarea)
  setRange(textarea, start, end)
  return textarea
}

function setRange(textarea: HTMLTextAreaElement, start: number, end: number) {
  textarea.setSelectionRange(start, end)
  fireEvent.keyUp(textarea, { key: 'Shift' })
}

beforeEach(() => {
  vi.clearAllMocks()
  rewriteCaption.mockResolvedValue({
    ok: true,
    text: 'REWRITTEN',
    balanceAfter: 99,
    creditsCharged: 1,
  })
  savePost.mockResolvedValue({ ok: true, postId: post.id, updatedAt: post.updated_at })
})

describe('post editor — inline rewrite reachability', () => {
  test('shows the rewrite toolbar once text is selected', async () => {
    const user = userEvent.setup()
    render(<PostEditor post={post} variants={variants} media={media} />)

    expect(screen.queryByRole('button', { name: /rewrite/i })).toBeNull()

    await selectInBody(user, 0, 10)

    expect(await screen.findByRole('button', { name: /rewrite/i })).toBeInTheDocument()
  })

  test('a mouse click on Rewrite actually invokes the action', async () => {
    const user = userEvent.setup()
    render(<PostEditor post={post} variants={variants} media={media} />)

    await selectInBody(user, 0, 10)
    const button = await screen.findByRole('button', { name: /^rewrite$/i })

    // The exact failure: mousedown blurs the textarea, the toolbar unmounts
    // mid-gesture, and mouseup/click never reach the button.
    await user.click(button)

    expect(rewriteCaption).toHaveBeenCalledTimes(1)
  })

  test('a keyboard activation on Rewrite also invokes the action', async () => {
    const user = userEvent.setup()
    render(<PostEditor post={post} variants={variants} media={media} />)

    await selectInBody(user, 0, 10)
    const button = await screen.findByRole('button', { name: /^rewrite$/i })

    button.focus()
    await user.keyboard('{Enter}')

    expect(rewriteCaption).toHaveBeenCalledTimes(1)
  })

  test('sends only the selected fragment, never the whole body', async () => {
    const user = userEvent.setup()
    render(<PostEditor post={post} variants={variants} media={media} />)

    await selectInBody(user, 0, 5)
    await user.click(await screen.findByRole('button', { name: /^rewrite$/i }))

    const [fragment] = rewriteCaption.mock.calls[0] ?? []
    expect(fragment).toBe(BODY.slice(0, 5))
    expect(fragment).not.toBe(BODY)
  })

  test('states the credit cost before the rewrite is clicked', async () => {
    const user = userEvent.setup()
    render(<PostEditor post={post} variants={variants} media={media} />)

    await selectInBody(user, 0, 10)
    await screen.findByRole('button', { name: /^rewrite$/i })

    // Cost before spend — the toolbar must price itself while still unclicked.
    // The numeral is wrapped for `tabular-nums`, so the copy spans elements.
    const note = screen.getByText(/uses/i)
    expect(note.textContent?.replace(/\s+/g, ' ')).toMatch(/uses 1 credit/i)
    expect(note.querySelector('.tabular-nums')).not.toBeNull()
    expect(rewriteCaption).not.toHaveBeenCalled()
  })

  test('hides the toolbar again when the selection collapses', async () => {
    const user = userEvent.setup()
    render(<PostEditor post={post} variants={variants} media={media} />)

    const textarea = await selectInBody(user, 0, 10)
    expect(await screen.findByRole('button', { name: /^rewrite$/i })).toBeInTheDocument()

    setRange(textarea, 4, 4)

    expect(screen.queryByRole('button', { name: /^rewrite$/i })).toBeNull()
  })
})
