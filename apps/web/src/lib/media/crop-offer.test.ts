import { describe, expect, test } from 'vitest'
import { CONSTRAINTS } from '@sahoda/shared'
import type { Channel } from '@sahoda/shared'

import { decideAttach } from '../posts/attach-decision'
import { buildOffer, isFixable, outputMimeFor } from './crop-offer'
import { targetsFor } from './targets'

/** Run the real attach decision, then offer against its real rejections. */
function offerFrom(
  channels: readonly Channel[],
  candidate: { mime: string; bytes: number; width: number; height: number },
  formats: Partial<Record<Channel, 'story' | 'text' | 'image' | 'carousel'>> = {},
  existingCount = 0,
) {
  const decision = decideAttach(channels, candidate, existingCount, formats)
  const rejections = decision.ok ? decision.warnings : decision.rejections
  return { decision, offer: buildOffer(channels, formats, candidate, rejections) }
}

const PHONE = { mime: 'image/jpeg', bytes: 900_000, width: 1080, height: 1920 }

describe('what a crop is allowed to claim it fixes', () => {
  test('an aspect violation is fixable', () => {
    expect(
      isFixable({ channel: 'instagram', violations: [{ code: 'MEDIA_ASPECT', message: '' }] }),
    ).toBe(true)
  })

  test('a photo BELOW a channel floor is NOT fixable — a crop only removes pixels', () => {
    // The trap. Cropping a 200x200 photo to meet Google Business's 250 floor is
    // impossible; the only other move is upscaling, which invents pixels nobody
    // photographed and calls the result a fix.
    expect(isFixable({ channel: 'gbp', violations: [{ code: 'MEDIA_DIMS', message: '' }] })).toBe(
      false,
    )
  })

  test('a count or a missing photo is not a shape problem at all', () => {
    expect(
      isFixable({ channel: 'x', violations: [{ code: 'MAX_MEDIA_COUNT', message: '' }] }),
    ).toBe(false)
    expect(
      isFixable({ channel: 'instagram', violations: [{ code: 'MEDIA_REQUIRED', message: '' }] }),
    ).toBe(false)
  })

  test('one unfixable violation among fixable ones makes the channel unfixable', () => {
    expect(
      isFixable({
        channel: 'gbp',
        violations: [
          { code: 'MEDIA_ASPECT', message: '' },
          { code: 'MEDIA_DIMS', message: '' },
        ],
      }),
    ).toBe(false)
  })
})

describe('the offer', () => {
  test('a 9:16 phone photo refused by instagram is offered a crop', () => {
    const { decision, offer } = offerFrom(['instagram'], PHONE)
    // The refusal is real and comes first.
    expect(decision.ok).toBe(false)
    expect(offer.offered).toBe(true)
    if (!offer.offered) throw new Error('unreachable')
    expect(offer.offer.rect.width).toBe(1080)
    expect(offer.offer.rect.height).toBe(1440)
  })

  test('every channel on the post is named in the outcomes, fixed or not', () => {
    const { offer } = offerFrom(['instagram', 'x', 'linkedin', 'gbp'], PHONE)
    if (!offer.offered) throw new Error('expected an offer')
    expect(offer.offer.outcomes.map((o) => o.channel).sort()).toEqual([
      'gbp',
      'instagram',
      'linkedin',
      'x',
    ])
  })

  test("linkedin's row quotes linkedin's own floor, never another channel's", () => {
    // RETARGETED 2026-09-03. The claim has not moved: a row states the rule the
    // Constraint Engine holds for THAT channel and never borrows a neighbour's.
    // What moved is linkedin, which declared no dimension rule at all until
    // docs/31 §2.2's 552x276 was added, so the old wording ("States no size or
    // shape rule") is now false for it.
    //
    // Every channel declares a floor today, so `crop-offer.ts`'s rule-less
    // sentence is unreachable through `targetFor`. It is kept as the honest
    // answer for a spec that declares nothing, and the day one does, this test
    // is where the sentence comes back.
    const { offer } = offerFrom(['instagram', 'linkedin'], PHONE)
    if (!offer.offered) throw new Error('expected an offer')
    const linkedin = offer.offer.outcomes.find((o) => o.channel === 'linkedin')
    expect(linkedin?.note).toContain('552')
    expect(linkedin?.note).toContain('276')
    // instagram's floor is 320 and its band 0.75-1.91; neither may appear here.
    expect(linkedin?.note).not.toContain('320')
    expect(linkedin?.note).not.toContain('1.91')
  })

  test('a photo under a floor is refused an offer, not sold an upscale', () => {
    const tiny = { mime: 'image/jpeg', bytes: 5_000, width: 200, height: 200 }
    const { decision, offer } = offerFrom(['gbp'], tiny)
    expect(decision.ok).toBe(false)
    expect(offer.offered).toBe(false)
    if (offer.offered) throw new Error('unreachable')
    // gbp's only objection is MEDIA_DIMS, which is not fixable, so there is no
    // channel left to cut a crop for.
    expect(offer.reason).toBe('nothing_fixable')
  })

  test('a channel that cannot be fixed is excluded from the crop, not blocking it', () => {
    // A 350x450 GIF on instagram + gbp. Both channels object, so this is a real
    // refusal rather than a warning:
    //   instagram  — MEDIA_TYPE only (350 clears its 320 floor and 0.78 sits
    //                inside the 0.75-1.91 band). Fixable: re-encode it.
    //   gbp        — MEDIA_TYPE and MEDIA_DIMS (350 is under its 400 floor).
    //                Not fixable, because no crop makes a photo wider.
    // So the fix is cut for instagram, and gbp is told plainly that it still
    // will not take the file.
    //
    // RETARGETED 2026-09-03, roles swapped, claim identical. gbp's floor was
    // 250, below instagram's 320, so gbp could never be the one failing on size;
    // docs/31 §2.4 puts it at 400x300, above instagram's, and the pairing this
    // test needs is now the other way round. Reaching the case at all still
    // takes a mime violation.
    const gif = { mime: 'image/gif', bytes: 300_000, width: 350, height: 450 }
    const { decision, offer } = offerFrom(['instagram', 'gbp'], gif)
    expect(decision.ok).toBe(false)
    expect(offer.offered).toBe(true)
    if (!offer.offered) throw new Error('unreachable')
    expect(offer.offer.targets.map((t) => t.channel)).toEqual(['instagram'])
    expect(offer.offer.outcomes.find((o) => o.channel === 'instagram')?.fixed).toBe(true)
    expect(offer.offer.outcomes.find((o) => o.channel === 'gbp')?.fixed).toBe(false)
    // …and the fix for gbp is the transcode: a gif becomes a png.
    expect(offer.offer.outputMime).toBe('image/png')
  })

  test('a photo too small for instagram is a WARNING when another channel takes it', () => {
    // The control for the case above, and the reason it needed a gif. With a
    // jpeg, x raises no objection at all, `decideAttach` returns ok, and the
    // file is attached with instagram carried as a warning — there is no refusal
    // to offer a fix for. An offer shown here would be a fix for a problem the
    // person does not have.
    //
    // RETARGETED 2026-09-03 from gbp to x, for the same reason as the case
    // above: gbp's floor is now 400x300 (docs/31 §2.4), so a 300x400 jpeg is no
    // longer a file it takes without comment. x's floor is 4x4, so it is.
    const strip = { mime: 'image/jpeg', bytes: 300_000, width: 300, height: 400 }
    const { decision } = offerFrom(['instagram', 'x'], strip)
    expect(decision.ok).toBe(true)
    if (!decision.ok) throw new Error('unreachable')
    expect(decision.warnings.map((w) => w.channel)).toEqual(['instagram'])
  })

  test('a count violation is never offered a crop', () => {
    // Four photos already on an X post. Cropping the fifth changes nothing.
    const fine = { mime: 'image/jpeg', bytes: 100_000, width: 1000, height: 1000 }
    const { decision, offer } = offerFrom(['x'], fine, {}, 4)
    expect(decision.ok).toBe(false)
    expect(offer.offered).toBe(false)
  })

  test('a photo that already fits is not offered a pointless identical copy', () => {
    const square = { mime: 'image/jpeg', bytes: 100_000, width: 1080, height: 1080 }
    const { decision, offer } = offerFrom(['instagram'], square)
    expect(decision.ok).toBe(true)
    expect(offer.offered).toBe(false)
  })

  test('a landscape photo on a STORY is offered an upright crop', () => {
    const landscape = { mime: 'image/jpeg', bytes: 400_000, width: 1920, height: 1080 }
    const { offer } = offerFrom(['instagram'], landscape, { instagram: 'story' })
    expect(offer.offered).toBe(true)
    if (!offer.offered) throw new Error('unreachable')
    expect(offer.offer.rect.width / offer.offer.rect.height).toBeLessThanOrEqual(1)
  })
})

describe('the output container', () => {
  test('webp only where a channel actually declares it — which is x alone', () => {
    // "WebP where the channel accepts it" reads as one channel once the specs are
    // read: only x lists image/webp in mediaTypes.
    expect(outputMimeFor('image/jpeg', targetsFor(['x'], {}))).toBe('image/webp')
    for (const channel of ['gbp', 'linkedin', 'instagram'] as const) {
      expect(CONSTRAINTS[channel].mediaTypes).not.toContain('image/webp')
      expect(outputMimeFor('image/jpeg', targetsFor([channel], {}))).toBe('image/jpeg')
    }
  })

  test('a mixed channel set keeps the original container rather than minting a reject', () => {
    // A webp for a Google Business post is a file validateMedia refuses with
    // MEDIA_TYPE — a derivative that fails the gate that asked for it.
    expect(outputMimeFor('image/png', targetsFor(['x', 'gbp'], {}))).toBe('image/png')
  })

  test('a gif bound for a channel that will not take one becomes a png, not a jpeg', () => {
    // A gif is graphics or line art. png is lossless; jpeg would band the flats.
    expect(outputMimeFor('image/gif', targetsFor(['instagram'], {}))).toBe('image/png')
  })

  test('every container it picks is one every target channel actually accepts', () => {
    const sets: Channel[][] = [
      ['x'],
      ['gbp'],
      ['linkedin'],
      ['instagram'],
      ['x', 'instagram'],
      ['x', 'gbp', 'linkedin', 'instagram'],
    ]
    for (const set of sets) {
      const targets = targetsFor(set, {})
      for (const original of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
        const chosen = outputMimeFor(original, targets)
        expect(chosen).not.toBeNull()
        for (const target of targets) {
          expect(target.mimes).toContain(chosen!)
        }
      }
    }
  })
})
