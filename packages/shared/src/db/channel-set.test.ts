import { describe, it, expect } from 'vitest'

import { toChannelSet, EMPTY_CHANNEL_SET } from './channel-set'
import { PostSchema, PostInsertSchema, PostUpdateSchema } from './content'

const UUID = '00000000-0000-0000-0000-000000000000'

/**
 * ── THE MUTATION THIS FILE EXISTS TO CATCH ───────────────────────────────────
 * Delete the `new Set` from `toChannelSet` — i.e. make it
 * `return [...channels] as unknown as ChannelSet` — and every test named
 * "collapses a repeated channel …" below must fail, along with the consumer
 * tests in apps/web that render the count, the names and the React keys:
 *
 *   apps/web/src/lib/posts/connection-gap.test.ts
 *   apps/web/src/components/posts/publish-now.test.tsx
 *   apps/web/src/components/posts/schedule-field.test.tsx
 *   apps/web/src/components/posts/post-card.test.tsx
 *
 * If only THIS file fails, the boundary is proven but the consumers are not —
 * which is exactly the state that let three of these ship. The consumer tests
 * must have no dedupe of their own left to fall back on.
 */

const postRow = (channels: string[]) => ({
  id: UUID,
  workspace_id: UUID,
  title: 'A post',
  body: 'Body',
  status: 'draft',
  channels,
  scheduled_at: null,
  origin: 'manual',
  created_by: 'user_1',
  created_at: '2026-08-11T00:00:00.000Z',
  updated_at: '2026-08-11T00:00:00.000Z',
})

describe('toChannelSet', () => {
  it('collapses a repeated channel to one entry', () => {
    // Arrange
    const raw = ['linkedin', 'linkedin'] as const

    // Act
    const set = toChannelSet(raw)

    // Assert
    expect(set).toEqual(['linkedin'])
  })

  it('keeps first-seen order rather than sorting', () => {
    // The chips, the variant tab strip and the "reconnect these" sentence all
    // render this order. Sorting would reshuffle the tabs on every toggle.
    expect(toChannelSet(['linkedin', 'x', 'gbp'])).toEqual(['linkedin', 'x', 'gbp'])
  })

  it('collapses a repeated channel without moving the survivors', () => {
    expect(toChannelSet(['x', 'linkedin', 'x', 'gbp'])).toEqual(['x', 'linkedin', 'gbp'])
  })

  it('EMPTY_CHANNEL_SET is an empty set, not a shared mutable array', () => {
    expect(EMPTY_CHANNEL_SET).toEqual([])
    expect(PostInsertSchema.parse({ workspace_id: UUID, created_by: 'user_1' }).channels).toEqual(
      [],
    )
  })
})

describe('the posts row boundary', () => {
  it('collapses a repeated channel on the way OUT of the database', () => {
    // Arrange — `posts.channels` is a bare `text[]`: nothing in Postgres stops
    // this row existing, and the planner writes the column untouched.
    const row = postRow(['linkedin', 'linkedin'])

    // Act
    const parsed = PostSchema.parse(row)

    // Assert — no consumer downstream of this parse can see the duplicate.
    expect(parsed.channels).toEqual(['linkedin'])
  })

  it('collapses a repeated channel on the way IN, so the row is never written', () => {
    // The editor is not the only writer: `apps/jobs` writes AI-planned briefs,
    // and a model that names a channel twice would otherwise create the very
    // row this boundary has to keep cleaning up.
    expect(PostUpdateSchema.parse({ channels: ['x', 'x', 'gbp'] }).channels).toEqual(['x', 'gbp'])
    expect(
      PostInsertSchema.parse({
        workspace_id: UUID,
        created_by: 'user_1',
        channels: ['gbp', 'gbp'],
      }).channels,
    ).toEqual(['gbp'])
  })

  it('still rejects a channel that is not one of the four', () => {
    // The transform must not have swallowed the validation it sits on top of.
    expect(PostSchema.safeParse(postRow(['linkedin', 'tiktok'])).success).toBe(false)
  })

  it('leaves an already-distinct list exactly as it was', () => {
    expect(PostSchema.parse(postRow(['x', 'gbp', 'linkedin'])).channels).toEqual([
      'x',
      'gbp',
      'linkedin',
    ])
  })
})
