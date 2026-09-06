import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The routing signal, derived from the ONE brain read the screen already makes.
 *
 * Every arm below is about keeping three facts apart: "this workspace never
 * onboarded" (the only arm that may redirect), "we could not tell", and "there
 * is no workspace at all". Collapsing any two is how a transient failure sends
 * a paying customer back to the first screen of onboarding.
 */
const state = vi.hoisted(() => ({
  brain: { status: 'no-brain' } as { status: string },
  calls: 0,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/brand/read-brain', () => ({
  readBrain: () => {
    state.calls += 1
    return Promise.resolve(state.brain)
  },
}))

beforeEach(() => {
  state.brain = { status: 'no-brain' }
  state.calls = 0
  // React `cache` memoises per request; each test is a fresh "request".
  vi.resetModules()
})

async function read() {
  const mod = await import('./read-onboarding-state')
  return mod.onboardingStateRead()
}

describe('the workspace answer comes first', () => {
  test('no workspace reads no-workspace', async () => {
    state.brain = { status: 'no-workspace' }
    await expect(read()).resolves.toEqual({ status: 'no-workspace' })
  })

  test('an unreadable workspace reads unreadable', async () => {
    state.brain = { status: 'unreadable' }
    await expect(read()).resolves.toEqual({ status: 'unreadable' })
  })
})

describe('with a workspace, the brain decides', () => {
  test('an active brain means completed', async () => {
    state.brain = { status: 'ok' }
    await expect(read()).resolves.toEqual({ status: 'completed' })
  })

  test('no brain means not-started', async () => {
    state.brain = { status: 'no-brain' }
    await expect(read()).resolves.toEqual({ status: 'not-started' })
  })

  /**
   * THE WHOLE POINT. A read that did not answer must never read as "this
   * workspace has no brain" — that is the arm that redirects.
   */
  test('a failed read reads unreadable, never not-started', async () => {
    state.brain = { status: 'unreadable' }
    await expect(read()).resolves.toEqual({ status: 'unreadable' })
  })

  test('an errored read and an empty one disagree', async () => {
    state.brain = { status: 'no-brain' }
    const empty = await read()
    vi.resetModules()
    state.brain = { status: 'unreadable' }
    const failed = await read()
    expect(empty).not.toEqual(failed)
  })

  test('it asks the brain read, and nothing else', async () => {
    await read()
    expect(state.calls).toBe(1)
  })
})
