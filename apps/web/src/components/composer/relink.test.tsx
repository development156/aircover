import { describe, expect, test, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PostVariant } from '@sahoda/shared'

import { useVariants } from '@/components/posts/use-variants'

import { RelinkControl } from './relink-control'

vi.mock('@/app/actions/posts', () => ({
  saveVariant: vi.fn(async () => ({ ok: true as const, version: 2 })),
  createPost: vi.fn(),
  setVariantFormat: vi.fn(),
}))

/**
 * RELINK — the half of FSD §3.1 that was never built, and the one rule it has
 * to keep: NEVER SILENTLY DISCARD WRITTEN WORDS.
 *
 * ── WHAT WOULD MAKE THESE TESTS WORTHLESS ────────────────────────────────────
 * Asserting that relink sets `following: true` and stopping. That passes against
 * an implementation that overwrites the writer's copy with no way back, which is
 * the naive reading of "relink re-syncs from canonical" and is exactly what must
 * not ship. So every test below is about the WORDS: where they went, whether they
 * can come back, and whether anything was written to the row.
 */

const VARIANT = (body: string): PostVariant =>
  ({
    id: 'v1',
    workspace_id: 'w',
    post_id: 'p',
    channel: 'x',
    body,
    extras: {},
    publish_status: 'pending',
    permalink: null,
    platform_post_id: null,
    last_error: null,
    scheduled_at: null,
    published_at: null,
    created_at: '',
    updated_at: '',
  }) as unknown as PostVariant

const ADAPTED = 'Chai in 60 characters or fewer, because X counts.'
const POST = 'We rewrote the whole post this morning and it is much longer now.'

function harness(body = ADAPTED) {
  return renderHook(() => useVariants(() => 'post-1', [VARIANT(body)], undefined, POST))
}

describe('relink brings a detached channel back', () => {
  test('a channel written independently does not follow the post', () => {
    const { result } = harness()
    expect(result.current.states.x.following).toBe(false)
    expect(result.current.states.x.body).toBe(ADAPTED)
  })

  test('relink mirrors the post’s CURRENT body, not the one at page load', () => {
    const { result } = harness()
    const later = 'The post changed again after the page loaded.'
    act(() => result.current.relink('x', later))
    expect(result.current.states.x.body).toBe(later)
    expect(result.current.states.x.following).toBe(true)
  })

  test('and it keeps following: a later edit to the post moves it', () => {
    const { result } = harness()
    act(() => result.current.relink('x', POST))
    act(() => result.current.mirrorSource('and again'))
    expect(result.current.states.x.body).toBe('and again')
  })
})

describe('the written words are not discarded', () => {
  test('the replaced copy is kept, character for character', () => {
    const { result } = harness()
    act(() => result.current.relink('x', POST))
    expect(result.current.states.x.relinkedFrom).toBe(ADAPTED)
  })

  test('undo restores it exactly, and detaches again', () => {
    const { result } = harness()
    act(() => result.current.relink('x', POST))
    act(() => result.current.undoRelink('x'))
    expect(result.current.states.x.body).toBe(ADAPTED)
    expect(result.current.states.x.following).toBe(false)
    expect(result.current.states.x.relinkedFrom).toBeNull()
  })

  test('NOTHING IS WRITTEN — the row still holds the original until a save', async () => {
    const { saveVariant } = await import('@/app/actions/posts')
    const { result } = harness()
    act(() => result.current.relink('x', POST))
    // The one assertion that separates a safe relink from a destructive one.
    expect(saveVariant).not.toHaveBeenCalled()
    // And the box says so.
    expect(result.current.states.x.dirty).toBe(true)
  })

  test('a relink that changes nothing still offers the way back', () => {
    // The channel's copy happens to equal the post. `dirty` is a claim about the
    // ROW, which still holds this channel's own copy, so it is true either way.
    const { result } = harness(POST)
    act(() => result.current.relink('x', POST))
    expect(result.current.states.x.dirty).toBe(true)
    expect(result.current.states.x.relinkedFrom).toBe(POST)
  })

  test('typing on top of a relinked body withdraws the undo', () => {
    // Otherwise "Put my copy back" would throw away the keystrokes that came
    // after — a second silent discard, which is the thing this is built not to do.
    const { result } = harness()
    act(() => result.current.relink('x', POST))
    act(() => result.current.setBody('x', POST + ' plus my own line'))
    expect(result.current.states.x.relinkedFrom).toBeNull()
    act(() => result.current.undoRelink('x'))
    expect(result.current.states.x.body).toBe(POST + ' plus my own line')
  })

  test('a generated variant withdraws it too', () => {
    const { result } = harness()
    act(() => result.current.relink('x', POST))
    act(() =>
      result.current.applyGenerated([{ channel: 'x', body: 'AI wrote this', charCount: 13 }]),
    )
    expect(result.current.states.x.relinkedFrom).toBeNull()
  })

  test('relinking a channel that already follows changes nothing at all', () => {
    const { result } = harness()
    act(() => result.current.relink('x', POST))
    const after = result.current.states.x
    act(() => result.current.relink('x', 'something else entirely'))
    // Critically, `relinkedFrom` is not overwritten with the mirrored body — the
    // Undo would then restore text the writer never typed.
    expect(result.current.states.x).toEqual(after)
    expect(result.current.states.x.relinkedFrom).toBe(ADAPTED)
  })
})

describe('the control itself', () => {
  const state = (over: Record<string, unknown>) =>
    ({
      body: ADAPTED,
      extras: {},
      dirty: false,
      saving: false,
      error: null,
      conflict: null,
      version: 1,
      following: false,
      permalink: null,
      relinkedFrom: null,
      ...over,
    }) as never

  test('offers the relink when the channel has its own copy', () => {
    render(
      <RelinkControl
        label="X"
        state={state({})}
        canonicalBody={POST}
        onRelink={() => {}}
        onUndo={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /follow the post again/i })).toBeInTheDocument()
  })

  test('shows nothing when there is nothing to do', () => {
    const { container, rerender } = render(
      <RelinkControl
        label="X"
        state={state({ following: true })}
        canonicalBody={POST}
        onRelink={() => {}}
        onUndo={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
    // Already identical to the post: relinking would swap a string for itself.
    rerender(
      <RelinkControl
        label="X"
        state={state({ body: POST })}
        canonicalBody={POST}
        onRelink={() => {}}
        onUndo={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('says nothing was written, in those words, and offers the copy back', async () => {
    const onUndo = vi.fn()
    render(
      <RelinkControl
        label="X"
        state={state({ following: true, relinkedFrom: ADAPTED })}
        canonicalBody={POST}
        onRelink={() => {}}
        onUndo={onUndo}
      />,
    )
    // READ THE TEXT, not the box: the promise this control makes is the reason
    // it is allowed to replace the writer's words without asking first.
    expect(screen.getByText(/nothing was written/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /put my X copy back/i }))
    expect(onUndo).toHaveBeenCalledOnce()
  })
})
