import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { describe, it, expect, beforeEach } from 'vitest'
import type { PublishPostPayload } from '@sahoda/shared'

import { createPublishStore } from './store'

/**
 * `post_variants` row → `PublishVariant`, EXECUTED rather than assumed.
 *
 * ── WHY THIS FILE EXISTS, AND THE MUTATION THAT DEMANDED IT ──────────────────
 * `keyword-brackets.test.ts` drives `runPublishPost` with a variant built by
 * hand, so it proves the publisher HONOURS the choice and proves nothing about
 * where the choice comes from. MEASURED: deleting `keywordBrackets:
 * readKeywordBrackets(row.extras)` from `loadVariant` left that file, and the
 * whole of `apps/jobs`, green. `store-options.test.ts` has the same shape — it
 * calls `readOptions` directly, never the loader that must call it.
 *
 * That is the identical hole the brackets bug lived in: both ends tested, the
 * seam between them not. A reader that nothing invokes is a reader that can be
 * removed silently, which is exactly how the Google button and then this box
 * came to collect an answer no publish acted on.
 *
 * So this runs the real `loadVariant` against real Postgres. What it does NOT
 * prove is the production `post_variants` DDL — the table below carries only the
 * columns this query touches, and schema drift stays the live suite's job.
 */

/** The four columns `loadVariant`'s select names, plus the media table it joins. */
const DDL = `
  create table post_variants (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null,
    workspace_id uuid not null,
    body text not null,
    extras jsonb,
    format text
  );
  create table post_media (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null,
    workspace_id uuid not null,
    storage_path text not null,
    mime text,
    bytes bigint,
    created_at timestamptz not null default now()
  )
`

const WS = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'

function poolOver(db: PGlite): Pool {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
  } as unknown as Pool
}

describe('loadVariant reads the writer’s choices off the row (real Postgres)', () => {
  let db: PGlite
  let store: ReturnType<typeof createPublishStore>

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    store = createPublishStore({ pool: poolOver(db) })
  })

  /** Insert one variant with the given extras and load it back through the store. */
  const loadWith = async (extras: unknown) => {
    const r = await db.query<{ id: string }>(
      `insert into post_variants (post_id, workspace_id, body, extras)
       values ($1, $2, 'Monsoon chai.', $3) returning id`,
      [POST, WS, extras === undefined ? null : JSON.stringify(extras)],
    )
    const variantId = r.rows[0]!.id
    const payload: PublishPostPayload = {
      workspaceId: WS,
      postId: POST,
      variantId,
      channel: 'x',
      scheduledAt: '2026-08-30T10:00:00.000Z',
    }
    return store.loadVariant(payload)
  }

  it('carries an unticked box through to the variant', async () => {
    // THE ONE THAT WAS BROKEN. The column held `false`, the loader never looked,
    // and the publisher defaulted back to brackets on every real send.
    const variant = await loadWith({ hashtags: ['chai', 'pune'], keywordBrackets: false })
    expect(variant?.keywordBrackets).toBe(false)
    expect(variant?.hashtags).toEqual(['chai', 'pune'])
  })

  it('carries a ticked box through as a stated choice', async () => {
    const variant = await loadWith({ hashtags: ['chai'], keywordBrackets: true })
    expect(variant?.keywordBrackets).toBe(true)
  })

  it('leaves the choice unstated when the row has no such key', async () => {
    // Undefined, not false: `formatForPlatform` reads absence as brackets, and
    // every variant written before the box shipped must keep publishing as it did.
    const variant = await loadWith({ hashtags: ['chai'] })
    expect(variant?.keywordBrackets).toBeUndefined()
  })

  it('ignores a junk value rather than failing the publish', async () => {
    // `extras` is one shared jsonb column several lanes write. A shape this code
    // does not recognise drops the field; it never takes the post down.
    const variant = await loadWith({ hashtags: ['chai'], keywordBrackets: 'false' })
    expect(variant?.keywordBrackets).toBeUndefined()
    expect(variant?.hashtags).toEqual(['chai'])
  })

  it('survives a row with no extras at all', async () => {
    const variant = await loadWith(undefined)
    expect(variant?.keywordBrackets).toBeUndefined()
    expect(variant?.body).toBe('Monsoon chai.')
  })

  it('still carries the controls the loader already read', async () => {
    // The other two values that travel this same seam. If a later edit drops one
    // of them the way the brackets flag was dropped, this notices.
    const variant = await loadWith({
      hashtags: ['chai'],
      keywordBrackets: false,
      // The stored shape is two flat keys, not a nested object — `readCta`
      // assembles the pair. Writing it nested here passed nothing to the loader
      // and is how this test first failed.
      gbpCta: 'ORDER',
      ctaUrl: 'https://chai.example/order',
      firstComment: 'more chai',
    })
    expect(variant?.cta).toEqual({ type: 'ORDER', url: 'https://chai.example/order' })
    expect(variant?.options).toMatchObject({ firstComment: 'more chai' })
    expect(variant?.keywordBrackets).toBe(false)
  })
})
