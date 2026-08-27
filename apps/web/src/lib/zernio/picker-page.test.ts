import { describe, expect, it } from 'vitest'

import { escapeHtml, nothingToPickPage, pickerPage } from './picker-page'

/**
 * A FACEBOOK PAGE NAME IS TEXT SOMEBODY ELSE CHOSE.
 *
 * This page is hand-written HTML rather than React, for the reason its own header
 * gives: it renders inside the OAuth popup and loading the whole app into a 620px
 * window is the failure this flow was reported for four times. React escapes by
 * default and a template literal does not, so the escaping that framework normally
 * does for free is this file's own responsibility — on a page whose entire content
 * is names returned by a third-party API and chosen by whoever owns the Page.
 */

const copy = { channel: 'Facebook', noun: 'Page' }
const choice = (over: Partial<Parameters<typeof pickerPage>[1][number]> = {}) => ({
  id: '111',
  name: 'Chai & Chapters',
  detail: null,
  ownerId: null,
  ...over,
})

describe('third-party text cannot become markup', () => {
  it('escapes a script tag in a Page name', () => {
    const body = pickerPage(copy, [choice({ name: '<script>alert(1)</script>' })], {
      action: '/api/oauth/zernio/select',
      hasMore: false,
    })

    expect(body).not.toContain('<script>')
    expect(body).toContain('&lt;script&gt;')
  })

  it('escapes BOTH quote styles, because an id lands in an attribute', () => {
    // The closer page's escaper handles `"` only — it interpolates URLs it built
    // itself. This one interpolates ids and names from Zernio, so a single quote
    // is just as much an attribute break.
    const body = pickerPage(copy, [choice({ id: `1'2"3` })], {
      action: '/x',
      hasMore: false,
    })

    expect(body).toContain('value="1&#39;2&quot;3"')
  })

  it('escapes the detail line and the action too', () => {
    const body = pickerPage(copy, [choice({ detail: '<img onerror=x>' })], {
      action: '/x?a=1&b=2',
      hasMore: false,
    })

    expect(body).not.toContain('<img')
    expect(body).toContain('/x?a=1&amp;b=2')
  })

  it('escapes ampersands once, not twice', () => {
    // Double-escaping is the quiet failure: safe, and it shows the customer
    // `Chai &amp;amp; Chapters` on the screen where they have to recognise their
    // own Page. Not a security hole; still a defect.
    expect(escapeHtml('Chai & Chapters')).toBe('Chai &amp; Chapters')
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })
})

describe('what the page claims', () => {
  it('offers no free-text field — only ids Zernio returned', () => {
    const body = pickerPage(copy, [choice(), choice({ id: '222', name: 'Second' })], {
      action: '/api/oauth/zernio/select',
      hasMore: false,
    })

    expect(body).not.toContain('type="text"')
    expect((body.match(/type="radio"/g) ?? []).length).toBe(2)
    expect(body).toContain('method="post"')
  })

  it('runs no script at all', () => {
    // Nothing here needs one, and a page with no script has no place for a token
    // to be read from. It is also what keeps the step working with JS blocked.
    const body = pickerPage(copy, [choice()], { action: '/x', hasMore: false })
    expect(body).not.toContain('<script')
  })

  it('says nothing was connected when nothing came back, and does not say connected', () => {
    // Zernio creates no account until a pick is committed, so a customer here has
    // an approval at Facebook and an account nowhere. The empty state has to claim
    // exactly that, and offer a remedy that can work: reloading cannot create a
    // Facebook Page.
    const body = nothingToPickPage(copy, '/connections?zernio=nothing')

    expect(body).toContain('Nothing was connected and nothing was charged.')
    expect(body).not.toMatch(/\bConnected\b/)
    expect(body).not.toMatch(/reload|refresh|try again/i)
  })
})
