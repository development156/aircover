import { describe, expect, test } from 'vitest'

import { resolveActiveWorkspace, type WorkspaceOption } from './workspaces'

const older: WorkspaceOption = {
  id: 'w-demo',
  name: 'Chai & Chapters (Demo)',
  slug: 'chai-and-chapters-demo',
  timezone: null,
  createdBy: 'demo_seed',
}
const own: WorkspaceOption = {
  id: 'w-mine',
  name: 'My workspace',
  slug: 'mine',
  timezone: null,
  createdBy: 'user_me',
}

describe('resolveActiveWorkspace', () => {
  test('the cookie wins when it still names a membership', () => {
    expect(resolveActiveWorkspace([older, own], 'chai-and-chapters-demo', 'user_me')).toBe(older)
  })

  test('with no cookie, the workspace this user created beats an older membership', () => {
    // MEASURED 2026-09-06: a membership added to an older workspace silently
    // became the active one and a form submitted on "My workspace" wrote there.
    expect(resolveActiveWorkspace([older, own], null, 'user_me')).toBe(own)
  })

  test('with no cookie and no own workspace, the first membership stands', () => {
    expect(resolveActiveWorkspace([older, own], null, 'user_invited')).toBe(older)
    expect(resolveActiveWorkspace([older, own], null, null)).toBe(older)
  })

  test('a cookie naming a workspace the user left is ignored, then own wins', () => {
    expect(resolveActiveWorkspace([older, own], 'gone', 'user_me')).toBe(own)
  })

  test('none means null', () => {
    expect(resolveActiveWorkspace([], null, 'user_me')).toBeNull()
  })
})
