import { describe, expect, it } from 'vitest'
import { ChannelSchema, ConnectionPlatformSchema } from '@sahoda/shared'

import {
  CATALOGUE,
  CONNECTABLE,
  PLANNED,
  PLANNED_CHANNELS,
  READINESS_CLASS,
  READINESS_LABEL,
  ENTRY,
  asChannel,
  isOfferedForConnect,
} from './catalogue'

describe('the channel catalogue', () => {
  it('offers every platform the CONNECTIONS table can actually hold', () => {
    // RETARGETED FROM `ChannelSchema`, and the move is the whole point rather
    // than an accommodation. This asserted that the connectable set equals what
    // Sahoda can PUBLISH to, which was right only while every connectable
    // platform was also publishable. Eight are not, so the old form would have
    // demanded that /connections hide eight platforms the schema, the start
    // route and the plan gate all accept.
    //
    // The claim is unchanged in shape: /connections must not silently show fewer
    // platforms than the database can hold. It now asks the enum that actually
    // governs `connections.platform`.
    expect(CONNECTABLE.map((e) => e.id).sort()).toEqual(
      [...ConnectionPlatformSchema.options].sort(),
    )
  })

  it('offers NO platform the connections table would reject', () => {
    // The other direction, and the one that costs a customer something real. A
    // tile outside this enum gets a Connect button, sends them to a genuine
    // consent screen, and `upsert_zernio_connection` then raises INVALID_PLATFORM
    // on the way back — a grant given at the platform for a row that cannot
    // exist, and no way to undo the grant.
    const holdable = new Set<string>(ConnectionPlatformSchema.options)
    for (const entry of CONNECTABLE) expect(holdable.has(entry.id)).toBe(true)
  })

  it('keeps every connect-only platform OUT of the publishable set', () => {
    // The separation this whole change rests on. A platform with no
    // `PlatformSpec` reaching `Channel` would mean the composer offering a target
    // with no limits, no formatter and no adapter — the fabricated figure the
    // Constraint Engine exists to prevent.
    const publishable = new Set<string>(ChannelSchema.options)
    for (const entry of CONNECTABLE) {
      if (entry.readiness === 'connect-only') {
        expect(publishable.has(entry.id)).toBe(false)
        expect(asChannel(entry.id)).toBeNull()
      }
    }
    // And it is not vacuous. If this set ever empties, the assertion above stops
    // testing anything and would pass in silence.
    expect(CONNECTABLE.filter((e) => e.readiness === 'connect-only').length).toBeGreaterThan(0)
  })

  it('keeps planned channels OUT of the connectable set', () => {
    // The load-bearing separation. A planned channel with a Connect button is a
    // tile that looks connectable and is not.
    for (const id of PLANNED_CHANNELS) {
      expect(asChannel(id)).toBeNull()
      expect(CONNECTABLE.some((e) => e.id === id)).toBe(false)
    }
    expect(PLANNED).toHaveLength(PLANNED_CHANNELS.length)
  })

  it('marks every planned channel not-built, and nothing else', () => {
    // A planned channel with any other readiness would claim an adapter exists
    // for something `packages/publishing` has no file for. And the reverse:
    // `not-built` on a CONNECTABLE tile would put "Coming soon" over a working
    // Connect button.
    for (const entry of PLANNED) expect(entry.readiness).toBe('not-built')
    for (const entry of CONNECTABLE) expect(entry.readiness).not.toBe('not-built')
  })

  it('gives every channel a unique id and a label', () => {
    const ids = CATALOGUE.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of CATALOGUE) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.short.length).toBeGreaterThan(0)
      expect(entry.kind.length).toBeGreaterThan(0)
    }
  })

  it('keeps the three levels of PUBLISHING certainty on three different classes', () => {
    // `docs/26` §3: a rung is only a signal when something else is on a different
    // one. Two rungs sharing a class is the /posts defect — three statuses, one
    // chip, nothing structural left to tell them apart.
    //
    // RETARGETED from "all rungs are distinct" to "the three LEVELS are". There
    // are four rungs now and three levels, because `connect-only` and `not-built`
    // are the same answer to the question this ladder ranks — can Sahoda publish
    // here — and the ladder must not pretend otherwise by inventing a fourth
    // treatment for a distinction it does not measure.
    const levels = ['publishes-today', 'built-not-proven', 'connect-only'] as const
    const classes = levels.map((rung) => READINESS_CLASS[rung])
    expect(new Set(classes).size).toBe(classes.length)
  })

  it('tells the two unpublishable rungs apart in WORDS, since they share a class', () => {
    // The cost of the retarget above, paid explicitly. `connect-only` and
    // `not-built` look identical, so the only thing separating them is the
    // sentence — and what the reader can DO about them could not differ more:
    // one has a working Connect button and the other must never have one.
    expect(READINESS_CLASS['connect-only']).toBe(READINESS_CLASS['not-built'])
    expect(READINESS_LABEL['connect-only']).not.toBe(READINESS_LABEL['not-built'])
    // And neither may imply the other's situation. "Coming soon" on a platform
    // you can link today understates it; "Connect only" on Snapchat offers a
    // remedy that 403 makes impossible.
    expect(READINESS_LABEL['connect-only']).not.toMatch(/soon|coming/i)
    expect(READINESS_LABEL['not-built']).not.toMatch(/connect/i)
  })

  it('never labels an unproven channel as verified', () => {
    // "Not proven live" is a claim about evidence. Any wording that implies a
    // check was performed and passed would be a different, false claim.
    expect(READINESS_LABEL['built-not-proven']).not.toMatch(/verified|checked|tested/i)
    expect(READINESS_LABEL['publishes-today']).toMatch(/publish/i)
  })
})

describe('the channels /connections does not offer', () => {
  it('withholds telegram, tiktok and slack from the offer', () => {
    // The ask, stated as the thing the customer would see. Anchored to the ids
    // rather than to the size of the set, so adding a fourth later does not
    // silently retire this assertion.
    for (const id of ['telegram', 'tiktok', 'slack'] as const) {
      expect(isOfferedForConnect(id)).toBe(false)
    }
  })

  it('keeps every other connectable platform on offer', () => {
    // The other direction, and the one that catches a typo in the set. A set
    // holding 'tik-tok' would pass the test above by accident of the literal and
    // hide nothing; this fails if the hidden set grows a member nobody asked for.
    const withheld = CONNECTABLE.filter((entry) => !isOfferedForConnect(entry.id)).map((e) => e.id)
    expect(withheld.sort()).toEqual(['slack', 'telegram', 'tiktok'])
  })

  it('still describes all three, so an EXISTING connection can render', () => {
    // The guarantee that makes this a filter and not a deletion. A workspace that
    // already linked one of these holds a live row and a plan slot; "Your
    // channels" looks the entry up by id for its name and logo, and a missing
    // entry there is an account that publishes and cannot be seen or disconnected.
    for (const id of ['telegram', 'tiktok', 'slack'] as const) {
      expect(ENTRY[id]).toBeDefined()
      expect(ENTRY[id].label.length).toBeGreaterThan(0)
    }
  })
})
