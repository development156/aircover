import { describe, expect, test } from 'vitest'

import { connectionPlatformFor, leadOrigin, originWords } from './origin'

/**
 * WHAT `leads.source` IS ALLOWED TO PRODUCE.
 *
 * The claim under test is a pair, and both halves matter:
 *
 *   1. The DOOR is named only from `kind`. A row that does not declare one is
 *      never called "Your site", however site-shaped the rest of it looks.
 *   2. The DETAILS are printed whether or not the door is named. Dropping a
 *      recorded page and campaign on the floor because `kind` was missing is how
 *      a row full of provenance rendered as "Came from: Not recorded".
 */

describe('the door', () => {
  test('a site form says so, in the reader’s words', () => {
    expect(leadOrigin({ kind: 'site_form', site_slug: 'corner-bakery' }).from).toBe('Your site')
  })

  test('an inbox lead names the platform, not the raw key', () => {
    // "Your inbox · instagram" is what this printed for a year. A lowercase API
    // key on a customer's screen is our vocabulary leaking into theirs.
    expect(leadOrigin({ kind: 'inbox', channel: 'instagram' }).from).toBe('Your inbox · Instagram')
    expect(leadOrigin({ kind: 'inbox', channel: 'googlebusiness' }).from).toBe(
      'Your inbox · Google Business Profile',
    )
  })

  test('a platform this product has not modelled is printed verbatim', () => {
    // The real string is more use to somebody reporting a problem than our
    // failure to recognise it.
    expect(leadOrigin({ kind: 'inbox', channel: 'mastodon' }).from).toBe('Your inbox · mastodon')
  })

  test('an inbox lead with no channel says the door and stops there', () => {
    expect(leadOrigin({ kind: 'inbox' }).from).toBe('Your inbox')
  })

  test('a row with no kind is NEVER called Your site, however site-shaped it looks', () => {
    const origin = leadOrigin({ page: '/pricing', form: 'enquiry', utm_source: 'spring-sale' })
    expect(origin.door).toBe('unrecorded')
    expect(origin.from).toBe('Not recorded')
  })

  test('a source that is not an object at all is not recorded', () => {
    expect(leadOrigin(null).from).toBe('Not recorded')
    expect(leadOrigin('site').from).toBe('Not recorded')
  })
})

describe('the details, which are facts and not conclusions', () => {
  test('reads the page, the form and the campaign a seeded row wrote down', () => {
    const origin = leadOrigin({ page: '/pricing', form: 'enquiry', utm_source: 'spring-sale' })
    expect(origin).toMatchObject({ page: '/pricing', form: 'enquiry', campaign: 'spring-sale' })
  })

  test('derives the page and the campaign from the URL `lead_submit` really stores', () => {
    // MEASURED against 20260821000100_lead_doors.sql: the function writes `url`,
    // and nothing splits it up. A page read only from `source.page` would be
    // null for every lead this product has ever taken.
    const origin = leadOrigin({
      kind: 'site_form',
      url: 'https://cornerbakery.example/pricing?utm_source=spring-sale&ref=x',
    })
    expect(origin.page).toBe('/pricing')
    expect(origin.campaign).toBe('spring-sale')
  })

  test('survives a stored URL that is not a URL', () => {
    expect(leadOrigin({ kind: 'site_form', url: '/contact?utm_source=flyer' }).page).toBe(
      '/contact',
    )
    expect(leadOrigin({ kind: 'site_form', url: 'cornerbakery' }).page).toBeNull()
  })

  test('an inbox lead carries its conversation and no page', () => {
    const origin = leadOrigin({ kind: 'inbox', channel: 'instagram', conversation_ref: 'zc-9' })
    expect(origin.conversationRef).toBe('zc-9')
    expect(origin.page).toBeNull()
  })
})

describe('the sentence', () => {
  test('drops what is absent rather than dashing it', () => {
    // A form name that was never recorded is not a measurement that came back
    // empty, and "(  )" is worse than saying nothing.
    expect(originWords(leadOrigin({ kind: 'site_form', url: 'https://x.example/pricing' }))).toBe(
      'Your site · /pricing',
    )
    expect(originWords(leadOrigin({ kind: 'site_form' }))).toBe('Your site')
  })

  test('joins the page, the form and the campaign when all three are recorded', () => {
    expect(
      originWords(
        leadOrigin({ kind: 'site_form', page: '/pricing', form: 'enquiry', utm: 'flyer' }),
      ),
    ).toBe('Your site · /pricing (enquiry) · campaign flyer')
  })

  test('a kind-less row still shows what it recorded', () => {
    expect(originWords(leadOrigin({ page: '/pricing', form: 'enquiry' }))).toBe(
      'Not recorded · /pricing (enquiry)',
    )
  })
})

describe('the spelling that decides whether a conversation can be reopened', () => {
  test('translates the two platform names Zernio spells differently from us', () => {
    // `connections.platform` holds `x` and `gbp`; an inbox lead's channel holds
    // `twitter` and `googlebusiness`. Looking the account up unmapped finds
    // nothing forever, and the screen would say "no longer connected".
    expect(connectionPlatformFor('twitter')).toBe('x')
    expect(connectionPlatformFor('googlebusiness')).toBe('gbp')
  })

  test('leaves every other platform alone', () => {
    expect(connectionPlatformFor('instagram')).toBe('instagram')
    expect(connectionPlatformFor('whatsapp')).toBe('whatsapp')
  })
})
