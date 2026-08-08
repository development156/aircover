import { describe, it, expect } from 'vitest'
import { ScopeError, scopeAccount, scopeProfile, type ScopedProfileId } from './scope'

const WS = '5f17dad6-35ae-4288-aba1-1e3a4df31189'
const OTHER_WS = '00000000-0000-0000-0000-000000000000'
const PROFILE = '6a75cae32853ee463c6419d6'
const ACCOUNT = '6a75caf7d0fe733d1afcc1f4'
/** The shared "Default" profile every key gets — doc 13 §2.3's cross-tenant leak. */
const DEFAULT_PROFILE = '6a69d2ac81d9920d149afc18'

const profileRow = (o: Partial<{ workspace_id: string; profile_id: string }> = {}) => ({
  workspace_id: WS,
  profile_id: PROFILE,
  ...o,
})

const connRow = (o: { workspace_id?: string; id?: unknown; profileId?: unknown } = {}) => ({
  workspace_id: o.workspace_id ?? WS,
  external_account: {
    id: 'id' in o ? o.id : ACCOUNT,
    profileId: 'profileId' in o ? o.profileId : PROFILE,
  },
})

describe('scopeProfile — a profile id may only come from this workspace’s own row', () => {
  it('mints a scoped id from a matching row', () => {
    expect(scopeProfile(profileRow(), WS)).toBe(PROFILE)
  })

  it('refuses a row fetched for a DIFFERENT workspace', () => {
    // The mis-joined-query case. Zernio would answer 200 for the other tenant's data.
    expect(() => scopeProfile(profileRow({ workspace_id: OTHER_WS }), WS)).toThrow(ScopeError)
  })

  it('refuses a missing row rather than falling back to every profile on the key', () => {
    expect(() => scopeProfile(null, WS)).toThrow(ScopeError)
  })

  it('refuses an id that is not a 24-char hex Zernio id', () => {
    expect(() => scopeProfile(profileRow({ profile_id: 'default' }), WS)).toThrow(ScopeError)
    expect(() => scopeProfile(profileRow({ profile_id: crypto.randomUUID() }), WS)).toThrow(
      ScopeError,
    )
  })
})

describe('scopeAccount — an account id may only come from this workspace’s connection', () => {
  const scoped = scopeProfile(profileRow(), WS)

  it('mints a scoped id when the row matches workspace AND profile', () => {
    expect(scopeAccount(connRow(), WS, scoped)).toBe(ACCOUNT)
  })

  it('refuses a connection belonging to another workspace', () => {
    expect(() => scopeAccount(connRow({ workspace_id: OTHER_WS }), WS, scoped)).toThrow(ScopeError)
  })

  /**
   * Doc 13 §2.3 observed exactly this live: an account under the shared Default
   * profile surfaced while working in another profile. Publishing to it would have
   * gone to a different customer's Instagram and returned HTTP 200.
   */
  it('refuses an account sitting under a different Zernio profile', () => {
    expect(() => scopeAccount(connRow({ profileId: DEFAULT_PROFILE }), WS, scoped)).toThrow(
      ScopeError,
    )
  })

  it('refuses a connection with no usable account id', () => {
    expect(() => scopeAccount(connRow({ id: undefined }), WS, scoped)).toThrow(ScopeError)
    expect(() => scopeAccount(connRow({ id: 'demo-x-acct-8891' }), WS, scoped)).toThrow(ScopeError)
    expect(() => scopeAccount(null, WS, scoped)).toThrow(ScopeError)
  })
})

describe('the brands are not forgeable', () => {
  it('a plain string is not assignable to ScopedProfileId', () => {
    // @ts-expect-error a bare string must never satisfy ScopedProfileId
    const forged: ScopedProfileId = PROFILE
    // The runtime value is fine; it is the COMPILE step that must refuse it, which is
    // what @ts-expect-error asserts. Referencing it keeps the lint rule quiet.
    expect(typeof forged).toBe('string')
  })
})
