import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { PostStatusSchema, type PostStatus } from '@sahoda/shared'

import { autoPublishTruth } from './schedule-status'
import { STATUS_MARK } from './status-mark'
import { STATUS_WORD } from './status-word'
import type { VariantStatusRow } from './variant-status'

/**
 * Reachability guard for the auto-publish gate and the status readers.
 *
 * The honest "won't post itself" labelling shipped gated on `status ===
 * 'scheduled'` — a status apps/web, at the time, never wrote. The gate matched
 * zero rows, the note rendered for nobody, and every test passed: they all fed
 * the function a status by hand that no code path could produce.
 *
 * That is the bug class this file exists to stop. Unit tests choose their own
 * inputs, so they prove a rule is internally consistent while saying nothing
 * about whether the rule is reachable. This test does not choose its inputs: it
 * reads what apps/web actually does out of the source.
 *
 * ── WHAT THE APP WRITES NOW, AND HOW ─────────────────────────────────────────
 * Status writes happen two ways. Inserts write `draft` directly. Every other
 * transition goes through a Postgres function, because a lifecycle trigger
 * refuses a direct `status` write past idea/draft/review from a PostgREST
 * role. So the scan has two halves:
 *
 *   1. the direct writes, read out of every file that talks to `posts`;
 *   2. the RPC NAMES the app calls, read the same way, each mapped here to the
 *      statuses the function writes (the database contract, restated in one
 *      place so a new RPC or a changed function shows up as a failure).
 *
 * The union is "every status apps/web can put on a post", and each one must be
 * in the reader vocabulary — the word, the mark, and the auto-publish gate for
 * the dated ones. Remove a status from `RPC_WRITES` and the `toEqual` below
 * goes red; that is how this guard was shown to fail before it was trusted.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
/** apps/web/src — this file lives at src/lib/posts. Worktree-path agnostic. */
const WEB_SRC = resolve(HERE, '../..')

const NOW = new Date('2026-07-25T12:00:00.000Z')
const A_DATE = '2026-07-25T18:00:00.000Z'

/**
 * The lifecycle RPCs and the `posts.status` values each one writes. Restated
 * from the migration contract, not read from it: the point is that a change to
 * a function's behaviour must be weighed against the readers deliberately.
 */
const RPC_WRITES = {
  approve_posts: ['approved', 'scheduled'],
  release_post_for_publish: ['scheduled'],
  reschedule_post: ['scheduled'],
  cancel_scheduled_post: ['draft'],
} as const satisfies Record<string, readonly PostStatus[]>

type LifecycleRpc = keyof typeof RPC_WRITES

/**
 * One variant, still waiting — the shape a genuinely-unpublished post carries.
 * `autoPublishTruth` reads the variant rows, and an EMPTY list is read as "no
 * evidence" rather than as proof nothing published, so a reachability probe
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
 * status to the written set, which widens what the readers must satisfy — the
 * safe direction to be wrong in.
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

const SOURCES = walk(WEB_SRC).map((file) => stripComments(readFileSync(file, 'utf8')))

/**
 * Every post status apps/web writes DIRECTLY, read out of the files that talk
 * to the `posts` table. Scoping to those files keeps sibling vocabularies out —
 * `theme.ts` writes `status: 'active'`, which is not a PostStatus at all — and
 * the PostStatus filter is the backstop.
 */
function statusesWrittenDirectly(): PostStatus[] {
  const found = new Set<PostStatus>()
  for (const source of SOURCES) {
    if (!source.includes("from('posts')")) continue
    for (const [, value] of source.matchAll(/status:\s*'([a-z_]+)'/g)) {
      const parsed = PostStatusSchema.safeParse(value)
      if (parsed.success) found.add(parsed.data)
    }
  }
  return [...found].sort()
}

/** Every lifecycle RPC apps/web actually calls, by name, out of the source. */
function lifecycleRpcsCalled(): LifecycleRpc[] {
  const found = new Set<LifecycleRpc>()
  for (const source of SOURCES) {
    for (const [, name] of source.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)) {
      if (name !== undefined && name in RPC_WRITES) found.add(name as LifecycleRpc)
    }
  }
  return [...found].sort()
}

/** Direct writes plus what every called RPC writes: all the app can produce. */
function statusesTheAppWrites(): PostStatus[] {
  const found = new Set<PostStatus>(statusesWrittenDirectly())
  for (const rpc of lifecycleRpcsCalled()) {
    for (const status of RPC_WRITES[rpc]) found.add(status)
  }
  return [...found].sort()
}

describe('the statuses apps/web writes are all ones its readers understand', () => {
  test('the scan finds every lifecycle RPC, so the map above is not stale', () => {
    // Guards the guard. If the scan silently found nothing — a moved file, a
    // changed call idiom — every assertion below would pass vacuously and this
    // file would go back to proving nothing at all.
    expect(lifecycleRpcsCalled()).toEqual(
      [
        'approve_posts',
        'cancel_scheduled_post',
        'release_post_for_publish',
        'reschedule_post',
      ].sort(),
    )
  })

  test('the only DIRECT status write left is the insert', () => {
    // `approvePost` used to `update({ status: 'approved' })`. It cannot now: the
    // lifecycle trigger refuses it, so it goes through `approve_posts`. A new
    // direct write showing up here is a write the trigger will reject at runtime.
    expect(statusesWrittenDirectly()).toEqual(['draft'])
  })

  test('the union of direct and RPC writes is exactly the set the readers were built for', () => {
    // Listed in full so that a NEW status write shows up here as a failure and
    // gets weighed against the readers deliberately.
    expect(statusesTheAppWrites()).toEqual(['approved', 'draft', 'scheduled'])
  })

  test('every written status has a word and a mark', () => {
    for (const status of statusesTheAppWrites()) {
      expect(STATUS_WORD[status], `STATUS_WORD has no word for '${status}'`).toBeTruthy()
      expect(STATUS_MARK[status], `STATUS_MARK has no mark for '${status}'`).toBeTruthy()
    }
  })

  test('the statuses the RPCs write for a BOOKED post are labelled once they carry a date', () => {
    // `scheduled` from any of the three schedule RPCs, and `approved` for the
    // rows that pre-date the backfill: both must reach the auto-publish note,
    // or the "won't post itself" labelling goes dark again — this time with a
    // status that IS reachable.
    const booked = statusesTheAppWrites().filter((status) => status !== 'draft')
    expect(booked.length).toBeGreaterThan(0)
    for (const status of booked) {
      expect(
        autoPublishTruth(status, A_DATE, NOW, WAITING),
        `autoPublishTruth returns 'none' for '${status}', which apps/web writes for a post with a time, so the auto-publish note can never render for it.`,
      ).not.toBe('none')
    }
  })

  test('a dated draft stays silent: a plan, not a commitment', () => {
    // The insert writes `draft`, and a draft with a date has promised nothing
    // yet. Labelling it would train readers to ignore the label.
    expect(autoPublishTruth('draft', A_DATE, NOW, WAITING)).toBe('none')
  })
})
