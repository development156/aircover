import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * generated_body — draft capture, EXECUTED against real Postgres.
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────────
 * Not that the column exists. What is tested is the single promise the whole
 * feature rests on, by ATTEMPTING the thing that must fail:
 *
 *   · once a model draft is stored, NOTHING can change it and NOTHING can erase
 *     it. If a writer can overwrite `generated_body`, the column is just a
 *     second copy of `body` and the signal it exists to keep is gone;
 *   · an edit to `body` still works, and leaves the draft standing. This is the
 *     case the product actually performs every day, and a guard that refused it
 *     would break saving entirely;
 *   · a row with no model draft stays NULL and can be edited freely, because
 *     NULL means "a person wrote this" and is a real answer, not a gap;
 *   · a NULL draft can still be filled in once — generation may happen after the
 *     row exists (a rewrite of a human post), and refusing that would lose the
 *     very case §22 names as producing a before-and-after without publishing.
 *
 * The erase case is separate from the change case on purpose. `<>` is NULL when
 * either side is NULL, so a guard written with `<>` refuses a rewrite and lets
 * an erase through — passing four of these five tests while losing the data.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const DRAFT = 'Model wrote this. Visit us today!'
const EDITED = 'Model wrote this. Come say hello.'

describe('generated_body is write-once (real Postgres, in-process)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by)
      values ('${WS}', 'Acme', 'acme', 'user_owner');
    `)
  })

  afterAll(async () => {
    await db?.close()
  })

  /** Inserts a post the way a generation path does, and returns its id. */
  async function seedPost(generated: string | null): Promise<string> {
    const res = await db.query<{ id: string }>(
      `insert into posts (workspace_id, body, generated_body, created_by)
       values ($1, $2, $3, 'user_owner')
       returning id`,
      [WS, generated ?? 'typed by a person', generated],
    )
    const row = res.rows[0]
    // `noUncheckedIndexedAccess` is on and it is right to insist: an insert that
    // returned no row would otherwise surface as a confusing failure three
    // assertions later rather than here, where the cause is.
    if (!row) throw new Error('seedPost inserted no row')
    return row.id
  }

  async function bodyAndDraft(id: string) {
    const res = await db.query<{ body: string | null; generated_body: string | null }>(
      `select body, generated_body from posts where id = $1`,
      [id],
    )
    const row = res.rows[0]
    if (!row) throw new Error(`no post ${id}`)
    return row
  }

  it('refuses an UPDATE that rewrites a stored draft', async () => {
    const id = await seedPost(DRAFT)

    await expect(
      db.query(`update posts set generated_body = $2 where id = $1`, [id, 'something else']),
    ).rejects.toThrow(/write-once/)

    expect((await bodyAndDraft(id)).generated_body).toBe(DRAFT)
  })

  it('refuses an UPDATE that ERASES a stored draft', async () => {
    const id = await seedPost(DRAFT)

    await expect(
      db.query(`update posts set generated_body = null where id = $1`, [id]),
    ).rejects.toThrow(/write-once/)

    expect((await bodyAndDraft(id)).generated_body).toBe(DRAFT)
  })

  it('lets the customer edit body, and the draft still stands', async () => {
    const id = await seedPost(DRAFT)

    await db.query(`update posts set body = $2 where id = $1`, [id, EDITED])

    const row = await bodyAndDraft(id)
    expect(row.body).toBe(EDITED)
    expect(row.generated_body).toBe(DRAFT)
  })

  it('leaves a human-written row NULL, and lets it be edited', async () => {
    const id = await seedPost(null)

    await db.query(`update posts set body = $2 where id = $1`, [id, EDITED])

    const row = await bodyAndDraft(id)
    expect(row.body).toBe(EDITED)
    expect(row.generated_body).toBeNull()
  })

  it('allows a NULL draft to be filled in once, then never again', async () => {
    const id = await seedPost(null)

    await db.query(`update posts set generated_body = $2 where id = $1`, [id, DRAFT])
    expect((await bodyAndDraft(id)).generated_body).toBe(DRAFT)

    await expect(
      db.query(`update posts set generated_body = $2 where id = $1`, [id, 'a second draft']),
    ).rejects.toThrow(/write-once/)
  })

  it('guards post_variants by the same rule, not only posts', async () => {
    const postId = await seedPost(DRAFT)
    await db.query(
      `insert into post_variants (workspace_id, post_id, channel, body, generated_body)
       values ($1, $2, 'x', $3, $3)`,
      [WS, postId, DRAFT],
    )

    await expect(
      db.query(`update post_variants set generated_body = null where post_id = $1`, [postId]),
    ).rejects.toThrow(/write-once/)

    await db.query(`update post_variants set body = $2 where post_id = $1`, [postId, EDITED])
    const res = await db.query<{ body: string; generated_body: string | null }>(
      `select body, generated_body from post_variants where post_id = $1`,
      [postId],
    )
    const variant = res.rows[0]
    if (!variant) throw new Error('no variant')
    expect(variant.body).toBe(EDITED)
    expect(variant.generated_body).toBe(DRAFT)
  })
})
