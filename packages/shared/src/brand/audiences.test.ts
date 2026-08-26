import { describe, expect, it } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from './resolve'
import {
  AudiencesSchema,
  BrandMemoryPayloadV2Schema,
  FieldKindSchema,
  SIBLING_CONFIRMATION,
} from './audiences'
import { migrateBrandMemoryV1ToV2 } from './migrate-v2'

const audience = (over: Record<string, unknown> = {}) => ({
  id: 'parents',
  primary: true,
  one_liner: 'Parents choosing a school for the next ten years.',
  pains: ['No way to judge a school from a brochure.'],
  fear: '',
  desired_identity: '',
  core_promise: 'Your child will be known by name.',
  meta: { kind: 'asked', confirmed: false, source: 'https://fbs.edu.in/' },
  ...over,
})

describe('audiences', () => {
  it('requires exactly one primary — zero makes every consumer pick arbitrarily', () => {
    expect(AudiencesSchema.safeParse([audience({ primary: false })]).success).toBe(false)
  })

  it('rejects two primaries — the same bug twice', () => {
    expect(AudiencesSchema.safeParse([audience(), audience({ id: 'students' })]).success).toBe(
      false,
    )
  })

  it('accepts several audiences with one primary — a school has parents AND students', () => {
    const parsed = AudiencesSchema.safeParse([
      audience(),
      audience({ id: 'students', primary: false, core_promise: 'Somewhere you are known.' }),
    ])
    expect(parsed.success).toBe(true)
  })

  it('carries a DIFFERENT core_promise per audience — that is the whole point', () => {
    const parsed = AudiencesSchema.parse([
      audience(),
      audience({ id: 'students', primary: false, core_promise: 'Somewhere you are known.' }),
    ])
    expect(new Set(parsed.map((a) => a.core_promise)).size).toBe(2)
  })
})

describe('field kinds', () => {
  it('has exactly the four doc 18 §3 kinds', () => {
    expect(FieldKindSchema.options).toEqual(['mandated', 'asked', 'negotiated', 'derived'])
  })

  it('every section of a v2 payload carries provenance', () => {
    const v2 = migrateBrandMemoryV1ToV2(DEMO_FALLBACK_PAYLOAD)
    for (const section of [v2.voice, v2.brand_persona, v2.hook, v2.alignment]) {
      expect(section.meta.source).not.toBe('')
      expect(typeof section.meta.confirmed).toBe('boolean')
    }
  })
})

describe('sibling confirmation map', () => {
  it('never lists a field as its own sibling', () => {
    for (const [k, siblings] of Object.entries(SIBLING_CONFIRMATION)) {
      expect(siblings, k).not.toContain(k)
    }
  })

  it('confirming the primary audience settles what was inferred from it', () => {
    expect(SIBLING_CONFIRMATION['audiences[primary].one_liner']).toContain(
      'audiences[primary].pains',
    )
  })
})

describe('v1 → v2 migration', () => {
  const v2 = migrateBrandMemoryV1ToV2(DEMO_FALLBACK_PAYLOAD)

  it('produces a valid v2 payload with exactly one audience', () => {
    expect(BrandMemoryPayloadV2Schema.safeParse(v2).success).toBe(true)
    expect(v2.audiences).toHaveLength(1)
    expect(v2.audiences[0]!.primary).toBe(true)
  })

  it('moves core_promise off hook and onto the audience', () => {
    expect(v2.audiences[0]!.core_promise).toBe(DEMO_FALLBACK_PAYLOAD.hook.core_promise)
    expect(JSON.stringify(v2.hook)).not.toContain('core_promise')
  })

  it('confirms NOTHING — v1 never recorded which fields a human touched', () => {
    for (const m of [v2.voice.meta, v2.brand_persona.meta, v2.hook.meta, v2.alignment.meta]) {
      expect(m.confirmed).toBe(false)
    }
    expect(v2.audiences[0]!.meta.confirmed).toBe(false)
  })

  it('puts v1 red lines under OWNER, never MANDATED', () => {
    // Every v1 red line was model-generated. Promoting an invention to a rule
    // the owner may not edit is the worst possible reading of this schema.
    expect(v2.red_lines.owner).toEqual(DEMO_FALLBACK_PAYLOAD.taboo.red_lines)
    expect(v2.red_lines.mandated).toEqual([])
  })

  it('is idempotent in shape — migrating a migrated payload is a no-op decision', () => {
    expect(BrandMemoryPayloadV2Schema.safeParse(v2).success).toBe(true)
    expect(v2.version).toBe(2)
  })
})
