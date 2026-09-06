import { describe, it, expect, vi } from 'vitest'

import { createStorageLister } from './deps'

const WS = '11111111-1111-4111-8111-111111111111'

/** A fake Storage REST: one folder tree, answered page by page. */
function fakeStorage(
  tree: Record<string, { name: string; id: string | null; created_at?: string }[]>,
) {
  const calls: { method: string; url: string; body: unknown }[] = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method: init?.method ?? 'GET', url, body })
    if (init?.method === 'DELETE') return new Response('[]', { status: 200 })
    const entries = tree[body.prefix] ?? []
    return new Response(JSON.stringify(entries.slice(body.offset, body.offset + body.limit)), {
      status: 200,
    })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

describe('createStorageLister', () => {
  it('walks folders (id: null) and returns full paths with their ages', async () => {
    const { fetchImpl } = fakeStorage({
      [`${WS}/derivatives`]: [{ name: 'asset-1', id: null }],
      [`${WS}/derivatives/asset-1`]: [
        { name: 'a.png', id: 'obj-1', created_at: '2026-09-01T00:00:00Z' },
        { name: 'b.png', id: 'obj-2' },
      ],
    })
    const lister = createStorageLister({
      supabaseUrl: 'https://x.supabase.co/',
      serviceRoleKey: 'k',
      fetchImpl,
    })

    const objects = await lister.listObjects(`${WS}/derivatives/`)

    expect(objects).toEqual([
      { path: `${WS}/derivatives/asset-1/a.png`, createdAt: '2026-09-01T00:00:00Z' },
      { path: `${WS}/derivatives/asset-1/b.png`, createdAt: null },
    ])
  })

  it('pages through a folder larger than one listing', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ name: `f${i}.png`, id: `o${i}` }))
    const { fetchImpl, calls } = fakeStorage({ [`${WS}/assets`]: many })
    const lister = createStorageLister({
      supabaseUrl: 'https://x.supabase.co',
      serviceRoleKey: 'k',
      fetchImpl,
    })

    const objects = await lister.listObjects(`${WS}/assets/`)

    expect(objects).toHaveLength(1001)
    expect(calls.map((c) => (c.body as { offset: number }).offset)).toEqual([0, 1000])
  })

  it('deletes by the exact paths it was given, and nothing for an empty list', async () => {
    const { fetchImpl, calls } = fakeStorage({})
    const lister = createStorageLister({
      supabaseUrl: 'https://x.supabase.co',
      serviceRoleKey: 'k',
      fetchImpl,
    })

    await lister.removeObjects([])
    expect(calls).toEqual([])

    await lister.removeObjects([`${WS}/assets/a.png`])
    expect(calls).toEqual([
      {
        method: 'DELETE',
        url: 'https://x.supabase.co/storage/v1/object/media',
        body: { prefixes: [`${WS}/assets/a.png`] },
      },
    ])
  })

  it('a non-2xx listing throws without echoing the URL', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const lister = createStorageLister({
      supabaseUrl: 'https://x.supabase.co',
      serviceRoleKey: 'k',
      fetchImpl,
    })

    await expect(lister.listObjects(`${WS}/assets/`)).rejects.toThrow('storage list returned 500')
  })
})
