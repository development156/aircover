import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `readLeads` — what a card is HANDED, and what a failure is allowed to claim.
 *
 * Three claims, and the third is the one that had never been made:
 *
 *  1. Every sentence a card prints is built here, so the date, the age and the
 *     origin line are facts about the row rather than about the browser's clock.
 *  2. A conversation link is only offered when an account that could open it is
 *     still connected, and "no longer connected" is only said when the
 *     connections were actually read.
 *  3. A row the schema refuses is COUNTED. It used to be dropped in silence,
 *     which is a lead nobody rings back and a board that says so with a
 *     perfectly confident face.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const LEAD_A = '11111111-1111-4111-8111-111111111111'
const LEAD_B = '33333333-3333-4333-8333-333333333333'

type Result = { data: unknown; error: { message?: string } | null }

const state = vi.hoisted(() => ({
  workspace: 'ok' as 'ok' | 'none' | 'unreadable',
  timezone: null as string | null,
  results: {} as Record<string, Result>,
  tables: [] as string[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === 'ok'
        ? {
            status: 'ok',
            workspace: { id: WORKSPACE, name: 'W', slug: 'w', timezone: state.timezone },
          }
        : { status: state.workspace },
    ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      state.tables.push(table)
      const result = () => state.results[table] ?? { data: [], error: null }
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: () => builder,
        then: (resolve: (value: Result) => unknown) => resolve(result()),
      }
      return builder
    },
  }),
}))

const { readLeads } = await import('./read')

const NOW = new Date('2026-09-08T09:00:00.000Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_A,
    workspace_id: WORKSPACE,
    site_id: null,
    name: 'Priya',
    email: 'priya@example.com',
    phone: null,
    message: 'Do you do birthday cakes?',
    payload: null,
    source: null,
    status: 'new',
    read_at: null,
    created_at: '2026-09-06T09:42:00.000Z',
    updated_at: '2026-09-06T09:42:00.000Z',
    ...overrides,
  }
}

function connection(platform: string, id: string) {
  return { platform, external_account: { id }, created_at: '2026-08-01T00:00:00.000Z' }
}

async function ok() {
  const read = await readLeads(NOW)
  if (read.status !== 'ok') throw new Error(`expected ok, got ${read.status}`)
  return read
}

beforeEach(() => {
  state.workspace = 'ok'
  state.timezone = null
  state.results = {}
  state.tables = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('when it arrived', () => {
  test('carries the date in plain words and how long they have waited', async () => {
    state.results.leads = { data: [row()], error: null }

    const [lead] = (await ok()).leads
    expect(lead!.receivedWhen).toBe('Sun 6 Sept, 3:12 pm')
    expect(lead!.receivedAge).toBe('yesterday')
  })

  test('uses the workspace’s own zone when it has one', async () => {
    state.timezone = 'America/New_York'
    state.results.leads = { data: [row()], error: null }

    expect((await ok()).leads[0]!.receivedWhen).toBe('Sun 6 Sept, 5:42 am')
  })
})

describe('where it came from', () => {
  test('names an inbox platform properly, not by its API key', async () => {
    state.results.leads = {
      data: [row({ source: { kind: 'inbox', channel: 'instagram', conversation_ref: 'zc-9' } })],
      error: null,
    }

    expect((await ok()).leads[0]!.from).toBe('Your inbox · Instagram')
  })

  test('reports the page and the campaign a site form recorded', async () => {
    state.results.leads = {
      data: [
        row({
          source: {
            kind: 'site_form',
            site_slug: 'corner-bakery',
            url: 'https://corner.example/pricing?utm_source=spring-sale',
          },
        }),
      ],
      error: null,
    }

    // "Came from: Not recorded" was what this printed for a row holding all of
    // this, because the door and the details were read as one thing.
    expect((await ok()).leads[0]!.origin).toBe('Your site · /pricing · campaign spring-sale')
  })

  test('still refuses to name a door the row does not declare', async () => {
    state.results.leads = {
      data: [row({ source: { page: '/pricing', form: 'enquiry' } })],
      error: null,
    }

    const [lead] = (await ok()).leads
    expect(lead!.door).toBe('unrecorded')
    expect(lead!.origin).toBe('Not recorded · /pricing (enquiry)')
  })
})

describe('reopening the conversation', () => {
  const inbox = (channel: string) =>
    row({ source: { kind: 'inbox', channel, conversation_ref: 'zc-9' } })

  test('links to the thread when the account it arrived on is still connected', async () => {
    state.results.leads = { data: [inbox('instagram')], error: null }
    state.results.connections = { data: [connection('instagram', 'acc-1')], error: null }

    expect((await ok()).leads[0]!.conversation).toEqual({
      state: 'link',
      href: '/inbox/threads/acc-1/zc-9',
    })
  })

  test('translates the two platforms Zernio spells differently from us', async () => {
    // A lead's channel is `twitter`; `connections.platform` holds `x`. Unmapped,
    // this row would say "no longer connected" while the account is right there.
    state.results.leads = { data: [inbox('twitter')], error: null }
    state.results.connections = { data: [connection('x', 'acc-x')], error: null }

    expect((await ok()).leads[0]!.conversation).toEqual({
      state: 'link',
      href: '/inbox/threads/acc-x/zc-9',
    })
  })

  test('says the account is gone when the workspace holds none for that platform', async () => {
    state.results.leads = { data: [inbox('instagram')], error: null }
    state.results.connections = { data: [connection('facebook', 'acc-2')], error: null }

    expect((await ok()).leads[0]!.conversation).toEqual({ state: 'disconnected' })
  })

  test('claims NOTHING about the connections when that read failed', async () => {
    // "No longer connected" is a claim about the customer's accounts. A failed
    // query has not earned it.
    state.results.leads = { data: [inbox('instagram')], error: null }
    state.results.connections = { data: null, error: { message: 'boom' } }

    expect((await ok()).leads[0]!.conversation).toEqual({ state: 'none' })
  })

  test('does not go looking for accounts when no lead came from a conversation', async () => {
    state.results.leads = { data: [row({ source: { kind: 'site_form' } })], error: null }

    await ok()
    expect(state.tables).toEqual(['leads'])
  })
})

describe('a row the schema refuses', () => {
  test('is counted rather than dropped in silence', async () => {
    const noise = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.results.leads = {
      data: [row(), row({ id: LEAD_B, status: 'not-a-status' })],
      error: null,
    }

    const read = await ok()
    expect(read.leads).toHaveLength(1)
    expect(read.unreadable).toBe(1)
    expect(noise).toHaveBeenCalled()
  })

  test('never puts a refused row’s details in the log', async () => {
    const noise = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.results.leads = {
      data: [row({ status: 'not-a-status', email: 'priya@example.com' })],
      error: null,
    }

    await ok()
    const logged = noise.mock.calls.flat().join(' ')
    expect(logged).not.toContain('priya@example.com')
  })

  test('counts zero when every row parsed', async () => {
    state.results.leads = { data: [row()], error: null }
    expect((await ok()).unreadable).toBe(0)
  })
})

describe('what a failure may claim', () => {
  test('a failed read is never an empty board', async () => {
    state.results.leads = { data: null, error: { message: 'boom' } }
    expect((await readLeads(NOW)).status).toBe('unreadable')
  })

  test('no workspace is its own answer', async () => {
    state.workspace = 'none'
    expect((await readLeads(NOW)).status).toBe('no-workspace')
  })
})
