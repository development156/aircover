import { describe, expect, it } from 'vitest'

import { DOCUMENT_HEADERS, EXPECTED_ROUTES, judge, summarise } from './probe-routes.mjs'

const HOST = 'https://sahodalabs.vercel.app'
const html = '<!doctype html><html><head><title>Sign in · Sahoda</title></head><body>x</body></html>'

const ok = (over = {}) => ({
  status: 200,
  contentType: 'text/html; charset=utf-8',
  body: html,
  finalUrl: `${HOST}/sign-in`,
  ...over,
})

const signInFor = (path) =>
  `${HOST}/sign-in?redirect_url=${encodeURIComponent(`${HOST}${path}`)}`

describe('the probe measures like a browser, not like curl', () => {
  it('sends navigation headers', () => {
    // The whole reason this file exists. `Accept: */*` made Clerk answer 404 on
    // a working site, and production was declared down twice on that reading.
    expect(DOCUMENT_HEADERS.Accept).toMatch(/text\/html/)
    expect(DOCUMENT_HEADERS['Sec-Fetch-Dest']).toBe('document')
    expect(DOCUMENT_HEADERS['Sec-Fetch-Mode']).toBe('navigate')
  })

  it('covers the six routes doc 16 §3 names', () => {
    expect(EXPECTED_ROUTES.map((r) => r.path)).toEqual([
      '/',
      '/sign-in',
      '/home',
      '/wallet',
      '/posts',
      '/admin',
    ])
  })
})

describe('a protected route', () => {
  const route = { path: '/home', kind: 'protected' }

  it('passes when it lands on sign-in with the destination kept', () => {
    expect(judge(route, ok({ finalUrl: signInFor('/home') }))).toMatchObject({ ok: true })
  })

  it('FAILS on the 404 that shipped', () => {
    // The regression this probe exists to catch, asserted directly.
    const result = judge(route, {
      status: 404,
      contentType: 'text/html; charset=utf-8',
      body: '<html><title>404: This page could not be found.</title></html>',
      finalUrl: `${HOST}/home`,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/404/)
  })

  it('fails when it renders the app without asking anyone to sign in', () => {
    // Landing on /home signed out would mean the guard evaporated.
    expect(judge(route, ok({ finalUrl: `${HOST}/home` }))).toMatchObject({ ok: false })
  })

  it('fails when sign-in loses the destination', () => {
    // A signed-in user would be dropped somewhere they did not ask for.
    const r = judge(route, ok({ finalUrl: `${HOST}/sign-in` }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/destination/)
  })

  it('fails on a Vercel error page even though it is technically HTML', () => {
    expect(
      judge(route, ok({ finalUrl: signInFor('/home'), body: 'DEPLOYMENT_NOT_FOUND' })),
    ).toMatchObject({ ok: false })
  })

  it('fails on text/plain, which is what a dead deployment answers', () => {
    expect(
      judge(route, ok({ finalUrl: signInFor('/home'), contentType: 'text/plain' })),
    ).toMatchObject({ ok: false })
  })

  it('accepts `/` without a destination check, since it has none to keep', () => {
    expect(
      judge({ path: '/', kind: 'protected' }, ok({ finalUrl: `${HOST}/sign-in` })),
    ).toMatchObject({ ok: true })
  })
})

describe('the gated route', () => {
  const route = { path: '/admin', kind: 'gated' }

  it('passes on an empty 404', () => {
    expect(
      judge(route, { status: 404, contentType: '', body: '', finalUrl: `${HOST}/admin` }),
    ).toMatchObject({ ok: true })
  })

  it('FAILS if /admin ever redirects to sign-in', () => {
    // doc 13 §2: a redirect tells an anonymous scanner that /admin exists.
    const r = judge(route, ok({ finalUrl: signInFor('/admin') }))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/upsell/)
  })

  it('fails if it starts rendering a body', () => {
    expect(
      judge(route, { status: 404, contentType: 'text/html', body: html, finalUrl: `${HOST}/admin` }),
    ).toMatchObject({ ok: false })
  })

  it('fails if it starts answering 200', () => {
    expect(judge(route, ok({ finalUrl: `${HOST}/admin` }))).toMatchObject({ ok: false })
  })
})

describe('the public route', () => {
  it('passes when it renders itself', () => {
    expect(judge({ path: '/sign-in', kind: 'public' }, ok())).toMatchObject({ ok: true })
  })

  it('fails if it bounces somewhere else', () => {
    expect(
      judge({ path: '/sign-in', kind: 'public' }, ok({ finalUrl: `${HOST}/home` })),
    ).toMatchObject({ ok: false })
  })
})

describe('summarise', () => {
  it('is green only when every route is', () => {
    expect(summarise([{ ok: true }, { ok: true }])).toMatchObject({ ok: true, passed: 2, total: 2 })
    const bad = summarise([{ ok: true }, { ok: false, path: '/home' }])
    expect(bad.ok).toBe(false)
    expect(bad.failed).toHaveLength(1)
  })
})
