import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_DOOR_BODY_BYTES } from '@/lib/onboarding/door-request'

/**
 * The door route's refusals, executed. Each one used to be missing or to run
 * after the cost it was meant to prevent:
 *
 *  · no limiter, though `door-transport-failure.ts` carried a 429 sentence;
 *  · the whole upload buffered and copied before any size check;
 *  · `String(form.get('url'))` with no schema.
 *
 * `readDoorStreaming` is the paid work and is mocked; every test here asserts
 * whether it was reached, which is the only thing a refusal is for.
 */

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  workspace: { status: 'ok', workspace: { id: 'ws_1', name: 'Acme' } } as
    | { status: 'ok'; workspace: { id: string; name: string } }
    | { status: 'none' }
    | { status: 'unreadable' },
  refuse: ((_key: string) => false) as (key: string) => boolean,
}))

const readDoorStreaming = vi.fn()
const seedLibraryFromSite = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: state.userId }) }))
vi.mock('@/lib/workspaces', () => ({ readActiveWorkspace: async () => state.workspace }))
vi.mock('@/lib/ops/rate-limit', () => ({
  fixedWindowAllow: async (key: string) => ({
    allowed: !state.refuse(key),
    count: 1,
    unmeasured: false,
  }),
}))
vi.mock('@/lib/onboarding/read-door', () => ({
  readDoorStreaming: (...args: unknown[]) => readDoorStreaming(...args),
}))
vi.mock('@/lib/onboarding/seed-library', () => ({
  seedLibraryFromSite: (...args: unknown[]) => seedLibraryFromSite(...args),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const { POST } = await import('./route')

const URL_RESULT = {
  ok: true,
  kind: 'url',
  text: 'We bake bread.',
  label: 'acme.com',
  foundName: 'Acme',
  colors: [],
  note: null,
  fellBack: false,
  stages: [],
  costUsd: 0,
  creditsCharged: 0,
}

function post(form: FormData, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/onboarding/door', {
    method: 'POST',
    body: form,
    headers,
  })
}

function siteForm(url = 'acme.com'): FormData {
  const form = new FormData()
  form.set('url', url)
  form.set('sentence', '')
  return form
}

async function body(response: Response): Promise<{ error?: string }> {
  return (await response.json()) as { error?: string }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.userId = 'user_1'
  state.workspace = { status: 'ok', workspace: { id: 'ws_1', name: 'Acme' } }
  state.refuse = () => false
  readDoorStreaming.mockResolvedValue(URL_RESULT)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the read that is allowed', () => {
  it('streams a done line and seeds the library from the site', async () => {
    const response = await POST(post(siteForm()))

    expect(response.status).toBe(200)
    const text = await response.text()
    const last = JSON.parse(text.trim().split('\n').pop()!) as {
      type: string
      result: { ok: boolean }
    }
    expect(last).toMatchObject({ type: 'done', result: { ok: true } })
    expect(readDoorStreaming).toHaveBeenCalledTimes(1)
    expect(readDoorStreaming.mock.calls[0]![0]).toMatchObject({
      url: 'acme.com',
      sentence: '',
      pdf: null,
      workspaceId: 'ws_1',
      userId: 'user_1',
    })
    expect(seedLibraryFromSite).toHaveBeenCalledTimes(1)
  })
})

describe('the limiter', () => {
  it('turns the read away with a named cause before the document is opened', async () => {
    state.refuse = (key) => key === 'door:w:ws_1'

    const response = await POST(post(siteForm()))

    expect(response.status).toBe(429)
    expect(await body(response)).toEqual({ error: 'rate_limited' })
    expect(readDoorStreaming).not.toHaveBeenCalled()
  })

  /**
   * THE WORKSPACE HOP. Erase, create, and a limit keyed on the workspace
   * starts from zero. The person is the same person.
   */
  it('a refusal on the user key holds across a second workspace', async () => {
    state.refuse = (key) => key.startsWith('door:u:')

    state.workspace = { status: 'ok', workspace: { id: 'ws_1', name: 'Acme' } }
    expect((await POST(post(siteForm()))).status).toBe(429)
    state.workspace = { status: 'ok', workspace: { id: 'ws_2', name: 'Acme again' } }
    expect((await POST(post(siteForm()))).status).toBe(429)
    expect(readDoorStreaming).not.toHaveBeenCalled()
  })
})

describe('the body cap', () => {
  it('refuses off the content-length header without parsing the body', async () => {
    const formData = vi.spyOn(Request.prototype, 'formData')

    const response = await POST(
      post(siteForm(), { 'content-length': String(MAX_DOOR_BODY_BYTES + 1) }),
    )

    expect(response.status).toBe(413)
    expect(await body(response)).toEqual({ error: 'too_large' })
    expect(formData).not.toHaveBeenCalled()
    expect(readDoorStreaming).not.toHaveBeenCalled()
  })

  it('describes a PDF to the reader without copying its bytes in the route', async () => {
    const arrayBuffer = vi.spyOn(File.prototype, 'arrayBuffer')
    const form = siteForm('')
    form.set('pdf', new File([new Uint8Array(64)], 'deck.pdf', { type: 'application/pdf' }))

    await POST(post(form))

    expect(readDoorStreaming).toHaveBeenCalledTimes(1)
    const input = readDoorStreaming.mock.calls[0]![0] as {
      pdf: { name: string; size: number; read: unknown }
    }
    expect(input.pdf).toMatchObject({ name: 'deck.pdf', size: 64 })
    expect(typeof input.pdf.read).toBe('function')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })
})

describe('the schema', () => {
  it('refuses a link longer than the cap as input, not as a verdict on the site', async () => {
    const response = await POST(post(siteForm(`https://acme.com/${'a'.repeat(3000)}`)))

    expect(response.status).toBe(400)
    expect(await body(response)).toEqual({ error: 'invalid_input' })
    expect(readDoorStreaming).not.toHaveBeenCalled()
  })
})

describe('the two workspace arms stay apart', () => {
  it('a failed workspace read is 503 workspace_unreadable, never no_workspace', async () => {
    state.workspace = { status: 'unreadable' }
    const response = await POST(post(siteForm()))
    expect(response.status).toBe(503)
    expect(await body(response)).toEqual({ error: 'workspace_unreadable' })
  })

  it('no workspace is 400 no_workspace', async () => {
    state.workspace = { status: 'none' }
    const response = await POST(post(siteForm()))
    expect(response.status).toBe(400)
    expect(await body(response)).toEqual({ error: 'no_workspace' })
  })
})
