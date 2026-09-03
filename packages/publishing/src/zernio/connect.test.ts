import { describe, expect, it } from 'vitest'

import { ZernioError, type ZernioClient, type ZernioProfile } from './client'
import {
  ensureZernioProfile,
  profileBelongsToWorkspace,
  profileNameForWorkspace,
  ZERNIO_DEFAULT_PROFILE_ID,
} from './connect'

/**
 * ONE IDEMPOTENCY KEY, TWO BODIES, AND A CUSTOMER WHO COULD CONNECT NOTHING.
 *
 * MEASURED: Sentry JAVASCRIPT-NEXTJS-1M, 2026-08-25, three events in 32 seconds
 * on POST /api/oauth/zernio/start: `createProfile: This Idempotency-Key was
 * already used with a different request body`. The profile name embedded the
 * workspace NAME, the lookup matched on that exact string, and the key was the
 * workspace ID alone. Rename the workspace and the lookup misses, the create is
 * sent under the old key with a new body, and Zernio refuses. Every channel,
 * every retry, for as long as Zernio remembers the key.
 *
 * Two things change here. The lookup matches on the workspace's id token in the
 * name, which a rename cannot move. And the key is a function of the body, so a
 * different body never collides. The second is safe ONLY because of the first:
 * on its own it would mint a fresh profile per rename and land on
 * PROFILE_ALREADY_BOUND in Postgres.
 */

const WS_A = 'a1b2c3d4-0000-4000-8000-000000000001'
const WS_B = 'ffffffff-0000-4000-8000-000000000002'

/** A Zernio that remembers idempotency keys the way the real one does. */
function fakeZernio(seed: ZernioProfile[] = []) {
  const profiles: ZernioProfile[] = [...seed]
  const keys = new Map<string, string>()
  const createCalls: { name: string; key: string | undefined }[] = []
  let listCalls = 0
  let next = 1

  const client = {
    listProfiles(name?: string) {
      listCalls += 1
      return Promise.resolve(
        name === undefined ? profiles : profiles.filter((p) => p.name === name),
      )
    },
    createProfile(name: string, key?: string) {
      createCalls.push({ name, key })
      if (key !== undefined) {
        const seen = keys.get(key)
        if (seen !== undefined && seen !== name) {
          return Promise.reject(
            new ZernioError({
              message:
                'createProfile: This Idempotency-Key was already used with a different request body',
              status: 422,
              code: 'IDEMPOTENCY_KEY_REUSED',
              type: 'client_error',
              rateLimit: { limit: null, remaining: null, reset: null },
            }),
          )
        }
        if (seen === name) {
          const replay = profiles.find((p) => p.name === name)
          if (replay) return Promise.resolve(replay)
        }
        keys.set(key, name)
      }
      const created = { _id: `6a8d3af765ef313d46dc01${String(next++).padStart(2, '0')}`, name }
      profiles.push(created)
      return Promise.resolve(created)
    },
  }

  return {
    client: client as unknown as ZernioClient,
    profiles,
    createCalls,
    listCalls: () => listCalls,
  }
}

describe('a renamed workspace keeps the profile it already has', () => {
  it('finds the profile after a rename instead of creating under a reused key', async () => {
    const z = fakeZernio()

    const first = await ensureZernioProfile(z.client, {
      workspaceId: WS_A,
      workspaceName: "someone@example.com's workspace",
    })
    // The rename. Same workspace, new name. RED before the fix: the lookup missed
    // and the create went out under the old key with a different body.
    const second = await ensureZernioProfile(z.client, {
      workspaceId: WS_A,
      workspaceName: 'TRAINX',
    })

    expect(second).toBe(first)
    expect(z.createCalls).toHaveLength(1)
  })

  it('matches on the workspace id token, never on the display name', async () => {
    const z = fakeZernio([
      { _id: '6a8d3af765ef313d46dc012c', name: 'sahoda:Old Name (a1b2c3d4)' },
      { _id: '6a8d3af765ef313d46dc0999', name: 'sahoda:TRAINX (ffffffff)' },
    ])

    const id = await ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'TRAINX' })

    // The OTHER workspace happens to carry the new name. Matching on the name
    // would hand this workspace somebody else's profile: the cross-tenant
    // condition the whole mapping exists to prevent.
    expect(id).toBe('6a8d3af765ef313d46dc012c')
    expect(z.createCalls).toHaveLength(0)
  })

  it('the same press twice creates one profile', async () => {
    const z = fakeZernio()
    const args = { workspaceId: WS_A, workspaceName: 'Chai & Chapters' }

    const a = await ensureZernioProfile(z.client, args)
    const b = await ensureZernioProfile(z.client, args)

    expect(a).toBe(b)
    expect(z.createCalls).toHaveLength(1)
  })

  it('creates when there is genuinely none, named so a person can find it', async () => {
    const z = fakeZernio([{ _id: '6a8d3af765ef313d46dc0999', name: 'sahoda:Other (ffffffff)' }])

    await ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'Chai & Chapters' })

    expect(z.createCalls[0]?.name).toBe('sahoda:Chai & Chapters (a1b2c3d4)')
    expect(z.createCalls[0]?.name).toBe(profileNameForWorkspace(WS_A, 'Chai & Chapters'))
  })
})

describe('the idempotency key is a function of the body', () => {
  it('two different bodies for one workspace never share a key', async () => {
    // The ambiguous-create window: Zernio has not listed the first profile yet
    // when the second press arrives under a new name. The key must differ or the
    // second is refused as a body mismatch, which is the measured outage.
    const z = fakeZernio()
    await ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'Before' })
    z.profiles.length = 0

    await ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'After' })

    const [first, second] = z.createCalls
    expect(first?.key).toBeDefined()
    expect(second?.key).toBeDefined()
    expect(first?.key).not.toBe(second?.key)
  })

  it('still carries the workspace id, so a double-submit of one body is one profile', async () => {
    const z = fakeZernio()
    await ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'Chai' })
    expect(z.createCalls[0]?.key).toContain(WS_A)
  })

  it('differs across workspaces with the same name', async () => {
    const z = fakeZernio()
    await ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'Chai' })
    await ensureZernioProfile(z.client, { workspaceId: WS_B, workspaceName: 'Chai' })
    expect(z.createCalls[0]?.key).not.toBe(z.createCalls[1]?.key)
  })
})

describe('what still refuses', () => {
  it('refuses Zernio’s shared Default profile even when it carries our token', async () => {
    const z = fakeZernio([{ _id: ZERNIO_DEFAULT_PROFILE_ID, name: 'sahoda:Chai (a1b2c3d4)' }])
    await expect(
      ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'Chai' }),
    ).rejects.toMatchObject({ code: 'DEFAULT_PROFILE_REFUSED' })
  })

  it('refuses a profile id that is not a 24-hex object id', async () => {
    const z = fakeZernio([{ _id: 'nope', name: 'sahoda:Chai (a1b2c3d4)' }])
    await expect(
      ensureZernioProfile(z.client, { workspaceId: WS_A, workspaceName: 'Chai' }),
    ).rejects.toMatchObject({ code: 'INVALID_PROFILE_ID' })
  })
})

describe('profileBelongsToWorkspace', () => {
  it('matches the token at the end of the name, whatever the name says', () => {
    expect(profileBelongsToWorkspace('sahoda:TRAINX (a1b2c3d4)', WS_A)).toBe(true)
    expect(profileBelongsToWorkspace("sahoda:x@y.com's workspace (a1b2c3d4)", WS_A)).toBe(true)
  })

  it('does not match a token that merely appears inside the name', () => {
    // A workspace literally named "(a1b2c3d4)" must not claim another's profile.
    expect(profileBelongsToWorkspace('sahoda:(a1b2c3d4) (ffffffff)', WS_A)).toBe(false)
    expect(profileBelongsToWorkspace('Default', WS_A)).toBe(false)
    expect(profileBelongsToWorkspace('sahoda:TRAINX (a1b2c3d5)', WS_A)).toBe(false)
  })
})
