import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * /remix ANSWERS "IS A RUN IN PROGRESS" THREE WAYS, AND USED TO ANSWER TWO.
 *
 * `readCurrentBatch` returned `null` both when a workspace had never remixed
 * anything and when the database refused to say, so a failed read put the
 * planner back on screen beside a run that may have been half done. Pressing it
 * plans the same work again, and the batch fee is charged again: the fix is that
 * a read which failed says so and offers reloading, which is a remedy that can
 * actually work, instead of offering to spend.
 *
 * These assert the CLAIM, not the wording: "could not read" must never carry the
 * planner or the write-first sentence, and a genuine absence must never carry
 * the read-failure sentence.
 */

const state = vi.hoisted(() => ({
  workspace: { status: 'ok', workspace: { id: 'ws_1', name: 'Acme' } } as
    | { status: 'ok'; workspace: { id: string; name: string } }
    | { status: 'none' }
    | { status: 'unreadable' },
  batch: { status: 'ok', batch: null } as
    { status: 'ok'; batch: { id: string; status: string } | null } | { status: 'unreadable' },
  posts: [] as { id: string; body: string | null }[],
}))

vi.mock('@/lib/workspaces', () => ({ activeWorkspaceRead: async () => state.workspace }))
vi.mock('@/lib/posts/read', () => ({ listPosts: async () => state.posts }))
vi.mock('@/lib/remix/read', () => ({
  readCurrentBatchOutcome: async () => state.batch,
  REMIX_UNREADABLE_COPY:
    'Sahoda could not read your remix batches, so this screen cannot say whether one is ' +
    'in progress. Reload to ask again.',
}))
vi.mock('@/components/remix/plan-batch', () => ({
  PlanBatch: () => <div data-testid="planner" />,
}))
vi.mock('@/components/remix/batch-preview', () => ({
  BatchPreview: () => <div data-testid="preview" />,
}))

const { default: RemixPage } = await import('./page')

beforeEach(() => {
  state.workspace = { status: 'ok', workspace: { id: 'ws_1', name: 'Acme' } }
  state.batch = { status: 'ok', batch: null }
  state.posts = [{ id: 'p1', body: 'A long enough post to be worth splitting up.' }]
})

describe('/remix: whether a run is in progress', () => {
  test('a read that failed says so, and offers no way to spend', async () => {
    state.batch = { status: 'unreadable' }
    render(await RemixPage())

    expect(screen.getByText(/could not read your remix runs/i)).toBeInTheDocument()
    expect(screen.getByText(/reload to ask again/i)).toBeInTheDocument()
    // The two things that must NOT be on screen: the planner (which spends) and
    // the write-first sentence (which is a claim about the workspace's posts,
    // and this read said nothing about those).
    expect(screen.queryByTestId('planner')).not.toBeInTheDocument()
    expect(screen.queryByText(/write something first/i)).not.toBeInTheDocument()
  })

  test('no run and a post to work from offers the planner', async () => {
    render(await RemixPage())

    expect(screen.getByTestId('planner')).toBeInTheDocument()
    expect(screen.queryByText(/could not read your remix/i)).not.toBeInTheDocument()
  })

  test('no run and nothing written says to write first, not that a read failed', async () => {
    state.posts = []
    render(await RemixPage())

    expect(screen.getByText(/write something first/i)).toBeInTheDocument()
    expect(screen.queryByText(/could not read your remix/i)).not.toBeInTheDocument()
  })
})
