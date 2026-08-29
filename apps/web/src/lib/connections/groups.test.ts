import { describe, expect, it } from 'vitest'
import { ZERNIO_PLATFORMS } from '@sahoda/shared'

import { groupChannels } from './groups'

const LIVE_VIA_ZERNIO: ReadonlySet<string> = new Set<string>(ZERNIO_PLATFORMS)

/** A workspace with nothing linked. */
const nothingLinked = () => 0

const ids = (entries: { id: string }[]) => entries.map((e) => e.id)

describe('what /connections shows a workspace with nothing linked', () => {
  it('does not offer telegram, tiktok or slack', () => {
    // The ask. Asserted on the group the page actually renders, not on the
    // helper behind it — a helper nobody calls is still a passing helper, which
    // is how the first version of this change went in with 5724 green tests and
    // no coverage of the screen at all.
    const { open, stalled } = groupChannels({
      liveVia: LIVE_VIA_ZERNIO,
      linkedCount: nothingLinked,
    })
    const offered = [...ids(open), ...ids(stalled)]
    for (const id of ['telegram', 'tiktok', 'slack']) expect(offered).not.toContain(id)
  })

  it('still offers everything else', () => {
    // The direction that catches over-hiding. Without it, withholding the whole
    // catalogue would pass the assertion above.
    const { open } = groupChannels({ liveVia: LIVE_VIA_ZERNIO, linkedCount: nothingLinked })
    for (const id of ['instagram', 'linkedin', 'x', 'gbp', 'facebook', 'youtube', 'pinterest']) {
      expect(ids(open)).toContain(id)
    }
  })
})

describe('what /connections shows a workspace that already linked one', () => {
  it('still shows a linked telegram, tiktok or slack account', () => {
    // THE GUARANTEE THAT MAKES THIS A FILTER AND NOT A DELETION.
    //
    // These accounts hold a real row and a plan slot, and Telegram publishes.
    // Hidden here, the customer keeps paying the slot and has nowhere to press
    // Disconnect — locked out of undoing something they did themselves.
    for (const id of ['telegram', 'tiktok', 'slack']) {
      const { linked, open } = groupChannels({
        liveVia: LIVE_VIA_ZERNIO,
        linkedCount: (candidate) => (candidate === id ? 1 : 0),
      })
      expect(ids(linked), `${id} is linked, so it must still be shown`).toContain(id)
      expect(ids(open), `${id} is linked, so it is not on offer`).not.toContain(id)
    }
  })

  it('keeps the withheld ids connectable, which the escape hatch depends on', () => {
    // `linked` requires `liveVia` as well. If one of these ever left
    // ZERNIO_PLATFORMS it would fall into `stalled`, which IS filtered, and a
    // live account would disappear with nothing else failing. This is that
    // dependency, written down where it will go red.
    for (const id of ['telegram', 'tiktok', 'slack']) {
      expect(LIVE_VIA_ZERNIO.has(id), `${id} must stay connectable`).toBe(true)
    }
  })
})
