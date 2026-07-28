import { afterEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` factories are hoisted above the imports, so the state they close
// over has to be created inside `vi.hoisted`.
const state = vi.hoisted(() => ({
  env: {
    DEVOPS_INGEST_TOKEN: 'a'.repeat(48) as string | undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  },
  ingestCalls: [] as unknown[],
  ingestResult: { ok: true, ack: { ok: true, tasks: 2, qa: 1 } } as
    { ok: true; ack: Record<string, unknown> } | { ok: false; reason: 'unavailable' },
  rateVerdict: { allowed: true, count: 1, unmeasured: false },
}))

vi.mock('@/lib/env', () => ({ env: state.env }))
vi.mock('@/lib/ops/service-rpc', () => ({
  ingestOps: (payload: unknown) => {
    state.ingestCalls.push(payload)
    return Promise.resolve(state.ingestResult)
  },
}))
vi.mock('@/lib/ops/rate-limit', () => ({
  fixedWindowAllow: () => Promise.resolve(state.rateVerdict),
}))

const { POST } = await import('./route')

const GOOD_TOKEN = 'a'.repeat(48)
const ENDPOINT = 'http://localhost:3000/api/admin/devops/ingest'

function post(body: unknown, token: string | null = GOOD_TOKEN, rawBody?: string): Request {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { 'x-ops-token': token }),
    },
    body: rawBody ?? JSON.stringify(body),
  })
}

afterEach(() => {
  state.env.DEVOPS_INGEST_TOKEN = GOOD_TOKEN
  state.ingestCalls.length = 0
  state.ingestResult = { ok: true, ack: { ok: true, tasks: 2, qa: 1 } }
  state.rateVerdict = { allowed: true, count: 1, unmeasured: false }
})

describe('POST /api/admin/devops/ingest — the token gate', () => {
  it('answers 503 when no token is configured, and writes nothing', async () => {
    state.env.DEVOPS_INGEST_TOKEN = undefined

    const response = await POST(post({ source: 'test' }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'ingest_not_configured' })
    expect(state.ingestCalls).toHaveLength(0)
  })

  it('treats a short token as unconfigured rather than as a weak secret', async () => {
    // Doc 13 §16 asks for >=32 bytes. Accepting a guessable one silently is the
    // failure this rejects.
    state.env.DEVOPS_INGEST_TOKEN = 'short'

    const response = await POST(post({ source: 'test' }, 'short'))

    expect(response.status).toBe(503)
    expect(state.ingestCalls).toHaveLength(0)
  })

  it.each([
    ['a wrong token', 'b'.repeat(48)],
    ['a prefix of the real token', 'a'.repeat(47)],
    ['an empty token', ''],
  ])('answers 401 for %s', async (_label, token) => {
    const response = await POST(post({ source: 'test' }, token))

    expect(response.status).toBe(401)
    expect(state.ingestCalls).toHaveLength(0)
  })

  it('answers 401 when the header is absent entirely', async () => {
    const response = await POST(post({ source: 'test' }, null))

    expect(response.status).toBe(401)
    expect(state.ingestCalls).toHaveLength(0)
  })

  it('never echoes the configured token into any response body', async () => {
    for (const token of [null, 'b'.repeat(48), GOOD_TOKEN]) {
      const body = await (await POST(post({ source: 'test' }, token))).text()
      expect(body).not.toContain(GOOD_TOKEN)
    }
  })
})

describe('POST /api/admin/devops/ingest — payload validation', () => {
  it('rejects a payload carrying a credits section, and writes nothing', async () => {
    // THE security assertion of this route. Doc 13 §16 requires that the ingest
    // token be unable to reach credits. The payload schema is `.strict()`, so an
    // unknown section fails the whole request rather than being stripped and the
    // rest applied — which would have looked like a success.
    const response = await POST(
      post({
        source: 'forged',
        tasks: [],
        credits: [{ workspace_id: 'w', amount: 10_000 }],
      }),
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; paths: string[] }
    expect(body.error).toBe('invalid_payload')
    expect(body.paths).toContain('credits')
    expect(state.ingestCalls).toHaveLength(0)
  })

  it.each(['admins', 'ops_admins', 'ledger', 'applications'])(
    'rejects an unknown "%s" section too — the allowlist is the schema, not a denylist',
    async (section) => {
      const response = await POST(post({ source: 'forged', [section]: [{}] }))

      expect(response.status).toBe(400)
      expect(state.ingestCalls).toHaveLength(0)
    },
  )

  it('rejects a body that is not JSON', async () => {
    const response = await POST(post(null, GOOD_TOKEN, 'not json at all'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_json' })
    expect(state.ingestCalls).toHaveLength(0)
  })

  it('names the failing paths but never the values', async () => {
    const response = await POST(
      post({ source: 'test', tasks: [{ code: 'NOT-A-CODE', title: 'x', board_column: 'todo' }] }),
    )

    expect(response.status).toBe(400)
    const body = await response.text()
    expect(body).toContain('tasks')
    expect(body).not.toContain('NOT-A-CODE')
  })

  it('rejects a task whose column is not one of the four', async () => {
    const response = await POST(
      post({ source: 'test', tasks: [{ code: 'SL-1', title: 'x', board_column: 'archived' }] }),
    )

    expect(response.status).toBe(400)
    expect(state.ingestCalls).toHaveLength(0)
  })

  it('will not let a client set moved_by — an agent cannot forge a human drag', async () => {
    const response = await POST(
      post({
        source: 'test',
        tasks: [{ code: 'SL-1', title: 'x', board_column: 'done', moved_by: 'human' }],
      }),
    )

    expect(response.status).toBe(400)
    expect(state.ingestCalls).toHaveLength(0)
  })

  it('will not let a client set a changelog author — the server assigns it', async () => {
    const response = await POST(
      post({
        source: 'test',
        changelog: [
          {
            client_id: 'c'.repeat(12),
            title: 'x',
            summary_plain: 'A plain summary long enough to pass.',
            author: 'DIVAS',
          },
        ],
      }),
    )

    expect(response.status).toBe(400)
    expect(state.ingestCalls).toHaveLength(0)
  })
})

describe('POST /api/admin/devops/ingest — applying', () => {
  it('applies a valid payload once and returns the ack', async () => {
    const response = await POST(
      post({
        source: 'ops-sync',
        tasks: [{ code: 'SL-007', title: 'Ingest RPC', board_column: 'in_progress' }],
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, tasks: 2, qa: 1 })
    expect(state.ingestCalls).toHaveLength(1)
  })

  it('reports 502 without inventing an ack when the RPC is unavailable', async () => {
    state.ingestResult = { ok: false, reason: 'unavailable' }

    const response = await POST(post({ source: 'ops-sync' }))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, error: 'ingest_unavailable' })
  })

  it('answers 429 over the limit and does not apply the payload', async () => {
    state.rateVerdict = { allowed: false, count: 61, unmeasured: false }

    const response = await POST(post({ source: 'ops-sync', tasks: [] }))

    expect(response.status).toBe(429)
    expect(state.ingestCalls).toHaveLength(0)
  })

  it('says so when the rate limit was never measured', async () => {
    // Upstash absent means `allowed: true` is a default, not a measurement. The
    // response says which it was rather than implying a limit was enforced.
    state.rateVerdict = { allowed: true, count: 0, unmeasured: true }

    const response = await POST(post({ source: 'ops-sync' }))

    expect(await response.json()).toMatchObject({ rate_limit_measured: false })
  })
})
