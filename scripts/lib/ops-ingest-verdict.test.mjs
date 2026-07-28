import { describe, expect, it } from 'vitest'

import { ingestVerdict, formatPermanent } from './ops-ingest-verdict.mjs'

describe('ingestVerdict', () => {
  it('calls a 404 permanent — retrying a wrong URL never becomes a right one', () => {
    // The real failure: the sync POSTed to :3000, a different worktree with no
    // ingest route, for hours. It warned once per sync in the same voice as a
    // restarting dev server, so it read as noise.
    const verdict = ingestVerdict({ status: 404, body: '', url: 'http://localhost:3000/x' })
    expect(verdict.permanent).toBe(true)
  })

  it('names the likely cause when the 404 body is an HTML page', () => {
    const verdict = ingestVerdict({
      status: 404,
      body: '<!DOCTYPE html><html lang="en"><head>…',
      url: 'http://localhost:3000/api/admin/devops/ingest',
    })

    expect(verdict.permanent).toBe(true)
    expect(verdict.lines.join(' ')).toContain('different worktree')
    expect(verdict.lines.join(' ')).toContain('OPS_INGEST_URL')
  })

  it.each([401, 403])('calls %i permanent — a wrong token stays wrong', (status) => {
    const verdict = ingestVerdict({ status, body: 'no', url: 'u' })
    expect(verdict.permanent).toBe(true)
    expect(verdict.lines.join(' ')).toContain('DEVOPS_INGEST_TOKEN')
  })

  it('calls a rejected payload permanent and quotes the reason', () => {
    const verdict = ingestVerdict({
      status: 422,
      body: '{"error":"tasks.0.board_column: invalid"}',
      url: 'u',
    })

    expect(verdict.permanent).toBe(true)
    expect(verdict.lines.join(' ')).toContain('board_column')
  })

  it.each([429, 500, 502, 503])('calls %i transient — the endpoint is real', (status) => {
    // These must NOT shout. If everything shouts, nothing does, and the block
    // reserved for a broken config stops meaning anything.
    const verdict = ingestVerdict({ status, body: 'upstream', url: 'u' })
    expect(verdict.permanent).toBe(false)
    expect(verdict.headline).toContain(String(status))
  })

  it('collapses a noisy body into one readable line', () => {
    const verdict = ingestVerdict({ status: 500, body: 'a\n\n   b\t\tc', url: 'u' })
    expect(verdict.headline).toContain('a b c')
  })
})

describe('formatPermanent', () => {
  it('is multi-line and self-explaining, not one more warn line', () => {
    const text = formatPermanent(ingestVerdict({ status: 404, body: '', url: 'http://x/y' }))

    expect(text.split('\n').length).toBeGreaterThan(6)
    expect(text).toContain('CONFIG ERROR')
    // The reassurance matters: the queues survive, so nobody panics and starts
    // hand-editing state files to "recover" data that was never lost.
    expect(text).toContain('Nothing was lost')
  })
})
