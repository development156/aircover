import { describe, expect, it } from 'vitest'

import { MIN_SENTENCE_CHARS, normaliseUrl, pickDoor, precedenceNote } from './door'

describe('normaliseUrl', () => {
  it('adds a scheme to a bare domain', () => {
    expect(normaliseUrl('acme.com')).toBe('https://acme.com/')
  })

  it('keeps an explicit https url', () => {
    expect(normaliseUrl('https://acme.com/about')).toBe('https://acme.com/about')
  })

  it('accepts http', () => {
    expect(normaliseUrl('http://acme.com')).toBe('http://acme.com/')
  })

  it.each(['javascript:alert(1)', 'data:text/html,<b>x', 'file:///etc/passwd'])(
    'rejects the non-web scheme %s',
    (input) => {
      expect(normaliseUrl(input)).toBeNull()
    },
  )

  it('rejects a bare word with no dot', () => {
    // Left in, this would send the fetcher at an intranet hostname.
    expect(normaliseUrl('bakery')).toBeNull()
    expect(normaliseUrl('localhost')).toBeNull()
  })

  it('rejects a sentence pasted into the url box', () => {
    expect(normaliseUrl('we are a bakery in Pune')).toBeNull()
  })

  it('is null on blank', () => {
    expect(normaliseUrl('')).toBeNull()
    expect(normaliseUrl(null)).toBeNull()
    expect(normaliseUrl(undefined)).toBeNull()
  })
})

describe('pickDoor', () => {
  it('is none when nothing is filled', () => {
    expect(pickDoor({}).kind).toBe('none')
  })

  it('takes the PDF over everything else', () => {
    const choice = pickDoor({
      pdfName: 'deck.pdf',
      url: 'acme.com',
      sentence: 'we bake sourdough daily',
    })

    expect(choice.kind).toBe('pdf')
    expect(choice.ignored).toEqual(['url', 'sentence'])
  })

  it('takes the PDF over the URL — the rule the spec names', () => {
    const choice = pickDoor({ pdfName: 'menu.pdf', url: 'https://acme.com' })

    expect(choice.kind).toBe('pdf')
    expect(choice.ignored).toEqual(['url'])
  })

  it('takes the URL over a sentence', () => {
    const choice = pickDoor({ url: 'acme.com', sentence: 'we bake sourdough daily' })

    expect(choice).toMatchObject({ kind: 'url', label: 'acme.com', ignored: ['sentence'] })
  })

  it('falls to the sentence when it is the only thing given', () => {
    const choice = pickDoor({ sentence: 'we bake sourdough daily' })

    expect(choice).toMatchObject({ kind: 'sentence', ignored: [] })
  })

  it('ignores a sentence too short to be a description', () => {
    expect(pickDoor({ sentence: 'x'.repeat(MIN_SENTENCE_CHARS - 1) }).kind).toBe('none')
    expect(pickDoor({ sentence: 'x'.repeat(MIN_SENTENCE_CHARS) }).kind).toBe('sentence')
  })

  it('does not treat an unusable URL as a filled input', () => {
    // The URL box has something in it, but it is not a URL — so the sentence
    // must win rather than the flow stalling on an input that cannot be read.
    const choice = pickDoor({ url: 'not a url', sentence: 'we bake sourdough daily' })

    expect(choice.kind).toBe('sentence')
    expect(choice.ignored).toEqual([])
  })
})

describe('precedenceNote', () => {
  it('is silent when only one input was given', () => {
    expect(precedenceNote(pickDoor({ url: 'acme.com' }))).toBeNull()
    expect(precedenceNote(pickDoor({}))).toBeNull()
  })

  it('names what was dropped and why', () => {
    const note = precedenceNote(pickDoor({ pdfName: 'deck.pdf', url: 'acme.com' }))

    expect(note).toContain('your PDF')
    expect(note).toContain('your website')
  })

  it('does not claim the user wrote the site when the site beat their sentence', () => {
    // The single-reason version of this string read "…it is the one you wrote
    // every word of", which is plainly false of the sentence they just typed.
    const note = precedenceNote(pickDoor({ url: 'acme.com', sentence: 'we bake sourdough daily' }))

    expect(note).toContain('your site says more about you')
  })
})
