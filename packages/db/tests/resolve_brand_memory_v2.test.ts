import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

/**
 * The v2 shape guard, executed.
 *
 * PGlite runs Postgres in-process, so this proves the guard WITHOUT any project
 * credentials — which matters here more than usual: this worktree has no `.env`
 * at all, and the one thing a DB lane must never do is discover its SQL is
 * wrong by applying it. The `20260808` precedent in LEARNINGS is the same
 * lesson: a SQL string that merely LOOKS right passed review for weeks.
 */
const MIGRATION = fileURLToPath(
  new URL('../supabase/migrations/20260812000001_resolve_brand_memory_v2.sql', import.meta.url),
)

let db: PGlite
let ws: string

const meta = { kind: 'asked', confirmed: false, source: 'https://x.in/' }
const audience = (over: Record<string, unknown> = {}) => ({
  id: 'parents',
  primary: true,
  one_liner: 'Parents choosing a school.',
  pains: ['No way to judge a school from a brochure.'],
  core_promise: 'Your child will be known by name.',
  meta,
  ...over,
})
const v2 = (audiences: unknown[], over: Record<string, unknown> = {}) => ({
  version: 2,
  audiences,
  voice: {
    descriptor: 'd',
    formality_label: 'f',
    signature_phrases: ['a'],
    banned_phrases: [],
    meta,
  },
  brand_persona: { archetype: 'a', one_liner: 'o', core_values: ['c'], meta },
  hook: { primary_emotion: 'e', sample_hooks: ['h'], meta },
  red_lines: {
    mandated: [
      {
        rule: 'no outcome guarantees',
        source: 'packs/regime/india-healthcare.md',
        ruleset_version: '2026.08',
      },
    ],
    owner: ['no discount-shouting'],
  },
  alignment: { signal_lock: 'moderate', note: 'n', meta },
  ...over,
})
const v1 = {
  voice: {
    descriptor: 'd',
    formality_label: 'f',
    signature_phrases: ['1', '2', '3'],
    banned_phrases: [],
  },
  brand_persona: { archetype: 'a', one_liner: 'o', core_values: ['1', '2', '3'] },
  customer_persona: {
    one_liner: 'o',
    primary_pain_point: 'p',
    primary_fear: 'f',
    desired_identity: 'd',
  },
  hook: { core_promise: 'c', primary_emotion: 'e', sample_hooks: ['1', '2', '3'] },
  taboo: { red_lines: ['x'] },
  alignment: { signal_lock: 'weak', note: 'n' },
}

async function save(payload: unknown): Promise<'accept' | 'reject'> {
  try {
    await db.query(`select public.resolve_brand_memory($1,$2,'resolved')`, [
      ws,
      JSON.stringify(payload),
    ])
    return 'accept'
  } catch {
    return 'reject'
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{"sub":"user_1"}'::jsonb $$;
    create table workspaces (id uuid primary key default gen_random_uuid());
    create table workspace_members (workspace_id uuid, user_id text, role text);
    create table brand_memory (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null, version int not null, status text not null,
      payload jsonb not null, source text not null, created_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (workspace_id, version)
    );
  `)
  const r = await db.query<{ id: string }>(`insert into workspaces default values returning id`)
  ws = r.rows[0]!.id
  await db.query(`insert into workspace_members values ($1,'user_1','owner')`, [ws])
  await db.exec(readFileSync(MIGRATION, 'utf8'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('exactly one primary audience — the invariant, in SQL', () => {
  it('accepts one primary', async () => {
    expect(await save(v2([audience()]))).toBe('accept')
  })

  it('rejects ZERO primaries', async () => {
    // Zero leaves every consumer picking arbitrarily — which means a different
    // answer per query plan, so the brand would address a different person
    // depending on row order.
    expect(await save(v2([audience({ primary: false })]))).toBe('reject')
  })

  it('rejects TWO primaries', async () => {
    expect(await save(v2([audience(), audience({ id: 'students' })]))).toBe('reject')
  })

  it('accepts one primary alongside secondaries — a school has parents AND students', async () => {
    expect(
      await save(
        v2([audience(), audience({ id: 'students', primary: false, core_promise: 'Known.' })]),
      ),
    ).toBe('accept')
  })
})

describe('a truthy-looking `primary` does not count, and does not 500', () => {
  it.each([
    ['the string "true"', 'true'],
    ['the number 1', 1],
  ])('rejects when primary is %s', async (_label, value) => {
    // `-> 'primary' = 'true'::jsonb` rather than a ::boolean cast: a wrong type
    // must fail the guard, not raise 22P02 and reach a browser as a 500.
    expect(await save(v2([audience({ primary: value })]))).toBe('reject')
  })

  it('rejects when primary is absent entirely', async () => {
    expect(await save(v2([{ id: 'x', one_liner: 'o', pains: [], core_promise: 'c', meta }]))).toBe(
      'reject',
    )
  })
})

describe('FieldMeta and the red-line split', () => {
  it('rejects a confirmed flag that is a string, not a boolean', async () => {
    // A truthy string would quietly confirm something nobody agreed to — the
    // exact failure this field exists to prevent.
    expect(await save(v2([audience({ meta: { ...meta, confirmed: 'false' } })]))).toBe('reject')
  })

  it('rejects a kind outside the four', async () => {
    expect(await save(v2([audience({ meta: { ...meta, kind: 'guessed' } })]))).toBe('reject')
  })

  it('rejects a mandated rule with no source — an untraceable rule is not auditable', async () => {
    expect(
      await save(v2([audience()], { red_lines: { mandated: [{ rule: 'r' }], owner: [] } })),
    ).toBe('reject')
  })

  it('rejects red_lines missing the owner tier', async () => {
    expect(await save(v2([audience()], { red_lines: { mandated: [] } }))).toBe('reject')
  })
})

describe('v1 is still accepted — seven live brains depend on it', () => {
  it('accepts an unchanged v1 payload', async () => {
    expect(await save(v1)).toBe('accept')
  })

  it('keeps v1 array-length discipline: exactly 3 signature_phrases', async () => {
    expect(await save({ ...v1, voice: { ...v1.voice, signature_phrases: ['1', '2'] } })).toBe(
      'reject',
    )
  })

  it('does NOT impose exactly-3 on v2 — the zod contract does not either', async () => {
    // A SQL guard stricter than the contract it mirrors rejects payloads the
    // application considers valid, and reads as a database bug from every angle
    // except the one that explains it.
    expect(
      await save(
        v2([audience()], {
          voice: {
            descriptor: 'd',
            formality_label: 'f',
            signature_phrases: ['only-one'],
            banned_phrases: [],
            meta,
          },
        }),
      ),
    ).toBe('accept')
  })
})
