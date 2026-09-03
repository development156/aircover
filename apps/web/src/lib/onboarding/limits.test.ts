import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  keys: [] as string[],
  refuse: ((_key: string) => false) as (key: string) => boolean,
}))

vi.mock('@/lib/ops/rate-limit', () => ({
  fixedWindowAllow: async (key: string, limit: number, seconds: number) => {
    calls.keys.push(`${key}|${limit}|${seconds}`)
    return { allowed: !calls.refuse(key), count: 1, unmeasured: false }
  },
}))

const { doorReadAllowed, freeResolveAllowed } = await import('./limits')

beforeEach(() => {
  calls.keys = []
  calls.refuse = () => false
})

describe('doorReadAllowed', () => {
  it('asks a minute and a day window for the person AND the workspace', async () => {
    expect(await doorReadAllowed('user_1', 'ws_1')).toBe(true)
    expect(calls.keys.sort()).toEqual(
      [
        'door:u:user_1|4|60',
        'door:w:ws_1|4|60',
        'door:day:u:user_1|30|86400',
        'door:day:w:ws_1|30|86400',
      ].sort(),
    )
  })

  /**
   * THE WORKSPACE HOP. A person can erase and re-create a workspace, and a
   * limit keyed on the workspace alone starts from zero each time. The user
   * key is what makes that loop end.
   */
  it('a refusal on the user key holds across a change of workspace', async () => {
    calls.refuse = (key) => key.startsWith('door:u:')
    expect(await doorReadAllowed('user_1', 'ws_1')).toBe(false)
    expect(await doorReadAllowed('user_1', 'ws_2')).toBe(false)
  })

  it('a refusal on any one window refuses', async () => {
    calls.refuse = (key) => key === 'door:day:w:ws_1'
    expect(await doorReadAllowed('user_1', 'ws_1')).toBe(false)
  })
})

describe('freeResolveAllowed', () => {
  it('is a daily window of three on both keys', async () => {
    expect(await freeResolveAllowed('user_1', 'ws_1')).toBe(true)
    expect(calls.keys.sort()).toEqual(
      ['resolve:free:day:u:user_1|3|86400', 'resolve:free:day:w:ws_1|3|86400'].sort(),
    )
  })

  it('refuses when either key is over', async () => {
    calls.refuse = (key) => key.includes(':w:')
    expect(await freeResolveAllowed('user_1', 'ws_1')).toBe(false)
  })
})
