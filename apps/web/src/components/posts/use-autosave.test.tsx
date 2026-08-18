import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Post } from '@sahoda/shared'
import { toChannelSet } from '@sahoda/shared'

/**
 * The two regressions this file exists for.
 *
 *  A. `savePost` is a server action, so a dropped connection REJECTS the call —
 *     it does not resolve to `{ ok: false }`. `runSave` had no try/catch and
 *     `enqueue` swallowed the rejection, so `status` stayed on 'saving' and
 *     `error` stayed null forever: the editor read "Saving…" with no retry while
 *     the writer's text sat only in the browser.
 *
 *  B. The conflict banner fired on OUR OWN write's echo. `savePost` calls
 *     `revalidatePath`, so every successful save re-renders this route with the
 *     timestamp that save produced — and the old copy announced that as "Saved
 *     over a newer version of this post", a claim post-write timestamps cannot
 *     support.
 *
 * `savePost` is mocked because this asserts state machine honesty, not billing.
 */

const savePost = vi.fn()

vi.mock('@/app/actions/posts', () => ({
  savePost: (...args: unknown[]) => savePost(...args),
}))

const { useAutosave } = await import('./use-autosave')

const LOADED_AT = '2026-07-19T10:00:00.000Z'
const OUR_WRITE_AT = '2026-07-19T10:00:02.000Z'
const OUTSIDE_WRITE_AT = '2026-07-19T10:00:01.000Z'

const post: Post = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Morning chai',
  body: 'Fresh chai every morning at the corner shop.',
  status: 'draft',
  channels: toChannelSet(['x']),
  scheduled_at: null,
  origin: 'manual',
  created_by: 'user_1',
  created_at: LOADED_AT,
  updated_at: LOADED_AT,
}

const MY_TEXT = 'Fresh chai, and now a masala bun.'
const THEIR_TEXT = 'Fresh chai every evening at the corner shop.'

/**
 * The hook's whole surface as text and buttons. A harness rather than
 * `renderHook` so the assertions run against a committed React tree — the
 * deferral in the hook keys off effect timing, which only a real render has.
 */
function Harness({ current }: { current: Post }) {
  const autosave = useAutosave(current.id, current)
  return (
    <div>
      <span data-testid="status">{autosave.status}</span>
      <span data-testid="error">{autosave.error ?? ''}</span>
      <span data-testid="divergence">{autosave.divergence?.message ?? ''}</span>
      <span data-testid="body">{autosave.draft.body}</span>
      <button type="button" onClick={() => autosave.update({ body: MY_TEXT })}>
        edit
      </button>
      <button type="button" onClick={() => void autosave.flush()}>
        flush
      </button>
      <button type="button" onClick={autosave.loadTheirs}>
        load theirs
      </button>
      <button type="button" onClick={autosave.keepMine}>
        keep mine
      </button>
    </div>
  )
}

function press(label: string) {
  return screen.getByRole('button', { name: label })
}

function statusText(): string {
  return screen.getByTestId('status').textContent ?? ''
}

function errorText(): string {
  return screen.getByTestId('error').textContent ?? ''
}

function divergenceText(): string {
  return screen.getByTestId('divergence').textContent ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  savePost.mockResolvedValue({ ok: true, postId: post.id, updatedAt: OUR_WRITE_AT })
})

describe('useAutosave — a save that never lands', () => {
  test('surfaces an error instead of sitting on "saving" when the action rejects', async () => {
    savePost.mockRejectedValue(new Error('Failed to fetch'))
    const user = userEvent.setup()
    render(<Harness current={post} />)

    await user.click(press('edit'))
    await user.click(press('flush'))

    // The exact failure: the rejection was swallowed, so this stayed 'saving'
    // and the writer was told their text was on its way.
    await waitFor(() => expect(statusText()).toBe('error'))
    expect(errorText()).not.toBe('')
  })

  test('never reports the text as saved when the action rejects', async () => {
    savePost.mockRejectedValue(new Error('Failed to fetch'))
    const user = userEvent.setup()
    render(<Harness current={post} />)

    await user.click(press('edit'))
    await user.click(press('flush'))

    await waitFor(() => expect(statusText()).toBe('error'))
    expect(statusText()).not.toBe('saved')
    expect(screen.getByTestId('body')).toHaveTextContent(MY_TEXT)
  })

  test('says the server was unreachable without inventing a server message', async () => {
    savePost.mockRejectedValue(new Error('TypeError: NetworkError when attempting to fetch'))
    const user = userEvent.setup()
    render(<Harness current={post} />)

    await user.click(press('edit'))
    await user.click(press('flush'))

    await waitFor(() => expect(errorText()).not.toBe(''))
    // The thrown Error's text is a transport detail, not copy for a writer.
    expect(errorText()).not.toMatch(/TypeError|NetworkError|fetch/i)
    expect(errorText()).toMatch(/^[A-Z][a-z]/)
  })

  test('retries on demand and reaches saved once the server comes back', async () => {
    savePost.mockRejectedValueOnce(new Error('Failed to fetch'))
    const user = userEvent.setup()
    render(<Harness current={post} />)

    await user.click(press('edit'))
    await user.click(press('flush'))
    await waitFor(() => expect(statusText()).toBe('error'))

    // A writer who has stopped typing must have a way back: the debounce only
    // re-fires on the next edit.
    await user.click(press('flush'))

    await waitFor(() => expect(statusText()).toBe('saved'))
    expect(errorText()).toBe('')
    expect(savePost).toHaveBeenCalledTimes(2)
  })
})

describe('useAutosave — divergence', () => {
  test('stays silent when the re-render carries our own write timestamp', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness current={post} />)

    await user.click(press('edit'))
    await user.click(press('flush'))
    await waitFor(() => expect(statusText()).toBe('saved'))

    // `savePost` revalidates, so the route re-renders with the row our own save
    // produced. Announcing that as an outside change is the false alarm.
    rerender(<Harness current={{ ...post, updated_at: OUR_WRITE_AT, body: MY_TEXT }} />)

    expect(divergenceText()).toBe('')
  })

  test('stays silent when our write echoes back before the action resolves', async () => {
    let settle: (value: unknown) => void = () => {}
    savePost.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve
        }),
    )
    const user = userEvent.setup()
    const { rerender } = render(<Harness current={post} />)

    await user.click(press('edit'))
    await user.click(press('flush'))
    await waitFor(() => expect(statusText()).toBe('saving'))

    // The revalidated tree can reach React before the action's promise settles.
    // Judging it here would blame our own in-flight save.
    rerender(<Harness current={{ ...post, updated_at: OUR_WRITE_AT, body: MY_TEXT }} />)
    expect(divergenceText()).toBe('')

    settle({ ok: true, postId: post.id, updatedAt: OUR_WRITE_AT })

    await waitFor(() => expect(statusText()).toBe('saved'))
    expect(divergenceText()).toBe('')
  })

  test('announces a read the editor did not produce, with no save of ours involved', async () => {
    // Any other action on this route (`saveVariant`, `simulatePublish`) calls
    // `revalidatePath`, so a row someone else wrote arrives with no save of ours.
    const { rerender } = render(<Harness current={post} />)
    rerender(<Harness current={{ ...post, updated_at: OUTSIDE_WRITE_AT, body: THEIR_TEXT }} />)

    await waitFor(() => expect(divergenceText()).not.toBe(''))
    expect(savePost).not.toHaveBeenCalled()
  })

  test('claims neither a save nor an overwrite it cannot prove', async () => {
    const { rerender } = render(<Harness current={post} />)
    rerender(<Harness current={{ ...post, updated_at: OUTSIDE_WRITE_AT, body: THEIR_TEXT }} />)

    await waitFor(() => expect(divergenceText()).not.toBe(''))
    expect(divergenceText()).not.toMatch(/saved|overwrote|overwritten|over a newer|replaced/i)
  })

  test('announces the same read only once, not on every following re-render', async () => {
    const { rerender } = render(<Harness current={post} />)
    rerender(<Harness current={{ ...post, updated_at: OUTSIDE_WRITE_AT, body: THEIR_TEXT }} />)
    await waitFor(() => expect(divergenceText()).not.toBe(''))

    const user = userEvent.setup()
    await user.click(press('keep mine'))
    expect(divergenceText()).toBe('')

    // Same timestamp, fresh object: already accounted for, so no second notice.
    rerender(<Harness current={{ ...post, updated_at: OUTSIDE_WRITE_AT, body: THEIR_TEXT }} />)
    expect(divergenceText()).toBe('')
  })

  test('loads the other version into the draft when the writer picks it', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness current={post} />)

    await user.click(press('edit'))
    rerender(<Harness current={{ ...post, updated_at: OUTSIDE_WRITE_AT, body: THEIR_TEXT }} />)
    await waitFor(() => expect(divergenceText()).not.toBe(''))

    await user.click(press('load theirs'))

    // The content offered is the one that came with THAT read, not a local guess.
    expect(screen.getByTestId('body')).toHaveTextContent(THEIR_TEXT)
    expect(divergenceText()).toBe('')
  })

  test('writes the local draft when the writer keeps it, even with nothing edited', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness current={post} />)

    rerender(<Harness current={{ ...post, updated_at: OUTSIDE_WRITE_AT, body: THEIR_TEXT }} />)
    await waitFor(() => expect(divergenceText()).not.toBe(''))

    // "Keep mine" is only true if it actually reaches the row — the row holds
    // the other version now, so the unchanged-draft shortcut must be bypassed.
    await user.click(press('keep mine'))

    await waitFor(() => expect(savePost).toHaveBeenCalledTimes(1))
    const [, patch] = savePost.mock.calls[0] ?? []
    expect(patch).toMatchObject({ body: post.body })
  })
})

/**
 * WHAT A BACK PRESS COSTS THE PERSON WRITING.
 *
 * The cleanup used to `clearTimeout` the pending write and stop, which is not
 * cancelling a save — it is discarding what the writer typed. MEASURED in a
 * browser on a real post: type into the body, press browser Back within the 2s
 * debounce, come back — the field is EMPTY. Wait past the 2s, do exactly the
 * same thing, and the text is there. That pair is what makes it the WINDOW and
 * not a mis-aimed selector.
 *
 * A client-routed Back fires no unload event. What is asserted below is the
 * TEARDOWN contract: a genuine unmount inside the window writes instead of
 * discarding. It is real but it was never the browser fix — run 24 measured why
 * (the segment does not unmount at all, and the action that popstate does fire is
 * killed by the navigation), and closed the browser case with the recovery buffer
 * asserted further down.
 * Found by
 * enumerating the sibling of the create flow's blur-only save rather than by
 * waiting for it to be reported — the two surfaces where a person types a post
 * body both dropped work, in two different ways.
 */
describe('useAutosave — leaving the page inside the debounce window', () => {
  test('writes the pending edit on unmount instead of discarding it', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness current={post} />)

    await user.click(press('edit'))
    // Still inside the debounce: nothing has been written yet, which is the
    // trade the debounce exists for and is kept.
    expect(savePost).not.toHaveBeenCalled()

    unmount()

    await waitFor(() => expect(savePost).toHaveBeenCalledTimes(1))
    expect(savePost).toHaveBeenCalledWith(post.id, expect.objectContaining({ body: MY_TEXT }))
  })

  test('unmounting with nothing pending writes nothing', async () => {
    const { unmount } = render(<Harness current={post} />)

    unmount()

    // `runSave` compares against the last confirmed snapshot, so a teardown with
    // no edit must not put a redundant write on the wire — every mounted editor
    // in the app would otherwise save on every navigation.
    await waitFor(() => expect(savePost).not.toHaveBeenCalled())
  })
})

/**
 * THE CRASH BUFFER — what finally closed the Back case.
 *
 * Three fixes were tried on the way out and all three failed for one measured
 * reason. In a real browser, typing into the body and pressing Back:
 *
 *   the effect cleanup never ran        (Next keeps the segment in its router
 *                                        cache; nothing is torn down)
 *   popstate DID fire and the action
 *   went out with the right words       REQ /posts/<id> :: {"body":"EDITOR TEXT…"}
 *   and the navigation killed it        FAILED … :: net::ERR_ABORTED
 *
 * A server action cannot outlive the navigation that triggers it, so no moment
 * to send is the answer. Every change is written to `sessionStorage` instead —
 * synchronously, where nothing can abort it — and the next mount hands it back.
 *
 * VERIFIED IN A REAL BROWSER, both halves:
 *   FIELD                  -> "EDITOR TEXT typed and never blurred."
 *   ROW AFTER BUFFER WIPED -> "EDITOR TEXT typed and never blurred."
 * The second is the one that matters: the recovery re-enters `update()`, so the
 * words reach the database and not merely the textarea.
 */
describe('useAutosave — recovering what a navigation cancelled', () => {
  test('writes every change to the buffer, synchronously', async () => {
    const user = userEvent.setup()
    render(<Harness current={post} />)

    await user.click(press('edit'))

    // No debounce, no await: this is the point — it is already there.
    const raw = sessionStorage.getItem(`sahoda.draft.${post.id}`)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ body: MY_TEXT })
  })

  test('hands the buffered text back on the next mount', async () => {
    sessionStorage.setItem(
      `sahoda.draft.${post.id}`,
      JSON.stringify({
        ...post,
        title: post.title,
        body: MY_TEXT,
        channels: post.channels,
        scheduledAt: null,
      }),
    )

    render(<Harness current={post} />)

    // The customer's own words, returned to them — not a conflict, because
    // nobody else wrote them.
    await waitFor(() => expect(screen.getByTestId('body').textContent).toBe(MY_TEXT))
  })

  test('the recovered draft reaches the ROW, not just the textarea', async () => {
    sessionStorage.setItem(
      `sahoda.draft.${post.id}`,
      JSON.stringify({
        title: post.title,
        body: MY_TEXT,
        channels: post.channels,
        scheduledAt: null,
      }),
    )

    render(<Harness current={post} />)

    // Recovery goes through `update()`, so it inherits the debounce and saves
    // itself. A buffer that only repopulated the field would lose the text again
    // on the next device.
    await waitFor(
      () =>
        expect(savePost).toHaveBeenCalledWith(post.id, expect.objectContaining({ body: MY_TEXT })),
      {
        timeout: 4000,
      },
    )
  })

  test('a confirmed save clears the buffer', async () => {
    const user = userEvent.setup()
    render(<Harness current={post} />)

    await user.click(press('edit'))
    await user.click(press('flush'))

    await waitFor(() => expect(sessionStorage.getItem(`sahoda.draft.${post.id}`)).toBeNull())
  })

  test('a buffer matching the row is discarded rather than re-saved', async () => {
    sessionStorage.setItem(
      `sahoda.draft.${post.id}`,
      JSON.stringify({
        title: post.title,
        body: post.body,
        channels: post.channels,
        scheduledAt: null,
      }),
    )

    render(<Harness current={post} />)

    // Nothing to recover. Adopting it anyway would mark a clean editor unsaved
    // and put a redundant write on the wire on every visit to every post.
    await waitFor(() => expect(sessionStorage.getItem(`sahoda.draft.${post.id}`)).toBeNull())
    expect(savePost).not.toHaveBeenCalled()
  })
})
