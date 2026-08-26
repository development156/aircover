import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { globSync } from 'node:fs'

import { findVoiceStrays, stripNonCopy } from './sahoda-voice'

/**
 * THE VOICE RULE, ENFORCED FOR THE FIRST TIME.
 *
 * `CLAUDE.md` records that two first-person strays were found and fixed by hand
 * on 2026-08-16 and that nothing was added to catch a third. A third shipped
 * anyway, in `inline-rewrite.tsx`, twice in one sentence.
 *
 * ── WHAT WOULD MAKE THIS FILE WORTHLESS ──────────────────────────────────────
 * Only scanning the repository. A sweep that finds nothing today passes forever
 * afterwards whether or not the detector works, which is this project's most
 * repeated defect. So the unit cases below carry the real proof: each states a
 * sentence and the verdict it must get, and the repository sweep is the
 * application of a detector that has already been shown to fire and to hold its
 * fire.
 */

describe('what counts as Sahoda speaking in the first person', () => {
  test('catches the exact sentence that shipped', () => {
    const shipped = 'Your post changed while I was rewriting, so I didn’t replace anything.'
    const strays = findVoiceStrays(shipped)

    // BOTH halves, not just the first. The sentence carried the defect twice and
    // a detector that stops at the first match would have reported it fixed after
    // half a fix.
    expect(strays.map((s) => s.phrase)).toEqual(['I was', 'I didn’t'])
  })

  test('catches the contraction with either apostrophe, because the codebase ships both', () => {
    // JSX renders &rsquo; and plain strings hold ’. A pattern written with only
    // the ASCII quote misses every occurrence that actually reaches a reader.
    expect(findVoiceStrays('I’ll try again').map((s) => s.phrase)).toEqual(['I’ll'])
    expect(findVoiceStrays("I'll try again").map((s) => s.phrase)).toEqual(["I'll"])
    expect(findVoiceStrays('Sahoda cannot reach it. I cannot either.')).toHaveLength(1)
  })

  test('catches the HTML ENTITY form, which is how JSX actually spells it', () => {
    // THIS CASE EXISTS BECAUSE A MUTATION FOUND IT MISSING. Removing entity
    // support from the pattern left the whole suite green: the two cases above
    // use the character forms, and the only entity occurrences in the repository
    // sit in the quarantined onboarding flow. So the support was real, the miss
    // it was written for was real, and nothing pinned it.
    //
    // `I&rsquo;ll plan for a bakery business` is the sentence that was slipping
    // through, four lines above three strays the detector did catch.
    expect(findVoiceStrays('I&rsquo;ll plan for that').map((s) => s.phrase)).toEqual(['I&rsquo;ll'])
    expect(findVoiceStrays('Sahoda couldn&rsquo;t reach it')).toEqual([])
  })

  test('does NOT flag the user speaking, which is correct copy', () => {
    // The counterweight. Without these the guard would push someone to break
    // working copy: both of these are the reader talking to the product.
    expect(findVoiceStrays('Put my Instagram copy back')).toEqual([])
    expect(findVoiceStrays('I’ll do this later')).toEqual([])
    expect(findVoiceStrays('Keep mine and save')).toEqual([])
  })

  test('does NOT flag a bare pronoun with no verb, or a lowercase i', () => {
    expect(findVoiceStrays('Section I of the terms')).toEqual([])
    expect(findVoiceStrays('it is in the list')).toEqual([])
  })

  test('does NOT flag third-person copy, which is the whole point', () => {
    expect(findVoiceStrays('Sahoda could not reach your accounts.')).toEqual([])
    expect(findVoiceStrays('Sahoda was rewriting, so nothing was replaced.')).toEqual([])
  })

  test('names the sentence, not two words', () => {
    const [stray] = findVoiceStrays('The rewrite was charged. I could not place it for you.')
    expect(stray?.context).toContain('The rewrite was charged')
  })
})

describe('what the scanner refuses to read', () => {
  test('a comment is not copy, and this repository is mostly comments', () => {
    // Every long header in this codebase narrates what a session did, often in
    // the first person. A guard that cried wolf on its own documentation would be
    // switched off within a week.
    expect(findVoiceStrays('// I found this while reading\nconst a = 1')).toEqual([])
    expect(findVoiceStrays('/* I was wrong about this */')).toEqual([])
  })

  test('but a comment does not hide copy that follows it on the same line', () => {
    // The mutation this pins: a `//` strip that eats to end-of-file, or one that
    // swallows the line it starts on including code before it.
    const source = 'const label = "I cannot do that" // I was unsure'
    expect(findVoiceStrays(source).map((s) => s.phrase)).toEqual(['I cannot'])
  })

  test('a URL is not a comment', () => {
    // `//` inside https:// must not start a comment strip.
    expect(stripNonCopy('const u = "https://example.com/a" ')).toContain('example.com')
  })
})

/**
 * ONE FILE IS QUARANTINED, AND IT IS NOT AN APPROVAL.
 *
 * `result-step.tsx` — the onboarding reveal — is written in the first person
 * throughout: "I'll plan for a bakery business", "I read your website and kept
 * what it says about you", "I have 3 knowledge sources to draw on", "I have not
 * settled on a tone of voice yet". FOUR sentences, deliberately consistent with
 * each other.
 *
 * That is not a typo somebody can fix in passing; it is a voice decision on the
 * screen where the product introduces itself, and it contradicts `CLAUDE.md`
 * outright. Rewriting it silently from a composer task would be one lane
 * changing another lane's product voice on the strength of its own new guard.
 *
 * So it is listed, not excused. The guard covers every other component today and
 * this entry comes out the moment the founder rules either way — either the copy
 * moves to the third person, or `CLAUDE.md` gains a stated exception for the
 * onboarding mascot and this list stays with the reason written next to it.
 *
 * The list is deliberately a FILE, not a phrase: an exception keyed to the exact
 * sentences would silently re-open the moment somebody rewords one of them.
 */
const PENDING_A_RULING: readonly string[] = ['onboarding/stage/']

/**
 * THE SWEEP. Every user-facing component, held to the rule.
 *
 * Tests are excluded: a test may legitimately quote a bad sentence in order to
 * assert it is refused, and this file itself does exactly that.
 */
describe('the shipped interface', () => {
  test('never speaks in the first person', () => {
    const root = join(__dirname, '..', '..', 'components')
    const files = globSync('**/*.tsx', { cwd: root })
      .filter((f) => !f.includes('.test.') && !f.includes('.harness.'))
      .filter((f) => !PENDING_A_RULING.some((q) => f.replace(/\\/g, '/').includes(q)))
      .map((f) => join(root, f))

    // A sweep over an empty list passes and proves nothing — the exact shape
    // CLAUDE.md names as "a suite that ran nothing reports as passing".
    expect(files.length).toBeGreaterThan(100)

    const offences: string[] = []
    for (const file of files) {
      for (const stray of findVoiceStrays(readFileSync(file, 'utf8'))) {
        offences.push(`${file.slice(root.length + 1)}: "${stray.context}"`)
      }
    }

    expect(offences, `Sahoda speaks in the third person:\n${offences.join('\n')}`).toEqual([])
  })
})

describe('the quarantine itself', () => {
  test('still holds real strays, so the list can never become a silent pass', () => {
    // If somebody "fixes" result-step.tsx by rewriting it, this test goes red and
    // the entry must be removed. A quarantine nobody re-checks is how a temporary
    // exception becomes permanent.
    const root = join(__dirname, '..', '..', 'components')
    const held = globSync('**/*.tsx', { cwd: root })
      .filter((f) => f.replace(/\\/g, '/').includes(PENDING_A_RULING[0] as string))
      .filter((f) => !f.includes('.test.'))
      .flatMap((f) => findVoiceStrays(readFileSync(join(root, f), 'utf8')))
    expect(held.length).toBeGreaterThan(0)
  })
})
