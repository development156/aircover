import { describe, expect, it } from 'vitest'

import { CONTROL_PATH, judgeControl, judgeCron, summariseCrons } from './cron-probe.mjs'

/**
 * The cron-reachability judgement, without a deployment.
 *
 * Every branch is driven, including the two that are easy to leave untested and
 * are the ones that matter: a 200 with no secret (a publicly triggerable job) and
 * a control that misbehaves (the run cannot measure anything).
 */

const REDIRECTING_CONTROL = { status: 307, location: 'https://x.clerk.accounts.dev/v1/…', body: '' }
const ABSENT_CONTROL = { status: 404, location: '', body: '' }

describe('the control decides whether anything can be measured', () => {
  it('is sound when a never-written path 307s — Clerk is answering, as expected', () => {
    expect(judgeControl(REDIRECTING_CONTROL).ok).toBe(true)
  })

  it('is sound when a never-written path 404s', () => {
    expect(judgeControl(ABSENT_CONTROL).ok).toBe(true)
  })

  it.each([401, 200])('REFUSES the run when a path that never existed answers %i', (status) => {
    // Something is matching everything under /api/cron. Every verdict in the run
    // would be about that matcher rather than about the route.
    const judged = judgeControl({ status, location: '', body: '' })
    expect(judged.ok).toBe(false)
    expect(judged.reason).toMatch(/never existed/)
  })

  it('refuses when the control request itself failed, rather than assuming', () => {
    expect(judgeControl({ status: 0, error: 'fetch failed' }).ok).toBe(false)
  })

  it('names a control path that is obviously not a real job', () => {
    expect(CONTROL_PATH).toMatch(/^\/api\/cron\//)
    expect(CONTROL_PATH).toMatch(/never_exists/)
  })
})

describe('judging one cron', () => {
  const at = (result, control = REDIRECTING_CONTROL) => judgeCron('/api/cron/x', result, control)

  it('PASSES on 401 — the route was reached and its own guard answered', () => {
    const v = at({ status: 401, location: '', body: 'Unauthorized' })
    expect(v.ok).toBe(true)
    expect(v.state).toBe('reachable')
  })

  it('FAILS LOUDEST on 200 with no secret — that is a public job trigger', () => {
    const v = at({ status: 200, location: '', body: '{"ok":true}' })
    expect(v.ok).toBe(false)
    expect(v.state).toBe('unauthenticated')
    expect(v.reason).toMatch(/anyone on the internet/)
  })

  it('calls a redirect SHADOWED when the control also redirects', () => {
    // The honest verdict: unexempt and never-deployed are indistinguishable here,
    // and saying "not exempt" would send someone to edit the wrong file.
    const v = at({ status: 307, location: 'https://x.clerk.accounts.dev/v1/…', body: '' })
    expect(v.state).toBe('shadowed')
    expect(v.reason).toMatch(/cannot be distinguished/)
  })

  it('calls a redirect NOT-EXEMPT when the control does NOT redirect', () => {
    // Here a redirect really does single this route out.
    const v = at({ status: 307, location: '/sign-in', body: '' }, ABSENT_CONTROL)
    expect(v.state).toBe('not-exempt')
    expect(v.reason).toMatch(/does not follow redirects/)
  })

  it('calls a 404 NOT-DEPLOYED — exempt, scheduled, and no handler', () => {
    expect(at({ status: 404, location: '', body: '' }).state).toBe('not-deployed')
  })

  it('calls a 405 WRONG-METHOD and says which method cron uses', () => {
    const v = at({ status: 405, location: '', body: '' })
    expect(v.state).toBe('wrong-method')
    expect(v.reason).toMatch(/GET/)
  })

  it('never passes a status it does not understand', () => {
    const v = at({ status: 418, location: '', body: '' })
    expect(v.ok).toBe(false)
    expect(v.state).toBe('unexpected')
  })

  it('reports a failed request as UNMEASURED, not as a failing route', () => {
    const v = at({ status: 0, error: 'ETIMEDOUT' })
    expect(v.state).toBe('unmeasured')
    expect(v.reason).toMatch(/probe itself/)
  })
})

describe('summarising', () => {
  it('is not ok when any cron failed, and counts the rest', () => {
    const s = summariseCrons([{ ok: true }, { ok: false, path: '/a' }, { ok: true }])
    expect(s).toMatchObject({ ok: false, passed: 2, total: 3 })
    expect(s.failed).toHaveLength(1)
  })

  it('is ok on an empty list, because nothing was claimed', () => {
    expect(summariseCrons([]).ok).toBe(true)
  })
})
