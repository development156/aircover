import { ChannelSchema, ContentVariantsOutputSchema } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { filterVariants } from './filter-variants'

describe('filterVariants', () => {
  test('returns every requested channel when the model answered all of them', () => {
    const result = filterVariants(['x', 'linkedin'], {
      variants: [
        { channel: 'x', body: 'Short and sharp.' },
        { channel: 'linkedin', body: 'A longer, more considered take.' },
      ],
    })

    expect(result.variants.map((v) => v.channel)).toEqual(['x', 'linkedin'])
    expect(result.missing).toEqual([])
    expect(result.unexpected).toEqual([])
  })

  test('reports a requested channel the model never returned as missing', () => {
    const result = filterVariants(['x', 'gbp', 'linkedin'], {
      variants: [
        { channel: 'x', body: 'Short and sharp.' },
        { channel: 'linkedin', body: 'A longer take.' },
      ],
    })

    expect(result.variants.map((v) => v.channel)).toEqual(['x', 'linkedin'])
    expect(result.missing).toEqual(['gbp'])
  })

  test('keeps the first of two duplicate variants for the same channel', () => {
    const result = filterVariants(['x'], {
      variants: [
        { channel: 'x', body: 'First one wins.' },
        { channel: 'x', body: 'Second one is dropped.' },
      ],
    })

    expect(result.variants).toHaveLength(1)
    expect(result.variants[0]?.body).toBe('First one wins.')
    expect(result.missing).toEqual([])
  })

  test('drops a channel that was returned but never requested', () => {
    const result = filterVariants(['x'], {
      variants: [
        { channel: 'x', body: 'Requested.' },
        { channel: 'instagram', body: 'Nobody asked for this.' },
      ],
    })

    expect(result.variants.map((v) => v.channel)).toEqual(['x'])
    expect(result.unexpected).toEqual(['instagram'])
  })

  test('reports the same unexpected channel only once even if returned twice', () => {
    const result = filterVariants(['x'], {
      variants: [
        { channel: 'x', body: 'Requested.' },
        { channel: 'instagram', body: 'Uninvited.' },
        { channel: 'instagram', body: 'Uninvited again.' },
      ],
    })

    expect(result.unexpected).toEqual(['instagram'])
  })

  test('treats a whitespace-only body as a failed generation, not a variant', () => {
    const result = filterVariants(['x', 'gbp'], {
      variants: [
        { channel: 'x', body: 'Real copy.' },
        { channel: 'gbp', body: '   \n\t  ' },
      ],
    })

    expect(result.variants.map((v) => v.channel)).toEqual(['x'])
    expect(result.missing).toEqual(['gbp'])
  })

  test('treats an empty-string body as a failed generation, not a variant', () => {
    const result = filterVariants(['gbp'], {
      variants: [{ channel: 'gbp', body: '' }],
    })

    expect(result.variants).toEqual([])
    expect(result.missing).toEqual(['gbp'])
  })

  test('reports every requested channel as missing when variants is empty', () => {
    const result = filterVariants(['x', 'gbp', 'linkedin', 'instagram'], {
      variants: [],
    })

    expect(result.variants).toEqual([])
    expect(result.missing).toEqual(['x', 'gbp', 'linkedin', 'instagram'])
    expect(result.unexpected).toEqual([])
  })

  test('passes extras through as the same object, untouched', () => {
    const extras = { hashtags: ['#chai', '#books'], gbpCta: 'LEARN_MORE' }
    const result = filterVariants(['instagram'], {
      variants: [{ channel: 'instagram', body: 'Caption.', extras }],
    })

    expect(result.variants[0]?.extras).toBe(extras)
  })

  test('accepts a zod-parsed content_variants mesh output as-is', () => {
    // Pins the signature to the frozen contract: if this module ever restates
    // the variant shape instead of deriving it, this stops compiling.
    const output = ContentVariantsOutputSchema.parse({
      variants: [
        { channel: 'x', body: 'From the real schema.', extras: { hashtags: ['#chai'] } },
        { channel: 'gbp', body: '   ' },
      ],
    })

    const result = filterVariants(['x', 'gbp'], output)

    expect(result.variants.map((v) => v.channel)).toEqual(['x'])
    expect(result.variants[0]?.extras?.hashtags).toEqual(['#chai'])
    expect(result.missing).toEqual(['gbp'])
  })

  test('treats a null extras as absent instead of emitting the key', () => {
    // `null` is off-contract for mesh output but arrives from `post_variants.extras`
    // jsonb round-trips. Consumers test key presence, so it must not surface.
    const result = filterVariants(['x'], {
      variants: [{ channel: 'x', body: 'Copy.', extras: null as unknown as undefined }],
    })

    expect(result.variants[0]).not.toHaveProperty('extras')
  })

  test('omits extras entirely when the model returned none', () => {
    const result = filterVariants(['x'], {
      variants: [{ channel: 'x', body: 'No extras here.' }],
    })

    expect(result.variants[0]).not.toHaveProperty('extras')
  })

  test('orders variants by the requested order, not the order the model returned them', () => {
    const result = filterVariants(['x', 'gbp', 'linkedin'], {
      variants: [
        { channel: 'linkedin', body: 'Third requested.' },
        { channel: 'gbp', body: 'Second requested.' },
        { channel: 'x', body: 'First requested.' },
      ],
    })

    expect(result.variants.map((v) => v.channel)).toEqual(['x', 'gbp', 'linkedin'])
  })

  test('orders missing channels by the requested order', () => {
    const result = filterVariants(['linkedin', 'x', 'gbp'], {
      variants: [{ channel: 'x', body: 'Only this one.' }],
    })

    expect(result.missing).toEqual(['linkedin', 'gbp'])
  })

  test('pins the blank-then-valid duplicate ruling: a blank body is not an occurrence, so the valid duplicate is kept', () => {
    // "First occurrence wins" applies to real generations only. A blank body is
    // a failed generation, so it never claims the channel slot — otherwise a
    // usable variant would be thrown away in favour of nothing. A future change
    // here must be deliberate.
    const result = filterVariants(['x'], {
      variants: [
        { channel: 'x', body: '   ' },
        { channel: 'x', body: 'Usable copy.' },
      ],
    })

    expect(result.variants).toHaveLength(1)
    expect(result.variants[0]?.body).toBe('Usable copy.')
    expect(result.missing).toEqual([])
  })

  test('does not emit a channel twice when the caller requests it twice', () => {
    const result = filterVariants(['x', 'x'], {
      variants: [{ channel: 'x', body: 'Once is enough.' }],
    })

    expect(result.variants.map((v) => v.channel)).toEqual(['x'])
    expect(result.missing).toEqual([])
  })

  test('never leaks internals: missing and unexpected carry bare channel ids only', () => {
    const result = filterVariants(['x', 'gbp'], {
      variants: [{ channel: 'instagram', body: 'Uninvited.' }],
    })

    for (const channel of [...result.missing, ...result.unexpected]) {
      expect(ChannelSchema.safeParse(channel).success).toBe(true)
      expect(channel).not.toMatch(/select|insert|error|key|workspace_id|\s/i)
    }
  })

  test('does not mutate the caller’s requested array or output object', () => {
    const requested: readonly ['x', 'gbp'] = ['x', 'gbp']
    const variants = [{ channel: 'x' as const, body: 'Copy.' }]
    const output = { variants }

    filterVariants(requested, output)

    expect(requested).toEqual(['x', 'gbp'])
    expect(output.variants).toBe(variants)
    expect(variants).toHaveLength(1)
    expect(variants[0]).toEqual({ channel: 'x', body: 'Copy.' })
  })
})
