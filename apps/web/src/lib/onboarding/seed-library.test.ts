import { describe, it, expect, vi } from 'vitest'

import { MIN_SEED_CHARS, seedLibraryFromSite } from './seed-library'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/knowledge/ingest', () => ({ createThenIndex: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

/**
 * The seam that fills an empty library, and the two ways it must never behave:
 * it must not put a login wall in somebody's library, and it must not be able to
 * break signup.
 */

const SITE = 'x'.repeat(MIN_SEED_CHARS)
const ok = () => vi.fn().mockResolvedValue({ ok: true, documentId: 'doc-1', message: 'Read' })

describe('seedLibraryFromSite', () => {
  it('puts the website the door already read into the library', async () => {
    const ingest = ok()
    const outcome = await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://trainx.in', text: SITE, title: null },
      ingest,
    )

    expect(outcome).toBe('seeded')
    const [input] = ingest.mock.calls[0]!
    expect(input).toMatchObject({
      workspaceId: 'ws-1',
      sourceKind: 'url',
      sourceRef: 'https://trainx.in',
    })
  })

  it('stores the text the door produced rather than fetching the page again', async () => {
    const ingest = ok()
    await seedLibraryFromSite({ workspaceId: 'ws-1', url: 'https://trainx.in', text: SITE }, ingest)

    const [, read] = ingest.mock.calls[0]!
    await expect(read()).resolves.toEqual({ ok: true, text: SITE, title: null })
  })

  it('names the document after the site when the crawl found no title', async () => {
    const ingest = ok()
    await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://www.trainx.in/about', text: SITE },
      ingest,
    )

    expect(ingest.mock.calls[0]![0].title).toBe('www.trainx.in')
  })

  it('prefers the title the crawl found', async () => {
    const ingest = ok()
    await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://trainx.in', text: SITE, title: 'TRAINX' },
      ingest,
    )

    expect(ingest.mock.calls[0]![0].title).toBe('TRAINX')
  })

  /**
   * THE ONE THIS FILE EXISTS FOR. 74 characters is the real Instagram document
   * sitting in production, indexed and badged as a success. A seed nobody asked
   * for must not be able to add another.
   */
  it('refuses a login wall, using the real 74-character one as the case', async () => {
    const ingest = ok()
    const wall = 'Instagram\nSee everyday moments from your close friends.\nLog into Instagram'
    expect(wall).toHaveLength(74)

    const outcome = await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://www.instagram.com/trainx_studio/', text: wall },
      ingest,
    )

    expect(outcome).toBe('skipped')
    expect(ingest).not.toHaveBeenCalled()
  })

  it('refuses text that is only whitespace past the floor', async () => {
    const ingest = ok()
    const outcome = await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://trainx.in', text: ' '.repeat(5000) },
      ingest,
    )

    expect(outcome).toBe('skipped')
    expect(ingest).not.toHaveBeenCalled()
  })

  it('does nothing when the customer gave no address', async () => {
    const ingest = ok()
    const outcome = await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: '   ', text: SITE },
      ingest,
    )

    expect(outcome).toBe('skipped')
    expect(ingest).not.toHaveBeenCalled()
  })

  it('reports a refused document as failed rather than seeded', async () => {
    const ingest = vi.fn().mockResolvedValue({ ok: false, message: 'too long' })
    const outcome = await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://trainx.in', text: SITE },
      ingest,
    )

    expect(outcome).toBe('failed')
  })

  /**
   * Signup must survive anything this does. A customer who finished the door
   * and watched their brand resolve cannot be shown a broken screen over a
   * library row they never asked for.
   */
  it('never throws, whatever the library does', async () => {
    const ingest = vi.fn().mockRejectedValue(new Error('database gone'))

    await expect(
      seedLibraryFromSite({ workspaceId: 'ws-1', url: 'https://trainx.in', text: SITE }, ingest),
    ).resolves.toBe('failed')
  })

  it('the floor is 200 characters, and 199 is not enough', async () => {
    expect(MIN_SEED_CHARS).toBe(200)

    const ingest = ok()
    await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://trainx.in', text: 'y'.repeat(MIN_SEED_CHARS - 1) },
      ingest,
    )
    expect(ingest).not.toHaveBeenCalled()

    await seedLibraryFromSite(
      { workspaceId: 'ws-1', url: 'https://trainx.in', text: 'y'.repeat(MIN_SEED_CHARS) },
      ingest,
    )
    expect(ingest).toHaveBeenCalledTimes(1)
  })
})
