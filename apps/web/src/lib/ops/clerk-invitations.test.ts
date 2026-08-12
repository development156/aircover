import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The invitation must land on a page that can REDEEM it.
 *
 * Observed live 2026-08-12: with no `redirect_url`, Clerk redeems the ticket and
 * redirects to the instance default `/`. `/` is not public, so `middleware.ts`
 * bounces to `/sign-in`, and a sign-in page cannot consume a sign-up ticket. The
 * invited person sees "New sign-ups are currently restricted" — true, and
 * completely misleading, since their invitation is sitting there pending. Every
 * invitation the console had ever sent was unusable this way.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('@/lib/env', () => ({
  env: {
    CLERK_SECRET_KEY: 'sk_test_fake',
    NEXT_PUBLIC_APP_URL: 'https://sahodalabs.vercel.app',
  },
}))

const { createInvitation } = await import('./clerk-invitations')

function ok(body: unknown = { id: 'inv_1' }) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as { body: string }).body)
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(ok())
})

describe('createInvitation', () => {
  test('sends the invitee to /sign-up, not to the instance default', async () => {
    await createInvitation('someone@example.com')

    const sent = bodyOf(fetchMock.mock.calls[0]!)
    expect(sent.redirect_url).toBe('https://sahodalabs.vercel.app/sign-up')
  })

  test('the redirect target is a PUBLIC route — /sign-in would drop the ticket', async () => {
    // The failure mode is not "wrong page", it is "ticket silently discarded".
    // Pinning the exact path is the point; /, /home and /sign-in all break it.
    await createInvitation('someone@example.com')

    const sent = bodyOf(fetchMock.mock.calls[0]!)
    expect(String(sent.redirect_url)).toMatch(/\/sign-up$/)
    expect(String(sent.redirect_url)).not.toMatch(/\/sign-in/)
  })

  test('still notifies and tolerates a repeat press', async () => {
    await createInvitation('someone@example.com')

    const sent = bodyOf(fetchMock.mock.calls[0]!)
    expect(sent.notify).toBe(true)
    expect(sent.ignore_existing).toBe(true)
    expect(sent.email_address).toBe('someone@example.com')
  })

  test('a relative /sign-up is used when APP_URL is unset — never the default', async () => {
    vi.resetModules()
    vi.doMock('@/lib/env', () => ({ env: { CLERK_SECRET_KEY: 'sk_test_fake' } }))
    const mod = await import('./clerk-invitations')

    await mod.createInvitation('someone@example.com')

    const sent = bodyOf(fetchMock.mock.calls[0]!)
    expect(sent.redirect_url).toBe('/sign-up')
  })

  test('reports not_configured rather than throwing when Clerk has no key', async () => {
    vi.resetModules()
    vi.doMock('@/lib/env', () => ({ env: {} }))
    const mod = await import('./clerk-invitations')

    const result = await mod.createInvitation('someone@example.com')

    expect(result).toEqual({
      ok: false,
      reason: 'not_configured',
      message: 'Clerk is not configured, so no invitation was sent.',
    })
  })
})
