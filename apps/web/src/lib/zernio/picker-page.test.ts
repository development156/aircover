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

const copy = {
  channel: 'Facebook',
  noun: 'Page',
  extra: 'Facebook only lets apps post to a Page, never to a personal profile.',
}
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

    expect(body).toContain('Nothing was connected and nothing ')
    expect(body).not.toMatch(/\bConnected\b/)
    expect(body).not.toMatch(/reload|refresh|try again/i)
  })

  it('names the reason that is actually the common one, not just "create a Page"', () => {
    // MEASURED from the founder's attempt: Facebook showed "You've previously
    // linked Social Media Connector to Facebook. Would you like to continue with
    // your previous settings?" — pressing Continue reuses a grant that included no
    // Page, and no Page comes back. Telling them only to create a Page sends
    // somebody who HAS one off to make a second one.
    const body = nothingToPickPage(copy, '/c')

    expect(body).toContain('Edit settings')
    expect(body).toContain('not included in what you approved')
  })

  it('tells the opener the wait is over', () => {
    // "after connect it didnt show up connect on website" — the card sat on
    // "Opening Facebook…" because this page emitted none of the four signals
    // `useConnectFlow` waits for. Every one of them came from `popupCloser`, the
    // page a FINISHED connect ends on; this is the other way one can end.
    const body = nothingToPickPage(copy, '/c')

    expect(body).toContain('sahoda-connect')
    expect(body).toContain('sahoda:connect-outcome')
  })

  it('does NOT close the window out from under the sentence', () => {
    // The closer shuts itself because it has nothing to say. This page has the
    // remedy on it, and closing it is how the remedy goes unread.
    expect(nothingToPickPage(copy, '/c')).not.toContain('window.close')
  })

  it('the PICKER stays silent, because that flow is not over', () => {
    // Signalling mid-flow would refresh the opener, stop it waiting, and leave it
    // showing "Not connected" behind a window still asking which Page.
    const body = pickerPage(copy, [choice()], { action: '/x', hasMore: false })

    expect(body).not.toContain('sahoda-connect')
    expect(body).not.toContain('<script')
  })
})
