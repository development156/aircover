import { describe, expect, test } from 'vitest'
import type { PostVariant } from '@sahoda/shared'

import { seed } from './variant-state'
import { versionStateLabel } from '@/components/composer/version-state'

/**
 * A CHANNEL NOBODY HAS WRITTEN MAY NOT SAY "SAVED".
 *
 * ── THE DEFECT, AND WHY IT WAS WORSE THAN A WRONG WORD ───────────────────────
 * A channel that had never been written to rendered the past-tense label
 * "Saved" — a claim about a write that never happened — directly under the card
 * saying nothing was drafted for that channel. The state producing it was
 * `{ body: '', dirty: false }`: not dirty, because nothing had been typed, and
 * `versionStateLabel` reads exactly two booleans.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * `seed()` is where that state is decided and NOTHING imported it in a test.
 * `follow-the-post.test.tsx` covers the live editing session — typing, detaching,
 * emptying — through a rendered harness, which is the right place for those. It
 * never calls `seed`, so the RELOAD path, which is the one a person actually
 * meets when they come back to a post, had no coverage of its own.
 *
 * The fix in `seed` is structural rather than a special case, and that is what
 * these pin: `own` requires `row !== undefined && row.body !== ''`, so the only
 * branch that can set `following: false` is a branch that has copy in it. The
 * pair `{ following: false, dirty: false, body: '' }` is unreachable, and
 * "Saved" cannot be reached without a body.
 *
 * The assertions are on the CLAIM, not the wording — a rewrite of the four
 * labels should keep these green, and only a change in what is being claimed
 * should turn them red.
 */

const ROW: PostVariant = {
  id: '00000000-0000-4000-8000-000000000001',
  workspace_id: '00000000-0000-4000-8000-000000000002',
  post_id: '00000000-0000-4000-8000-000000000003',
  channel: 'x',
  body: '',
  extras: null,
  is_linked: true,
  char_count: 0,
  publish_status: 'pending',
  platform_post_id: null,
  permalink: null,
  last_error: null,
  created_at: '2026-08-23T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
}

const NO_VERSIONS = { supported: false } as const
/** The past tense. It is a claim that a write happened. */
const PAST_TENSE = /^Saved$/

describe('what a channel says about itself on the way back in', () => {
  test('a channel with NO ROW does not claim a write', () => {
    const states = seed([], NO_VERSIONS, 'the post body')
    expect(states.x.following).toBe(true)
    expect(versionStateLabel(states.x)).not.toMatch(PAST_TENSE)
  })

  test('a channel whose row is EMPTY does not claim a write either', () => {
    // The subtler half. A row exists — so a check for "is there a row" would
    // pass — and it holds nothing, so there is still no write to report.
    const states = seed([ROW], NO_VERSIONS, 'the post body')
    expect(states.x.following).toBe(true)
    expect(versionStateLabel(states.x)).not.toMatch(PAST_TENSE)
  })

  test('the unwritten state cannot be the one that produces "Saved"', () => {
    // THE DISCRIMINATING ONE. `versionStateLabel` reads two booleans, and the
    // defect was the pair `{ following: false, dirty: false }` reached with an
    // empty body. This asserts the pair is unreachable from a real read, rather
    // than asserting the label — so a future change that keeps the words and
    // reintroduces the state still fails.
    for (const variants of [[], [ROW]]) {
      const state = seed(variants, NO_VERSIONS, '').x
      expect(
        state.following === false && state.dirty === false && state.body === '',
        'an unwritten channel reached the exact state that renders "Saved"',
      ).toBe(false)
    }
    // And the label follows from it, on an empty post where the mirror is empty
    // too — the case where nothing anywhere has any content.
    expect(versionStateLabel(seed([], NO_VERSIONS, '').x)).not.toMatch(PAST_TENSE)
  })

  test('a channel with copy of its OWN does claim the write, and truthfully', () => {
    // The counterweight. Without it, every assertion above would pass against a
    // resolver that had simply lost the word "Saved" — which is the repair this
    // product refuses, because then a real save reports nothing.
    const written: PostVariant = { ...ROW, body: 'the X version, written by hand' }
    const states = seed([written], NO_VERSIONS, 'the post body')
    expect(states.x.following).toBe(false)
    expect(states.x.dirty).toBe(false)
    expect(versionStateLabel(states.x)).toMatch(PAST_TENSE)
  })

  test('the mirrored draft is marked unsaved, because it is not in the row', () => {
    // `runPublishPost` sends `post_variants.body` with no fallback to
    // `posts.body`. A channel showing the post's words while its row is empty
    // is describing a publish that cannot happen, so the mirror must read as an
    // unsaved draft rather than as settled copy.
    const states = seed([], NO_VERSIONS, 'the post body')
    expect(states.x.body).toBe('the post body')
    expect(states.x.dirty).toBe(true)
  })
})
