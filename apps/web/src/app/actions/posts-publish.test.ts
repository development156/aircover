import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Channel } from '@sahoda/shared'

/**
 * `simulatePublish` only.
 *
 * These tests exist because the preview originally handed every variant straight
 * to the fixture adapter, which performs NO validation and returns success
 * unconditionally. A 600-character X variant therefore reported "would have been
 * accepted" for a post X rejects at 280 — a false green from the one feature
 * whose entire job is preflight, contradicting the red meter on the same screen.
 *
 * The load-bearing property is ORDER: `validateVariant` must gate the fixture,
 * never follow it. Moving the fixture call back above the check has to fail here.
 */

const state = vi.hoisted(() => ({
  post: null as { id: string; channels: Channel[] } | null,
  variants: [] as { id: string; channel: Channel; body: string; extras: unknown }[],
  publishCalls: [] as Channel[],
  media: [] as { id: string }[],
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }),
  // Derived from the SAME value the two-way mock returns, so every assertion in
  // this file still means what it meant. `workspaceForWrite` carries the REFUSAL
  // SENTENCE as well as the workspace — the split run 24 made, because "Create a
  // workspace first." was being said to people who had one.
  workspaceForWrite: async () => {
    const w = await Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' })
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
}))

vi.mock('@/lib/posts/read', () => ({
  getPost: () => Promise.resolve(state.post),
  listVariants: () => Promise.resolve(state.variants),
  listMedia: () => Promise.resolve(state.media),
}))

vi.mock('@sahoda/publishing', () => ({
  createFixtureAdapter: (channel: Channel) => ({
    channel,
    // Mirrors the real fixture: unconditional success, zero validation. If the
    // action ever calls this before validating, the test sees the channel here.
    publish: () => {
      state.publishCalls.push(channel)
      return Promise.resolve({
        platformPostId: `fixture-${channel}`,
        permalink: `fixture://${channel}/x`,
        publishedAt: '2026-07-19T00:00:00.000Z',
        mode: 'fixture' as const,
      })
    },
  }),
}))

const { simulatePublish } = await import('./posts-publish')

const POST_ID = '11111111-1111-4111-8111-111111111111'

function variant(channel: Channel, body: string) {
  return { id: `var-${channel}`, channel, body, extras: null }
}

beforeEach(() => {
  state.post = { id: POST_ID, channels: ['x'] }
  state.variants = [variant('x', 'Fresh chai every morning.')]
  state.publishCalls = []
})

describe('simulatePublish', () => {
  test('reports a within-limit variant as simulated', async () => {
    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.simulated.map((s) => s.channel)).toEqual(['x'])
    expect(result.blocked).toHaveLength(0)
  })

  test('blocks an over-limit variant instead of reporting it as accepted', async () => {
    // 300 > X's 280. The fixture would happily "accept" this.
    state.variants = [variant('x', 'a'.repeat(300))]

    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.simulated).toHaveLength(0)
    expect(result.blocked.map((b) => b.channel)).toEqual(['x'])
    expect(result.blocked[0]?.violations.map((v) => v.code)).toContain('MAX_CHARS')
  })

  test('never reaches the fixture adapter for a blocked variant', async () => {
    // The regression itself: the engine must gate the fixture, not follow it.
    state.variants = [variant('x', 'a'.repeat(300))]

    await simulatePublish(POST_ID)

    expect(state.publishCalls).toEqual([])
  })

  test('counts a link at its fixed weight, matching the live meter', async () => {
    // X weights any link at 23 regardless of length, so 270 visible chars plus a
    // short link is over 280 even though the raw string is not.
    state.variants = [variant('x', `${'a'.repeat(270)} https://s.co`)]

    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.blocked.map((b) => b.channel)).toEqual(['x'])
    expect(state.publishCalls).toEqual([])
  })

  test('blocks one channel without blocking another that is within its own limit', async () => {
    // 300 chars is over X's 280 but far under LinkedIn's 3000.
    state.post = { id: POST_ID, channels: ['x', 'linkedin'] }
    state.variants = [variant('x', 'a'.repeat(300)), variant('linkedin', 'a'.repeat(300))]

    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.blocked.map((b) => b.channel)).toEqual(['x'])
    expect(result.simulated.map((s) => s.channel)).toEqual(['linkedin'])
    expect(state.publishCalls).toEqual(['linkedin'])
  })

  // CONTRACT CHANGE 2026-08-04: instagram publishes via Zernio, so it is no longer
  // skipped as unpublishable. It is now BLOCKED when it has no photo, which is the
  // honest place for the block — the post is impossible, not the channel.
  test('blocks a photoless instagram post rather than skipping the channel', async () => {
    state.post = { id: POST_ID, channels: ['instagram'] }
    state.variants = [variant('instagram', 'A short caption.')]

    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.blocked.map((b) => b.channel)).toEqual(['instagram'])
    expect(result.blocked[0]?.violations.map((v) => v.code)).toEqual(['MEDIA_REQUIRED'])
    expect(result.simulated).toEqual([])
    expect(state.publishCalls).toEqual([])
  })

  test('blocks photoless instagram alongside a channel that did simulate', async () => {
    state.post = { id: POST_ID, channels: ['x', 'instagram'] }
    state.variants = [variant('x', 'Fresh chai.'), variant('instagram', 'A short caption.')]

    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.blocked.map((b) => b.channel)).toEqual(['instagram'])
    expect(result.simulated.map((s) => s.channel)).toEqual(['x'])
    // Blocked is neither a pass nor a skip — it must not inflate either list.
    expect(state.publishCalls).toEqual(['x'])
  })

  test('ignores a variant whose channel is no longer selected on the post', async () => {
    // The post_variants row survives a deselect; previewing it would report on
    // content that is no longer part of the post.
    state.post = { id: POST_ID, channels: ['x'] }
    state.variants = [variant('x', 'Still selected.'), variant('linkedin', 'Deselected.')]

    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.simulated.map((s) => s.channel)).toEqual(['x'])
    expect(state.publishCalls).toEqual(['x'])
  })

  test('every simulated result carries the fixture mode so the UI cannot mistake it', async () => {
    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const item of result.simulated) expect(item.mode).toBe('fixture')
  })

  test('does not expose the fixture permalink to the UI', async () => {
    const result = await simulatePublish(POST_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // A `fixture://` URL rendered anywhere invites being read as a real post.
    expect(JSON.stringify(result)).not.toContain('fixture://')
  })
})
