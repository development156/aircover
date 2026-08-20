/**
 * docs/22 F3 — `site_generate` could fabricate attributed testimonials.
 *
 * The fixture below is not a synthetic edge case. It is the shape a premium model returns
 * when a marketing-site prompt lists `testimonials` among its permitted kinds: three
 * well-formed quotes, each with a full name and a job title, none of which correspond to a
 * person who exists. Every assertion here is written against THAT — a fabrication that is
 * perfectly valid by every other rule in the normalizer — because a refusal only proves
 * something if the thing it refuses would otherwise have gone through.
 *
 * So each test states the counterfactual: the same page with the same fabricated section
 * replaced by an ordinary one is asserted to survive, in the same call shape. Without that
 * control, a normalizer that dropped everything would pass this file.
 */
import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import { fabricatedSection, isUnattestable, UNATTESTABLE_KINDS } from './attested'
import { normalizeDraft } from './draft'
import type { NormalizeOptions } from './draft'

const TRACE_ID = 'trace-sites-fabricated'
const SITE_NAME = 'Acme Yoga'

type OutputPage = SiteGenerateOutput['pages'][number]
type OutputSection = OutputPage['sections'][number]

const hero = (): OutputSection => ({ kind: 'hero', content: { headline: 'Breathe better' } })

/** The control: an ordinary, permitted section that occupies the same slot. */
const faq = (): OutputSection => ({
  kind: 'faq',
  content: { items: [{ q: 'Do I need a mat?', a: 'We lend one.' }] },
})

/** What the model actually writes when asked for social proof it has no source for. */
const fabricatedTestimonials = (): OutputSection => ({
  kind: 'testimonials',
  content: {
    headline: 'What our students say',
    items: [
      {
        quote: 'I have never slept better. Six weeks in and my back pain is gone.',
        author: 'Priya Nair',
        role: 'Member since 2023',
      },
      {
        quote: 'The teachers actually remember your name. Worth every rupee.',
        author: 'Rahul Menon',
        role: 'Cafe owner',
      },
      {
        quote: 'Five stars. I recommend Acme to everyone at my office.',
        author: 'Sneha Iyer',
        role: 'Software engineer',
      },
    ],
  },
})

const options = (): NormalizeOptions => ({
  name: SITE_NAME,
  goal: 'fill the 7am class',
  maxPages: 1,
  traceId: TRACE_ID,
})

const run = (sections: OutputSection[]) =>
  normalizeDraft({ pages: [{ path: '/', title: 'Home', sections }] }, options())

/** Every rendered word the draft would put on the page, flattened. */
const renderedText = (result: ReturnType<typeof run>): string => {
  if (!result.ok) return ''
  return JSON.stringify(result.data.draft)
}

describe('a generated site carries no testimonial it cannot source', () => {
  it('refuses a fabricated testimonials section that is otherwise perfectly valid', () => {
    const control = run([hero(), faq()])
    const subject = run([hero(), fabricatedTestimonials()])

    // The control proves the slot is reachable: the same page, same length, same position,
    // with a permitted kind, keeps two sections.
    expect(control.ok).toBe(true)
    if (!control.ok) return
    expect(control.data.draft.pages[0]?.sections).toHaveLength(2)

    expect(subject.ok).toBe(true)
    if (!subject.ok) return
    const kept = subject.data.draft.pages[0]?.sections ?? []
    expect(kept).toHaveLength(1)
    expect(kept.map((s) => s.section.kind)).toEqual(['hero'])
    expect(kept.map((s) => s.section.kind)).not.toContain('testimonials')
  })

  it('names the refusal as a refusal, not as a generation failure', () => {
    const result = run([hero(), fabricatedTestimonials()])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The distinct label is the point: `dropped-section:` would file "we declined to
    // publish invented quotes" as "the model produced nothing usable", which is a
    // different claim and would hide the refusal from anyone auditing it.
    expect(result.data.dropped).toContain(fabricatedSection('/', 1, 'testimonials'))
    expect(result.data.dropped).not.toContain('dropped-section:/[1]:testimonials')
  })

  it('lets no fabricated word reach the draft, not merely no section of that kind', () => {
    // READ THE TEXT, NOT THE BOXES. A section count can fall to one while the quotes
    // survive somewhere else in the tree - merged into an adjacent section's raw bag,
    // for instance. This asserts the actual strings are absent from the whole draft.
    const result = run([hero(), fabricatedTestimonials()])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const text = renderedText(result)
    for (const invented of [
      'Priya Nair',
      'Rahul Menon',
      'Sneha Iyer',
      'Five stars',
      'never slept better',
      'What our students say',
    ]) {
      expect(text, `"${invented}" reached the draft`).not.toContain(invented)
    }
  })

  it('refuses a testimonials section even when it is the ONLY section, rather than salvaging it', () => {
    // The tempting failure: refuse the section, find the page now empty, and let some
    // later branch keep it "because a site with no pages is worse". A page that is
    // nothing but fabricated quotes must take the whole page down.
    const result = run([fabricatedTestimonials()])
    expect(result.ok).toBe(false)
    if (result.ok) return
    const dropped = (result.error.details as { dropped?: string[] } | undefined)?.dropped ?? []
    expect(dropped).toContain(fabricatedSection('/', 0, 'testimonials'))
    expect(dropped).toContain('empty-page:/')
  })

  it('refuses it in every slot, not only after a hero', () => {
    // A guard that reads the first section, or that only runs once the hero is settled,
    // passes the tests above and leaks on a page ordered differently.
    for (const [index, sections] of [
      [0, [fabricatedTestimonials(), hero(), faq()]],
      [1, [hero(), fabricatedTestimonials(), faq()]],
      [2, [hero(), faq(), fabricatedTestimonials()]],
    ] as const) {
      const result = run([...sections])
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      const kinds = (result.data.draft.pages[0]?.sections ?? []).map((s) => s.section.kind)
      expect(kinds, `slot ${index}`).not.toContain('testimonials')
      expect(result.data.dropped, `slot ${index}`).toContain(
        fabricatedSection('/', index, 'testimonials'),
      )
    }
  })

  it('refuses several in one page and names each by its own source index', () => {
    const result = run([hero(), fabricatedTestimonials(), faq(), fabricatedTestimonials()])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.dropped).toContain(fabricatedSection('/', 1, 'testimonials'))
    expect(result.data.dropped).toContain(fabricatedSection('/', 3, 'testimonials'))
    expect((result.data.draft.pages[0]?.sections ?? []).map((s) => s.section.kind)).toEqual([
      'hero',
      'faq',
    ])
  })

  it('refuses the kind, not the wording — an empty testimonials section goes too', () => {
    // Otherwise the rule is really "drop sections with quotes in them", and a model that
    // returns the kind with the quotes under an unexpected key walks straight through.
    const result = run([hero(), { kind: 'testimonials', content: {} }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.dropped).toContain(fabricatedSection('/', 1, 'testimonials'))
  })

  it('leaves every other section kind admissible, so the rule stays a rule and not a ban', () => {
    // The counter-guard. A refusal that widened to every kind would satisfy every
    // assertion above; this is what says it did not.
    for (const kind of ['hero', 'features', 'offer', 'faq', 'contact'] as const) {
      expect(isUnattestable(kind), kind).toBe(false)
    }
    expect(isUnattestable('testimonials')).toBe(true)
    expect([...UNATTESTABLE_KINDS]).toEqual(['testimonials'])
  })
})

describe('the prompt no longer asks for what the normalizer would discard', () => {
  it('omits testimonials from the permitted kinds it lists', async () => {
    // Not a safeguard - the normalizer above is. This asserts we stopped paying
    // premium-tier tokens for a section that is thrown away on arrival, and it is here
    // rather than in the mesh package because the two only make sense read together.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../mesh/src/tasks/site-generate.ts', import.meta.url), 'utf8'),
    )
    const prompt = source.slice(source.indexOf('const SYSTEM = `'), source.indexOf('const def:'))
    expect(prompt).not.toContain('"testimonials"')
    expect(prompt).toContain('never invent a customer quote')
  })
})
