import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { CONSTRAINTS, type Channel } from '@sahoda/shared'

import {
  CHANNEL_FORMATS,
  POST_FORMATS,
  acceptsVideo,
  defaultFormatFor,
  formatsFor,
  mediaRuleFor,
  refuseFormat,
  refuseFormatMedia,
  type PostFormat,
} from './format'

/**
 * The format rules, and the fact they are DERIVED rather than restated.
 *
 * ── WHAT WOULD MAKE THESE TESTS WORTHLESS ────────────────────────────────────
 * Asserting `refuseFormat(instagram, 'video', 1)` refuses, and stopping there.
 * That passes against a hardcoded "video is impossible" list, which is the wrong
 * implementation: the frozen Constraint Engine is the thing that decides what a
 * channel accepts, and a second list beside it goes stale silently — this repo
 * has a standing rule about exactly that, and a card about three copies of a
 * four-entry list.
 *
 * So the tests below assert the DERIVATION: video is refused BECAUSE no channel
 * declares a `video/*` mime, and the moment one does the refusal must stop.
 *
 * The two channel formats — story, thread — cannot be derived and are declared in
 * `CHANNEL_FORMATS`. They are tested against that table rather than against a
 * repeated literal, so the table stays the only place the fact is written.
 */

describe('what the four channels can genuinely publish', () => {
  it('offers text everywhere except Instagram, which has no text-only post', () => {
    expect(formatsFor(CONSTRAINTS.x)).toContain('text')
    expect(formatsFor(CONSTRAINTS.gbp)).toContain('text')
    expect(formatsFor(CONSTRAINTS.linkedin)).toContain('text')
    // `requiresMedia: true` — the engine's own field, not a list kept here.
    expect(formatsFor(CONSTRAINTS.instagram)).not.toContain('text')
  })

  it('offers image everywhere', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(formatsFor(spec)).toContain('image')
    }
  })

  it('offers a set only where more than one image fits', () => {
    // GBP takes one. X 4, LinkedIn 9, Instagram 10.
    expect(formatsFor(CONSTRAINTS.gbp)).not.toContain('carousel')
    expect(formatsFor(CONSTRAINTS.x)).toContain('carousel')
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(formatsFor(spec).includes('carousel')).toBe(spec.maxMediaCount > 1)
    }
  })

  it('offers video NOWHERE, because no channel declares a video mime', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(acceptsVideo(spec)).toBe(false)
      expect(formatsFor(spec)).not.toContain('video')
    }
  })

  it('offers each channel format exactly where CHANNEL_FORMATS declares it', () => {
    // Composed, not replaced: the table adds to the derived list, and nothing
    // outside the table may appear. A channel format that leaked onto a second
    // channel by a stray literal fails here.
    for (const channel of Object.keys(CONSTRAINTS) as Channel[]) {
      const offered = formatsFor(CONSTRAINTS[channel])
      const declared = CHANNEL_FORMATS[channel] ?? []
      for (const format of ['story', 'thread'] as const) {
        expect(offered.includes(format)).toBe(declared.includes(format))
      }
    }
    // And the table says what docs/31 §5 says it says.
    expect(CHANNEL_FORMATS.instagram).toEqual(['story'])
    expect(CHANNEL_FORMATS.x).toEqual(['thread'])
    expect(CHANNEL_FORMATS.linkedin).toBeUndefined()
    expect(CHANNEL_FORMATS.gbp).toBeUndefined()
  })

  it('never offers a format whose minimum exceeds what the channel can carry', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      for (const format of formatsFor(spec)) {
        const rule = mediaRuleFor(spec, format)
        expect(rule.minItems).toBeLessThanOrEqual(rule.maxItems)
      }
    }
  })
})

describe('the format a channel opens on', () => {
  it('is derived from requiresMedia, not tabulated', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(defaultFormatFor(spec)).toBe(spec.requiresMedia === true ? 'image' : 'text')
    }
    expect(defaultFormatFor(CONSTRAINTS.instagram)).toBe('image')
    expect(defaultFormatFor(CONSTRAINTS.x)).toBe('text')
  })

  it('is always a format that channel actually offers', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(formatsFor(spec)).toContain(defaultFormatFor(spec))
    }
  })
})

describe('the channel cap is folded into the format rule', () => {
  it('resolves an open-ended set to the channel’s own maximum', () => {
    expect(mediaRuleFor(CONSTRAINTS.x, 'carousel').maxItems).toBe(CONSTRAINTS.x.maxMediaCount)
    expect(mediaRuleFor(CONSTRAINTS.instagram, 'carousel').maxItems).toBe(
      CONSTRAINTS.instagram.maxMediaCount,
    )
    // Not the same number, which is the point of resolving rather than quoting.
    expect(mediaRuleFor(CONSTRAINTS.x, 'carousel').maxItems).not.toBe(
      mediaRuleFor(CONSTRAINTS.instagram, 'carousel').maxItems,
    )
  })

  it('never lets a format widen a channel’s own limit', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      for (const format of POST_FORMATS) {
        expect(mediaRuleFor(spec, format).maxItems).toBeLessThanOrEqual(spec.maxMediaCount)
      }
    }
  })
})

describe('a version that is not what it says it is', () => {
  it('lets every existing variant through, because null states no intent', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      for (const count of [0, 1, 5, 50]) {
        expect(refuseFormat(spec, null, count)).toBeNull()
        expect(refuseFormat(spec, undefined, count)).toBeNull()
      }
    }
  })

  it('refuses a text-only post carrying an image, which nothing else can see', () => {
    // The Constraint Engine finds one image on X perfectly legal — it is. Only
    // the declared format knows the writer did not mean to send one.
    expect(refuseFormat(CONSTRAINTS.x, 'text', 1)?.code).toBe('FORMAT_CONTRADICTED')
    expect(refuseFormat(CONSTRAINTS.x, 'text', 0)).toBeNull()
  })

  it('refuses a photo post with no photo, which publishes as bare text today', () => {
    expect(refuseFormat(CONSTRAINTS.x, 'image', 0)?.code).toBe('FORMAT_NEEDS_MEDIA')
    expect(refuseFormat(CONSTRAINTS.linkedin, 'carousel', 1)?.code).toBe('FORMAT_NEEDS_MEDIA')
    expect(refuseFormat(CONSTRAINTS.linkedin, 'carousel', 2)).toBeNull()
  })

  it('refuses four photos on a version that says one', () => {
    expect(refuseFormat(CONSTRAINTS.x, 'image', 4)?.code).toBe('FORMAT_CONTRADICTED')
    expect(refuseFormat(CONSTRAINTS.x, 'image', 1)).toBeNull()
  })

  it('refuses a format on a channel that does not have it', () => {
    expect(refuseFormat(CONSTRAINTS.linkedin, 'story', 1)?.code).toBe('FORMAT_UNSUPPORTED')
    expect(refuseFormat(CONSTRAINTS.gbp, 'thread', 0)?.code).toBe('FORMAT_UNSUPPORTED')
    expect(refuseFormat(CONSTRAINTS.instagram, 'story', 1)).toBeNull()
    expect(refuseFormat(CONSTRAINTS.x, 'thread', 0)).toBeNull()
  })

  it('refuses a story with nothing in it, and a story with two things in it', () => {
    expect(refuseFormat(CONSTRAINTS.instagram, 'story', 0)?.code).toBe('FORMAT_NEEDS_MEDIA')
    expect(refuseFormat(CONSTRAINTS.instagram, 'story', 2)?.code).toBe('FORMAT_CONTRADICTED')
  })

  it('refuses Instagram text-only against requiresMedia, not against a list', () => {
    expect(refuseFormat(CONSTRAINTS.instagram, 'text', 0)?.code).toBe('FORMAT_NEEDS_MEDIA')
    expect(CONSTRAINTS.instagram.requiresMedia).toBe(true)
  })

  it('refuses video everywhere BECAUSE no channel declares a video mime', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(refuseFormat(spec, 'video', 1)?.code).toBe('FORMAT_UNSUPPORTED')
    }
  })

  it('says what is wrong in words about the post, never a field name', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      for (const format of POST_FORMATS) {
        for (const count of [0, 1, 2, 11]) {
          const refusal = refuseFormat(spec, format, count)
          if (refusal === null) continue
          expect(refusal.message).not.toMatch(/mediaCount|maxItems|minItems|undefined|null/)
          expect(refusal.message.length).toBeGreaterThan(10)
        }
      }
    }
  })
})

describe('the shape of a story’s photo, checked where the pixels are', () => {
  const ig = CONSTRAINTS.instagram

  it('refuses a landscape photo — the actual mistake', () => {
    // A 1920x1080 feed photo dropped into a story. 1.78 : 1.
    const refusal = refuseFormatMedia(ig, 'story', { width: 1920, height: 1080 })
    expect(refusal?.code).toBe('FORMAT_MEDIA_ASPECT')
    expect(refusal?.message).toContain('1.78')
  })

  it('accepts every upright shape Instagram letterboxes, not only 9:16', () => {
    for (const [width, height] of [
      [1080, 1920], // 9:16, the documented target
      [1080, 1350], // 4:5
      [1080, 1080], // square
    ]) {
      expect(refuseFormatMedia(ig, 'story', { width, height })).toBeNull()
    }
  })

  it('says nothing when the dimensions are unknown, rather than refusing', () => {
    expect(refuseFormatMedia(ig, 'story', {})).toBeNull()
    expect(refuseFormatMedia(ig, 'story', { width: 1080 })).toBeNull()
    expect(refuseFormatMedia(ig, 'story', { width: 1080, height: 0 })).toBeNull()
  })

  it('leaves every other format to the Constraint Engine’s own aspect rule', () => {
    for (const format of POST_FORMATS) {
      if (format === 'story') continue
      expect(refuseFormatMedia(ig, format, { width: 1920, height: 1080 })).toBeNull()
    }
    expect(refuseFormatMedia(ig, null, { width: 1920, height: 1080 })).toBeNull()
  })
})

/**
 * ── THE ONE THAT CATCHES THE WORST FAILURE ──────────────────────────────────
 * `post_variants.format` is a CHECK constraint over literal strings. A value in
 * `POST_FORMATS` that the CHECK rejects is a picker entry whose choice the
 * database refuses — the writer picks it, the save fails, and the format silently
 * never lands. A value in the CHECK that is missing here reads back as "nobody
 * said" and the post is held to nothing.
 *
 * So the migration files are the fixture. Read, not restated.
 */
describe('the vocabulary and the database agree', () => {
  const MIGRATIONS = join(import.meta.dirname, '../../db/supabase/migrations')

  function allowedByCheck(): string[] {
    const files = readdirSync(MIGRATIONS)
      .filter((name) => name.includes('post_variant_format') || name.includes('variant_formats'))
      .sort()
    expect(files.length).toBeGreaterThan(0)
    // The LAST migration touching the column owns the domain.
    const sql = readFileSync(join(MIGRATIONS, files[files.length - 1]!), 'utf8')
    const clause = sql.match(/format\s+in\s*\(([^)]*)\)/i)
    expect(clause).not.toBeNull()
    return [...clause![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
  }

  it('offers exactly the values the CHECK constraint accepts', () => {
    expect([...POST_FORMATS].sort()).toEqual(allowedByCheck().sort())
  })

  it('and the fixture is real — the CHECK actually names some formats', () => {
    // Guards the guard: a regex that silently matched nothing would make the
    // assertion above compare two empty lists and pass forever.
    expect(allowedByCheck()).toContain('text')
    expect(allowedByCheck().length).toBe(POST_FORMATS.length)
  })

  it('never offers a format that no channel can publish', () => {
    const offered = new Set<PostFormat>()
    for (const spec of Object.values(CONSTRAINTS)) for (const f of formatsFor(spec)) offered.add(f)
    // `video` is the deliberate exception: storable, never offered, because the
    // media pipeline cannot ingest a video (docs/31 §5.1).
    expect([...offered].sort()).toEqual(
      POST_FORMATS.filter((f) => f !== 'video')
        .slice()
        .sort(),
    )
  })
})
