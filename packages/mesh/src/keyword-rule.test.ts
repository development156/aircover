import { describe, expect, test } from 'vitest'

import { KEYWORD_RULE } from './tasks/content-variants'

/**
 * WHAT THE MODEL IS TOLD ABOUT THE FIELD WHOSE NAME NOW LIES.
 *
 * The JSON key stays `hashtags` — it maps onto `post_variants.extras.hashtags`,
 * untyped jsonb with production rows already in it, and renaming the key would
 * orphan every one. So the field name says "hashtags" and the contents must be
 * keywords (REQUESTS §34).
 *
 * That gap is the whole risk. A model reading `"hashtags"?: string[]` and no
 * further instruction will produce `#chai` every time, and `normalizeKeywords`
 * would then quietly turn it into `[chai]` — a legal list of the wrong words,
 * with nothing on screen to show the instruction had been dropped.
 *
 * These assert the instruction is PRESENT and says the four things that matter.
 * They cannot assert the model obeys it; that is what `normalizeKeywords` is for,
 * and it has its own tests in the Constraint Engine.
 */

describe('KEYWORD_RULE — the four things it has to say', () => {
  test('forbids the hash outright, because the field name invites it', () => {
    expect(KEYWORD_RULE).toMatch(/never write a "#"/i)
  })

  test('says these are SEARCH terms, not tags', () => {
    expect(KEYWORD_RULE).toMatch(/search box/i)
  })

  test('asks for phrases, which is the capability the format buys', () => {
    // A single word is a hashtag by another name. The brackets exist so a
    // keyword can be the multi-word thing somebody actually types.
    expect(KEYWORD_RULE).toMatch(/phrase/i)
  })

  test('tells it NOT to add brackets, because Sahoda adds them', () => {
    // Without this the model produces `[chai]`, `normalizeKeywords` unwraps and
    // re-wraps it, and the round-trip happens to work — but a model that writes
    // `[[chai]]` or `[chai] [pune]` in one string does not.
    expect(KEYWORD_RULE).toMatch(/do not add brackets/i)
  })

  test('never tells the model to follow hashtag norms', () => {
    // The system prompt used to say "follow each platform's norms for hashtags",
    // which is a direct instruction to write them. It was removed in the same
    // change; this is the guard that it stays removed.
    expect(KEYWORD_RULE).not.toMatch(/norms for hashtags/i)
  })
})
