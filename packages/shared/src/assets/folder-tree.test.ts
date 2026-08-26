import { describe, expect, it } from 'vitest'

import {
  AssetSmartFolderSchema,
  MAX_FOLDER_DEPTH,
  canMoveFolder,
  descendantIds,
  folderDepth,
  folderPath,
  normalizeFolderName,
  sameFolderName,
  type FolderNodeInput,
} from './folder-tree'

const node = (id: string, parent_id: string | null, name = id): FolderNodeInput => ({
  id,
  parent_id,
  name,
})

/** a → b → c, plus an unrelated root d. */
const TREE: FolderNodeInput[] = [node('a', null), node('b', 'a'), node('c', 'b'), node('d', null)]

describe('normalizeFolderName', () => {
  it('collapses runs of whitespace, because two spaces are not a different folder', () => {
    expect(normalizeFolderName('Diwali   2026')).toBe('Diwali 2026')
    expect(normalizeFolderName('  Storefront  ')).toBe('Storefront')
  })

  it('returns null for a name that is only whitespace, rather than an invisible folder', () => {
    expect(normalizeFolderName('   ')).toBeNull()
    expect(normalizeFolderName('')).toBeNull()
    expect(normalizeFolderName('\n\t')).toBeNull()
  })

  it('treats case and spacing as the same name', () => {
    expect(sameFolderName('Diwali', 'diwali')).toBe(true)
    expect(sameFolderName('Diwali  2026', 'DIWALI 2026')).toBe(true)
    expect(sameFolderName('Diwali', 'Dussehra')).toBe(false)
  })
})

describe('folderPath', () => {
  it('reads root first and the folder itself last, which is breadcrumb order', () => {
    expect(folderPath(TREE, 'c').map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('is empty for a folder that is no longer there, rather than throwing', () => {
    // A breadcrumb for a folder deleted in another tab must render as gone, not
    // take the whole library down.
    expect(folderPath(TREE, 'nope')).toEqual([])
  })

  it('TERMINATES on a parent chain that loops', () => {
    // The database forbids this. A hand-edited or restored row could still
    // produce it, and without the visit set this call never returns — which on
    // the server is not a wrong answer, it is a hung request.
    const looped = [node('x', 'y'), node('y', 'x')]
    const path = folderPath(looped, 'x')
    expect(path.length).toBeLessThanOrEqual(2)
  })
})

describe('descendantIds', () => {
  it('finds children at every depth and excludes the folder itself', () => {
    expect(descendantIds(TREE, 'a')).toEqual(new Set(['b', 'c']))
    expect(descendantIds(TREE, 'b')).toEqual(new Set(['c']))
  })

  it('is empty for a leaf', () => {
    expect(descendantIds(TREE, 'c').size).toBe(0)
  })

  it('TERMINATES on a cycle among stored rows', () => {
    const looped = [node('p', null), node('x', 'p'), node('y', 'x'), node('x2', 'y')]
    // Force a loop: y's child points back at y's ancestor.
    const withLoop = [...looped, node('x', 'y')]
    expect(() => descendantIds(withLoop, 'p')).not.toThrow()
  })
})

describe('canMoveFolder — the cycle', () => {
  it('refuses a folder into itself', () => {
    const decision = canMoveFolder(TREE, 'a', 'a')
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason).toBe('into-itself')
  })

  it('refuses a folder into its own child', () => {
    const decision = canMoveFolder(TREE, 'a', 'b')
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason).toBe('into-own-child')
  })

  it('refuses a folder into its own GRANDCHILD, which a parent-only check would allow', () => {
    // The one a naive `newParent.parent_id !== id` test lets through, and it
    // detaches the whole subtree from the root with no error anywhere.
    const decision = canMoveFolder(TREE, 'a', 'c')
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason).toBe('into-own-child')
  })

  it('allows a move to an unrelated folder', () => {
    expect(canMoveFolder(TREE, 'c', 'd').ok).toBe(true)
  })

  it('allows a move to the root', () => {
    expect(canMoveFolder(TREE, 'c', null).ok).toBe(true)
  })

  it('reports a folder that has gone as missing, not as a cycle', () => {
    const gone = canMoveFolder(TREE, 'ghost', 'a')
    expect(gone.ok).toBe(false)
    if (gone.ok) throw new Error('unreachable')
    expect(gone.reason).toBe('missing')

    const noParent = canMoveFolder(TREE, 'c', 'ghost')
    expect(noParent.ok).toBe(false)
    if (noParent.ok) throw new Error('unreachable')
    expect(noParent.reason).toBe('missing')
  })
})

describe('canMoveFolder — the depth limit counts the whole subtree', () => {
  /** A chain of `n` folders: f1 at the root, each next inside the last. */
  const chain = (n: number, prefix = 'f'): FolderNodeInput[] =>
    Array.from({ length: n }, (_, i) => node(`${prefix}${i + 1}`, i === 0 ? null : `${prefix}${i}`))

  it('allows a move that lands exactly on the limit', () => {
    // A 5-deep chain plus one root: moving the chain's head under the root puts
    // its deepest leaf at exactly MAX_FOLDER_DEPTH.
    const folders = [...chain(MAX_FOLDER_DEPTH - 1), node('host', null)]
    const decision = canMoveFolder(folders, 'f1', 'host')
    expect(decision.ok).toBe(true)
    expect(MAX_FOLDER_DEPTH).toBe(6)
  })

  it('refuses when the folder being MOVED would sit too deep', () => {
    const folders = [...chain(MAX_FOLDER_DEPTH), node('leaf', null)]
    const decision = canMoveFolder(folders, 'leaf', `f${MAX_FOLDER_DEPTH}`)
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason).toBe('too-deep')
  })

  it('refuses when the folder fits but its CHILDREN would not', () => {
    // The whole reason the check walks the subtree. Under `h4` (depth 4) the
    // dragged folder `f1` lands at depth 5, INSIDE the limit of 6 — so any
    // check that looked only at the folder being dragged would allow this. Its
    // grandchild `f3` lands at 7. Measuring the folder alone is how a subtree
    // gets pushed past the limit with nothing reporting it.
    const host = chain(4, 'h') // h1 → h4, so h4 is at depth 4
    const moving = chain(3) // f1 → f2 → f3
    const folders = [...host, ...moving]
    // The discriminating half, asserted rather than described: the dragged
    // folder on its own is fine, and only the subtree makes it a refusal.
    expect(
      folderDepth(
        folders.map((f) => (f.id === 'f1' ? { ...f, parent_id: 'h4' } : f)),
        'f1',
      ),
    ).toBe(5)
    const decision = canMoveFolder(folders, 'f1', 'h4')
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason).toBe('too-deep')
    // And the sentence names the limit, so the person knows what the rule is.
    expect(decision.message).toContain(String(MAX_FOLDER_DEPTH))
  })

  it('folderDepth calls a root folder depth 1 and an unknown folder 0', () => {
    expect(folderDepth(TREE, 'a')).toBe(1)
    expect(folderDepth(TREE, 'c')).toBe(3)
    expect(folderDepth(TREE, 'ghost')).toBe(0)
  })
})

describe('AssetSmartFolderSchema is the gate on a jsonb column', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    name: 'Needs a description',
    created_by: 'user_1',
    created_at: '2026-08-26T00:00:00.000Z',
    updated_at: '2026-08-26T00:00:00.000Z',
  }

  it('parses a row whose saved question is a real query', () => {
    const parsed = AssetSmartFolderSchema.safeParse({
      ...row,
      query: { mode: 'all', rules: [{ field: 'description', is: 'missing' }] },
    })
    expect(parsed.success).toBe(true)
  })

  it('REFUSES a row whose query column holds something else', () => {
    // Postgres will store any jsonb at all here. This parse is the only thing
    // between a corrupt column and a folder that silently answers a different
    // question than the one it is named after.
    for (const query of [null, {}, 'all', 42, { mode: 'all' }, { rules: [] }]) {
      expect(AssetSmartFolderSchema.safeParse({ ...row, query }).success).toBe(false)
    }
  })
})
