import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PostVariant } from '@sahoda/shared'

/**
 * F-14 · THE ADDRESS BAR FOLLOWS THE ROW, AND A LOST DRAFT IS OFFERED BACK.
 *
 * ── THE ADDRESS ──────────────────────────────────────────────────────────────
 * The URL used to switch to `/posts/<id>` only once `autosave.status` read
 * `saved`. A save that stayed in flight, or errored, left the writer on
 * `/posts/new` with a real row behind it, and a reload from there opened an
 * EMPTY editor over that row (the buffer is keyed by id, and `new` is not it).
 * Founder's ruling: the address changes the moment the row exists.
 *
 * ── THE BUFFER ───────────────────────────────────────────────────────────────
 * `draft-recovery.ts` keeps a crash buffer per post id in `sessionStorage`. A
 * writer who lost a tab mid-sentence and comes back through "Create post"
 * lands on `/posts/new`, where the buffer for THEIR post is never consulted.
 * So `/posts/new` now looks for one and offers the way back, instead of an
 * empty editor beside a draft it could have restored.
 */

const NEW_ID = '33333333-3333-4333-8333-333333333333'
const LOST_ID = '44444444-4444-4444-8444-444444444444'

const createPost = vi.fn()
const savePost = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/posts/new',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/posts-ai', () => ({
  rewriteSelection: vi.fn(),
  generateVariants: vi.fn(),
  rewriteCaption: vi.fn(),
}))
vi.mock('@/app/actions/posts', () => ({
  createPost: (...args: unknown[]) => createPost(...args),
  savePost: (...args: unknown[]) => savePost(...args),
  saveVariant: vi.fn(),
  setVariantFormat: vi.fn(),
}))
vi.mock('@/app/actions/posts-schedule', () => ({ schedulePost: vi.fn(), cancelSchedule: vi.fn() }))
vi.mock('@/app/actions/posts-publish', () => ({ simulatePublish: vi.fn() }))
vi.mock('@/app/actions/posts-review', () => ({ sendForReview: vi.fn(), returnToDraft: vi.fn() }))
vi.mock('@/app/actions/templates', () => ({ saveTemplate: vi.fn(), deleteTemplate: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const { Composer } = await import('./composer')

function composer() {
  return render(
    <Composer
      post={null}
      zone="Asia/Kolkata"
      variants={[] as PostVariant[]}
      media={[]}
      templates={{ status: 'ok', templates: [] }}
    />,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  createPost.mockReset()
  savePost.mockReset()
  window.history.replaceState(null, '', '/posts/new')
})

afterEach(cleanup)

describe('the address follows the row', () => {
  test('switches to /posts/<id> as soon as the row exists, while the save is still in flight', async () => {
    createPost.mockResolvedValue({ ok: true, postId: NEW_ID })
    // The save NEVER resolves. Under the old rule the address could not change
    // until it did; under the new one the row's existence is enough.
    savePost.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    composer()

    await user.type(screen.getByLabelText('Your post'), 'Chai.')
    await user.click(screen.getByRole('button', { name: /^save as draft$/i }))

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.location.pathname).toBe(`/posts/${NEW_ID}`))
    expect(screen.getByText('Saving your post…')).toBeInTheDocument()
  })

  test('does not touch the address while no row exists', async () => {
    composer()
    await waitFor(() => expect(screen.getByText('No changes yet')).toBeInTheDocument())
    expect(window.location.pathname).toBe('/posts/new')
  })
})

describe('a lost draft is offered back on /posts/new', () => {
  test('a crash buffer for an existing post becomes a link to it', async () => {
    sessionStorage.setItem(
      `sahoda.draft.${LOST_ID}`,
      JSON.stringify({ title: 'Diwali', body: 'Half price', channels: ['x'], scheduledAt: null }),
    )
    composer()

    const link = await screen.findByRole('link', { name: /continue your saved draft/i })
    expect(link).toHaveAttribute('href', `/posts/${LOST_ID}`)
    // Not restored INTO this editor: the words belong to that post's row.
    expect((screen.getByLabelText('Your post') as HTMLTextAreaElement).value).toBe('')
  })

  test('with no buffer there is no offer', async () => {
    composer()
    await waitFor(() => expect(screen.getByText('No changes yet')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /continue your saved draft/i })).toBeNull()
  })

  test('the pre-row buffer under "new" is not an existing post and gets no link', async () => {
    sessionStorage.setItem(
      'sahoda.draft.new',
      JSON.stringify({ title: '', body: 'typed', channels: [], scheduledAt: null }),
    )
    composer()
    await waitFor(() =>
      expect((screen.getByLabelText('Your post') as HTMLTextAreaElement).value).toBe('typed'),
    )
    expect(screen.queryByRole('link', { name: /continue your saved draft/i })).toBeNull()
  })
})
