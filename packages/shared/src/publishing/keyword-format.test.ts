import { describe, expect, test } from 'vitest'

import {
  CONSTRAINTS,
  charCountFor,
  formatForPlatform,
  hashtagTail,
  keywordTail,
  normalizeHashtags,
  normalizeKeywords,
} from './constraints'

/**
 * KEYWORDS, NOT HASHTAGS — and the guard that proves the swap actually happened.
 *
 * Founder's ruling: "There are supposed to be keywords instead of hashtags in the
 * following format : [marketing]" (REQUESTS §34).
 *
 * ── WHY THE OLD FUNCTION IS KEPT AND TESTED AGAINST ──────────────────────────
 * `hashtagTail` still exists and is no longer on the publish path. That is not
 * dead weight: rendering the SAME stored list through both and asserting they
 * DIFFER is what makes a silent revert impossible. A test that only asserted
 * `[chai]` would still pass if somebody restored the `#` form for one channel
 * and left the other alone.
 *
 * ── AND WHY THE STORED KEY DID NOT CHANGE ────────────────────────────────────
 * `post_variants.extras.hashtags` is untyped jsonb and production rows already
 * hold `#chai`. Renaming the key would orphan them. So the concept was renamed
 * and the key was not, which puts the whole burden on the normaliser reading
 * legacy values correctly — the case below with the most at stake.
 */

const IG = CONSTRAINTS.instagram

describe('normalizeKeywords — the shape that reaches the platform', () => {
  test('wraps a bare word in brackets', () => {
    expect(normalizeKeywords(['marketing'])).toEqual(['[marketing]'])
  })

  test('strips a LEGACY leading hash rather than wrapping it', () => {
    // THE ONE WITH THE MOST AT STAKE. Every row written before the ruling holds
    // `#chai`. Wrapping that naively gives `[#chai]`, which is neither format and
    // reads as a bug on a live account. No migration runs; this is the migration.
    expect(normalizeKeywords(['#chai', '#pune'])).toEqual(['[chai]', '[pune]'])
  })

  test('does not double-wrap something already in the new form', () => {
    // Read-modify-write round-trips through `extras` are routine, so a value that
    // has been through here once must survive going through again unchanged.
    expect(normalizeKeywords(['[marketing]'])).toEqual(['[marketing]'])
  })

  test('handles the both-legacy-shapes case, `[#chai]`', () => {
    // Reachable by exactly one path: a row wrapped by an early version of this
    // function before the hash strip was added. Cheap to absorb, ugly to ship.
    expect(normalizeKeywords(['[#chai]'])).toEqual(['[chai]'])
  })

  test('KEEPS SPACES INSIDE A KEYWORD, which is the point of the brackets', () => {
    // `#chai pune` is two hashtags. `[chai pune]` is one keyword, and it is what
    // somebody searching actually types. The old normaliser could not express it:
    // `normalizeHashtags` would have produced `#chai pune` as a single malformed
    // token, and the composer's field splits on whitespace before it ever gets
    // there. This is the capability the format buys.
    expect(normalizeKeywords(['chai in pune'])).toEqual(['[chai in pune]'])
  })

  test('drops empties and whitespace-only entries', () => {
    expect(normalizeKeywords(['', '   ', 'chai', '#', '[]'])).toEqual(['[chai]'])
  })

  test('deduplicates case-insensitively, across formats', () => {
    // `#Chai` and `chai` are the same keyword. Counting it twice would push a
    // post over a limit it is not actually over.
    expect(normalizeKeywords(['#Chai', 'chai', '[CHAI]'])).toEqual(['[Chai]'])
  })

  test('preserves the order the writer chose', () => {
    expect(normalizeKeywords(['pune', 'chai', 'monsoon'])).toEqual([
      '[pune]',
      '[chai]',
      '[monsoon]',
    ])
  })

  test('undefined is an empty list, not a crash', () => {
    expect(normalizeKeywords(undefined)).toEqual([])
  })

  test('ignores non-strings that reach it from untyped jsonb', () => {
    // `extras` is jsonb with no schema at the database. A number in that array is
    // reachable, and `.trim()` on it would throw inside the publish path.
    expect(normalizeKeywords([1 as unknown as string, 'chai'])).toEqual(['[chai]'])
  })
})

describe('keywordTail — what is appended to the body', () => {
  test('a blank line, then the bracketed list', () => {
    expect(keywordTail(['chai', 'pune'])).toBe('\n\n[chai] [pune]')
  })

  test('nothing at all when there are no keywords', () => {
    expect(keywordTail([])).toBe('')
    expect(keywordTail(undefined)).toBe('')
    // And nothing when every entry was empty — a bare "\n\n" tail on a caption is
    // two blank lines the writer did not ask for.
    expect(keywordTail(['', '  '])).toBe('')
  })

  test('DIFFERS from the hashtag tail on the same stored list', () => {
    // The anti-revert guard. Both functions still exist; only one is on the
    // publish path. If somebody restores `hashtagTail` there, this stays green —
    // which is why the publish-path tests below exist as well — but if somebody
    // changes `keywordTail` back to emitting hashes, this catches it here.
    const stored = ['#chai', '#pune']

    expect(hashtagTail(stored)).toBe('\n\n#chai #pune')
    expect(keywordTail(stored)).toBe('\n\n[chai] [pune]')
    expect(keywordTail(stored)).not.toBe(hashtagTail(stored))
  })

  test('the old normaliser is untouched, so nothing else that uses it moved', () => {
    expect(normalizeHashtags(['chai'])).toEqual(['#chai'])
  })
})

describe('the publish path emits keywords', () => {
  const draft = { body: 'Monsoon chai is here.', hashtags: ['#chai', 'pune'] }

  test('formatForPlatform appends the BRACKETED list, on a real channel', () => {
    // The assertion that would fail if the swap were only cosmetic. This is the
    // exact string Instagram receives.
    const out = formatForPlatform(IG, draft)

    expect(out).toMatchObject({
      channel: 'instagram',
      caption: 'Monsoon chai is here.\n\n[chai] [pune]',
    })
  })

  test('and never a hash, on any channel that carries them', () => {
    for (const channel of ['instagram', 'x', 'linkedin'] as const) {
      const out = formatForPlatform(CONSTRAINTS[channel], draft)
      // `caption` on Instagram, `text` on x and LinkedIn — the union is the
      // point, so read whichever this channel carries rather than casting.
      const text = 'caption' in out ? out.caption : 'text' in out ? out.text : ''
      expect(text, channel).toContain('[chai]')
      expect(text, channel).not.toContain('#chai')
    }
  })

  test('Google Business still gets no tail at all', () => {
    // Unchanged and deliberate. A Google Business post is a local business update;
    // the tail was dropped there when it was hashtags and it is dropped now.
    expect(formatForPlatform(CONSTRAINTS.gbp, draft)).toMatchObject({
      channel: 'gbp',
      summary: 'Monsoon chai is here.',
    })
  })

  test('the character meter counts the BRACKETED tail, not the hashed one', () => {
    // The defect this whole engine exists to prevent is the meter and the
    // formatter disagreeing. `[chai] [pune]` is 13 characters; `#chai #pune` is
    // 11. A meter still counting the old form would read two characters short on
    // every post, and would go on being wrong as the list grew.
    const counted = charCountFor(IG, draft)

    expect(counted).toBe(Array.from(draft.body).length + Array.from('\n\n[chai] [pune]').length)
    expect(counted).not.toBe(Array.from(draft.body).length + Array.from('\n\n#chai #pune').length)
  })
})
