import { describe, expect, it } from 'vitest'
import { ChannelSchema } from '@sahoda/shared'

import {
  CATALOGUE,
  CONNECTABLE,
  PLANNED,
  PLANNED_CHANNELS,
  READINESS_CLASS,
  READINESS_LABEL,
  asChannel,
} from './catalogue'

describe('the channel catalogue', () => {
  it('offers every channel the database can actually hold', () => {
    // If a fifth channel is ever added to `ChannelSchema`, /connections must not
    // silently keep showing four. This fails the day the enum widens.
    expect(CONNECTABLE.map((e) => e.id).sort()).toEqual([...ChannelSchema.options].sort())
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
    // for something `packages/publishing` has no file for.
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

  it('puts the three readiness rungs on three DIFFERENT certainty classes', () => {
    // `docs/26` §3: a rung is only a signal when something else is on a different
    // one. Two rungs sharing a class is the /posts defect — three statuses, one
    // chip, nothing structural left to tell them apart.
    const classes = Object.values(READINESS_CLASS)
    expect(new Set(classes).size).toBe(classes.length)
  })

  it('never labels an unproven channel as verified', () => {
    // "Not proven live" is a claim about evidence. Any wording that implies a
    // check was performed and passed would be a different, false claim.
    expect(READINESS_LABEL['built-not-proven']).not.toMatch(/verified|checked|tested/i)
    expect(READINESS_LABEL['publishes-today']).toMatch(/publish/i)
  })
})
