import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { cardHeadline, splitCardDetail, TECHNICAL_MARKER } from './card-copy'

/**
 * The marker is a magic string that exists in two languages — the `.mjs` that
 * writes cards and the `.ts` that renders them. Two hand-kept copies of the
 * same value is exactly the shape that drifted seventeen cards apart in SL-060,
 * so the copies are compared here rather than trusted.
 */
const CARDS_SOURCE = resolve(import.meta.dirname, '../../../../../scripts/lib/ops-cards.mjs')

describe('the marker cannot drift from the writer that produces it', () => {
  it('matches the constant the source list is written with', async () => {
    const mod = (await import(CARDS_SOURCE)) as { TECHNICAL_MARKER: string }
    expect(mod.TECHNICAL_MARKER).toBe(TECHNICAL_MARKER)
  })

  it('round-trips a real card through the writer and back', async () => {
    const mod = (await import(CARDS_SOURCE)) as {
      CARDS: { title: string; plain: string; technical?: string }[]
      cardDetail: (card: { plain: string; technical?: string }) => string
    }
    const card = mod.CARDS.find((entry) => entry.technical)
    expect(card, 'no card in the source list has a technical half').toBeDefined()

    const split = splitCardDetail(mod.cardDetail(card!))
    expect(split.plain).toBe(card!.plain)
    expect(split.technical).toBe(card!.technical)
  })

  it('leaves no path, function name or line number in any card title', async () => {
    // The standing rule (doc 13 §8, sahoda-devops): titles are for a reader who
    // does not open the codebase. Asserted over every card, so a future card
    // written the old way fails here rather than on the founder's screen.
    const mod = (await import(CARDS_SOURCE)) as { CARDS: { title: string }[] }
    const technical = mod.CARDS.filter((card) =>
      /\.(ts|tsx|mjs|sql|json)\b|\(\)|\/[a-z]+\/|:\d+|_[a-z]+_/.test(card.title),
    ).map((card) => card.title)

    expect(technical, 'card titles that still read as engineering').toEqual([])
  })

  it('gives every card a plain half', async () => {
    const mod = (await import(CARDS_SOURCE)) as { CARDS: { title: string; plain: string }[] }
    const empty = mod.CARDS.filter((card) => card.plain.trim().length === 0).map((c) => c.title)
    expect(empty, 'cards with no stakeholder text').toEqual([])
  })
})

describe('splitCardDetail', () => {
  it('splits a card written with both halves', () => {
    const split = splitCardDetail(`Plain words.${TECHNICAL_MARKER}foo.ts:12 explodes.`)
    expect(split).toEqual({ plain: 'Plain words.', technical: 'foo.ts:12 explodes.' })
  })

  it('treats a card with no marker as all plain, never as all technical', () => {
    // The failure direction that matters: a legacy card must render its words,
    // not vanish into a collapsed section nobody opens.
    expect(splitCardDetail('Just some words.')).toEqual({
      plain: 'Just some words.',
      technical: null,
    })
  })

  it('returns an empty plain half for a card with no detail at all', () => {
    expect(splitCardDetail(null)).toEqual({ plain: '', technical: null })
  })

  it('drops a marker with nothing after it rather than rendering an empty section', () => {
    expect(splitCardDetail(`Plain words.${TECHNICAL_MARKER}   `)).toEqual({
      plain: 'Plain words.',
      technical: null,
    })
  })

  it('promotes the technical half when there is no plain half', () => {
    expect(splitCardDetail(`${TECHNICAL_MARKER.trimStart()}only this`.trim())).toEqual({
      plain: 'Technical detail — only this',
      technical: null,
    })
  })

  it('splits on the FIRST marker, so a marker inside the technical half is kept', () => {
    const split = splitCardDetail(`Plain.${TECHNICAL_MARKER}one${TECHNICAL_MARKER}two`)
    expect(split.plain).toBe('Plain.')
    expect(split.technical).toBe(`one${TECHNICAL_MARKER}two`.trim())
  })
})

describe('cardHeadline', () => {
  it('takes the first sentence of the plain half', () => {
    expect(cardHeadline('It does a thing. And another thing.', 'title')).toBe('It does a thing.')
  })

  it('never reaches into the technical half', () => {
    expect(cardHeadline(`Plain half${TECHNICAL_MARKER}foo.ts:1`, 'title')).toBe('Plain half')
  })

  it('falls back to the title when there is no detail', () => {
    expect(cardHeadline(null, 'The card title')).toBe('The card title')
  })

  it('does not cut mid-word when the first sentence is long', () => {
    const long = `${'word '.repeat(40)}end.`
    expect(cardHeadline(long, 'title')).toBe(long.trim())
  })
})
