import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { DEFAULT_INTAKE } from './intake'
import { audienceDescription, toResolveInput, type OnboardingAnswers } from './to-resolve-input'

/**
 * HOW MUCH OF WHAT A PERSON TYPED REACHES THE MODEL.
 *
 * `docs/46_Brand_Brain_Audit.md` measured this and it was the headline: six
 * onboarding screens produced 18 stored fields, the submit path read 9, and
 * FOUR of the 23 `ResolveInput` slots carried content. Fifteen Brand Brain
 * fields were written from those four, two of which existed only if fetching
 * the customer's website happened to work.
 *
 * Nothing measured that. Every field could have been dropped one at a time and
 * every test in this repository would have stayed green, because the tests
 * assert the SHAPE of the input and the shape is valid when it is nearly empty.
 * So this file counts, and the count is the assertion.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * A populated slot is not a useful slot. This proves the words leave the
 * browser and land in a field that means what they are; it says nothing about
 * whether the model writes a better Brand Brain from them. That needs a person
 * reading the result, and no assertion replaces it.
 */

/** Everything a thorough person could type, so the ceiling is measurable. */
const FULL: OnboardingAnswers = {
  intake: DEFAULT_INTAKE,
  name: 'Chai & Chapters',
  doorText:
    'We are a bookshop and chai room in Bhubaneswar. We have served 40,000 cups since 2019.',
  refusal: 'never call us cheap',
  positioning: 'A bookshop where people stay all afternoon and nobody hurries them.',
  audience: 'people who read slowly',
  audienceAge: '25-40',
  audienceLoc: 'Bhubaneswar',
  audienceRole: 'teachers and students',
  audienceInterests: 'literary fiction, slow mornings',
}

/** Count the leaves that carry something, the way the audit counted them. */
function populated(input: unknown): string[] {
  const out: string[] = []
  const walk = (node: unknown, path: string): void => {
    if (node === null || node === undefined) return
    if (typeof node === 'string') {
      if (node.trim() !== '') out.push(path)
      return
    }
    if (Array.isArray(node)) {
      if (node.length > 0) out.push(path)
      return
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k)
      return
    }
    out.push(path)
  }
  walk(input, '')
  return out.sort()
}

describe('what reaches the model', () => {
  test('a full set of answers fills more than the four slots the audit found', () => {
    const filled = populated(toResolveInput(FULL))

    // The audit's four were: source.name, source.category, source.one_liner,
    // brand.proof_point. Asserting the named additions rather than only a
    // count, because a count rises just as well when the wrong field fills.
    expect(filled).toContain('customer.description')
    expect(filled).toContain('taboo.avoid_topics')
    expect(filled).toContain('source.one_liner')
    expect(filled.length).toBeGreaterThan(4)
  })

  test('the positioning sentence they typed beats the sentence off their website', () => {
    // Their own words about their own business outrank a line a crawler picked
    // off their homepage. The page sentence stays the fallback.
    const input = toResolveInput(FULL)

    expect(input.source.one_liner).toBe(FULL.positioning)
    expect(input.source.one_liner).not.toContain('bookshop and chai room')
  })

  test('falls back to the page when nothing was typed', () => {
    const input = toResolveInput({ ...FULL, positioning: '' })

    expect(input.source.one_liner).toContain('bookshop and chai room')
  })

  test('a typed sentence is not fenced, because it is not a stranger’s page', () => {
    // The quarantine fence exists for door text, which comes from an arbitrary
    // URL and has already met a real prompt injection. What the customer typed
    // into our own form is the same trust level as `source.name`, which is not
    // fenced either. Fencing it would put delimiters in the middle of the
    // Brand Brain's own one-liner.
    const input = toResolveInput(FULL)

    expect(input.source.one_liner).not.toMatch(/UNTRUSTED|<<</)
  })

  test('the refusal is no longer empty on every resolve', () => {
    // It was hardcoded to '' in use-build.ts, so taboo.avoid_topics was empty on
    // EVERY resolve and every Red line on /brain was invented.
    expect(toResolveInput(FULL).taboo.avoid_topics).not.toBe('')
  })

  test('an untouched field contributes nothing rather than a claim', () => {
    const bare = toResolveInput({
      intake: DEFAULT_INTAKE,
      name: 'Chai & Chapters',
      doorText: '',
      refusal: '',
    })

    // A blank must stay blank. "No particular audience" would be a statement
    // about their business that nobody made.
    expect(bare.customer.description).toBe('')
    expect(bare.taboo.avoid_topics).toBe('')
    expect(bare.source.one_liner).toBe('')
  })
})

describe('audienceDescription', () => {
  test('labels each answer so a bare value cannot be misread', () => {
    // "25-40" alone could be a price, a rating or a year span. The label is the
    // question they answered under, so nothing has to be inferred.
    expect(audienceDescription(FULL)).toBe(
      'people who read slowly, aged 25-40, in Bhubaneswar, working as teachers and students, interested in literary fiction, slow mornings',
    )
  })

  test('drops the clauses that were not answered', () => {
    expect(
      audienceDescription({ ...FULL, audienceRole: '', audienceInterests: '', audienceLoc: '  ' }),
    ).toBe('people who read slowly, aged 25-40')
  })

  test('is empty when the screen was skipped entirely', () => {
    expect(
      audienceDescription({
        intake: DEFAULT_INTAKE,
        name: 'x',
        doorText: '',
        refusal: '',
      }),
    ).toBe('')
  })
})

/**
 * THE SEAM, which the tests above cannot see.
 *
 * Everything above calls `toResolveInput` directly. All of it stays green if
 * `use-build.ts` stops putting the keys on the form, or if
 * `onboarding-resolve.ts` stops reading them off it — the mapping would be
 * perfect and the answers would reach nothing, which is precisely the state
 * `docs/46` found and precisely the state a shape test cannot detect.
 *
 * Three artifacts have to agree: the client sets a key, the server reads that
 * key, and the mapper consumes that name. This reads the source of the first
 * two, because there is no other way to assert a FormData contract that is
 * spelled as string literals in two files.
 *
 * WHAT IT CANNOT SEE: that the value is correct, or that the form is the one
 * actually posted. It checks the names line up, not the journey.
 */
describe('the client, the server and the mapper agree on the field names', () => {
  const CLIENT = readFileSync(
    resolve(import.meta.dirname, '../../components/onboarding/stage/use-build.ts'),
    'utf8',
  )
  const SERVER = readFileSync(
    resolve(import.meta.dirname, '../../app/actions/onboarding-resolve.ts'),
    'utf8',
  )

  const KEYS = [
    'positioning',
    'audience',
    'audienceAge',
    'audienceLoc',
    'audienceRole',
    'audienceInterests',
    'refusal',
  ] as const

  test.each(KEYS)('%s is set by the client and read by the server', (key) => {
    expect(CLIENT, `use-build.ts does not form.set('${key}')`).toContain(`form.set('${key}'`)
    expect(SERVER, `onboarding-resolve.ts never reads '${key}'`).toContain(`'${key}'`)
  })

  test('the refusal is no longer hardcoded to an empty string', () => {
    // The single line that made every Red line an invention. Pinned by its
    // exact shape because that is what shipped.
    expect(CLIENT).not.toContain("form.set('refusal', '')")
  })
})
