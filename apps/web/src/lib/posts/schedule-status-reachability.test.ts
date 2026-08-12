import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { PostStatusSchema, type PostStatus } from '@sahoda/shared'

import { autoPublishTruth } from './schedule-status'
import type { VariantStatusRow } from './variant-status'

/**
 * Reachability guard for the auto-publish gate.
 *
 * The honest "won't post itself" labelling shipped gated on `status ===
 * 'scheduled'` — a status apps/web has never once written. `approvePost` is the
 * ONE sanctioned status write in the app and it writes `approved`; every insert
 * writes `draft`; `savePost` refuses `status` outright. So the gate matched zero
 * rows, the note rendered for nobody, and every test passed: they all fed the
 * function a status by hand that no code path could produce.
 *
 * That is the bug class this file exists to stop. Unit tests choose their own
 * inputs, so they prove a rule is internally consistent while saying nothing
 * about whether the rule is reachable. This test does not choose its inputs: it
 * reads the statuses apps/web actually writes out of the source and requires the
 * gate to match at least one of them.
 *
 * It reads the REAL action files rather than a fixture, for the same reason
 * `anchor-integrity.test.ts` reads the real seed — a fixture drifts exactly the
 * way the thing it stands in for drifted.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
/** apps/web/src — this file lives at src/lib/posts. Worktree-path agnostic. */
const WEB_SRC = resolve(HERE, '../..')

const NOW = new Date('2026-07-25T12:00:00.000Z')
const A_DATE = '2026-07-25T18:00:00.000Z'
/**
 * One variant, still waiting — the shape a genuinely-unpublished post carries.
 * `autoPublishTruth` now reads the variant rows, and an EMPTY list is read as
 * "no evidence" rather than as proof nothing published, so a reachability probe
 * that passed `[]` would be testing the fallback instead of the gate.
 */
const WAITING = [
  {
    channel: 'instagram',
    status: 'pending',
    permalink: null,
    platformPostId: null,
    simulated: false,
    errorMessage: null,
    errorCode: null,
    gateRefusal: null,
    retryable: true,
  },
] as const satisfies readonly VariantStatusRow[]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Drop block comments and whole-line comments before scanning, so prose ABOUT a
 * status is never mistaken for a write of one — `posts.ts` names
 * `status: 'published'` in a comment explaining why it refuses to write it.
 *
 * Trailing inline comments survive on purpose: stripping `//` mid-line would
 * also cut URLs out of string literals. A trailing comment can only ever ADD a
 * status to the written set, which widens what the gate must satisfy — the safe
 * direction to be wrong in.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

/**
 * Every post status apps/web writes, read out of the files that talk to the
 * `posts` table. Scoping to those files keeps sibling vocabularies out —
 * `theme.ts` writes `status: 'active'`, which is not a PostStatus at all — and
 * the PostStatus filter is the backstop.
 */
function statusesTheAppWrites(): PostStatus[] {
  const found = new Set<PostStatus>()

  for (const file of walk(WEB_SRC)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes("from('posts')")) continue

    for (const [, value] of stripComments(source).matchAll(/status:\s*'([a-z_]+)'/g)) {
      const parsed = PostStatusSchema.safeParse(value)
      if (parsed.success) found.add(parsed.data)
    }
  }

  return [...found].sort()
}

describe('the auto-publish gate can match a post this app can actually produce', () => {
  test('the scan finds the statuses apps/web writes', () => {
    // Guards the guard. If the scan silently found nothing — a moved file, a
    // changed query idiom — every assertion below would pass vacuously and this
    // file would go back to proving nothing at all.
    const written = statusesTheAppWrites()

    expect(written.length).toBeGreaterThan(0)
    // The two the app writes today: inserts land as `draft`, `approvePost`
    // promotes to `approved`. Listed so that a NEW status write shows up here as
    // a failure and gets weighed against the gate deliberately.
    expect(written).toEqual(['approved', 'draft'])
  })

  test('at least one written status is labelled once it carries a date', () => {
    const written = statusesTheAppWrites()
    const labelled = written.filter(
      (status) => autoPublishTruth(status, A_DATE, NOW, WAITING) !== 'none',
    )

    expect(
      labelled,
      `autoPublishTruth returns 'none' for every status apps/web writes (${written.join(
        ', ',
      )}), so the auto-publish note can never render for any real post. Either the gate is wrong, or the status this product writes for a scheduled post has changed.`,
    ).not.toHaveLength(0)
  })

  test("'scheduled' stays accepted, so the gate is already right when a real schedule action lands", () => {
    // Nothing writes this today. The gate must keep honouring it anyway, or the
    // day someone ships a schedule action the labelling silently goes dark
    // again — this time with a status that IS reachable.
    expect(autoPublishTruth('scheduled', A_DATE, NOW, WAITING)).not.toBe('none')
  })
})
