import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { queueGeneration } from '@/app/actions/studio'
import { StudioWorkbench } from '@/components/studio/studio-workbench'
import type { CanvasPicture } from '@/lib/studio/canvas'
import { generatableFormats } from '@/lib/studio/formats'
import type { LibraryPicture, LibraryRead } from '@/lib/studio/read'

/**
 * THE WALL, AFTER THE REDESIGN.
 *
 * ── WHAT THIS FILE NO LONGER COVERS, AND WHERE IT WENT ────────────────────
 * The composer (the bar: prompt, price, pickers, refiner, "Will send," "Not
 * built yet") was extracted to `composer.tsx` and its own
 * `composer.test.tsx` now owns every assertion about it — the bar's shape,
 * the mode/model/size/match/logo panels, the reference picker, the press
 * guard, the growing textarea, the refiner. Nothing in that half was
 * deleted; it moved with the code it tests.
 *
 * What WAS deleted outright is the old inline "canvas" result section: one
 * picture, its actions row, the stamped/original toggle, the placement
 * sentence and the locked "Save"/"Use in a post" pair. `Wall.dc.html` (the
 * approved redesign) removes that section entirely — a customer's own
 * pictures now run the wall at full width instead. The tests that pinned it
 * ("the canvas draws the picture, not a description of one," "the result
 * screen: which version, and why there is only one," "turning a picture
 * into a post," "asking for the same thing again") are DELETED along with
 * the section, not parked: there is no markup left for them to describe,
 * and `PictureActions` / `PictureViewer` / `DrawModal` / `anchor-note.ts` /
 * `stamp-copy.ts` (the modules those tests exercised) are untouched and
 * still carry their own unit tests — pass 2's viewer route is expected to
 * reuse them and to write its own screen-level coverage there.
 *
 * This file now covers only the wall itself: the sticky composer's own
 * ground, the grid of tiles (each a `<Link>` to `/studio/<id>`, a route pass
 * 2 builds), the filter row, and first-run.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/actions/studio', () => ({
  queueGeneration: vi.fn(),
  startPostFromPicture: vi.fn(),
}))
vi.mock('@/app/actions/assets', () => ({ uploadAsset: vi.fn() }))
vi.mock('@/app/actions/studio-prompt', () => ({ refineStudioPrompt: vi.fn() }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

afterEach(cleanup)

const LIBRARY: LibraryPicture[] = [
  { assetId: 'a1', url: 'https://example.test/1.png', title: 'A shopfront' },
]

const MADE = [
  {
    imageId: 'p1',
    assetId: 'asset-1',
    url: 'https://example.test/made-1.png',
    width: 1080,
    height: 1080,
    prompt: 'a plate of samosas',
    formatId: 'square',
    mime: 'image/png',
    mode: 'on_brand' as const,
    referenceAssetIds: [],
    stampedUrl: null,
    stampOutcome: null,
    madeAgo: null,
  },
  {
    imageId: 'p2',
    assetId: 'asset-2',
    url: 'https://example.test/made-2.png',
    width: 1080,
    height: 1920,
    prompt: 'the shopfront at dawn',
    formatId: 'story',
    mime: 'image/webp',
    mode: 'match' as const,
    referenceAssetIds: ['a2'],
    stampedUrl: null,
    stampOutcome: null,
    madeAgo: null,
  },
]

const open = (library: LibraryPicture[] | LibraryRead = LIBRARY, pictures: CanvasPicture[] = []) =>
  render(
    <StudioWorkbench
      formats={generatableFormats()}
      library={Array.isArray(library) ? { status: 'ok', pictures: library } : library}
      pictures={pictures}
      signals={[]}
      balance={null}
    />,
  )

describe('the shape of the screen', () => {
  test('the root is a single column, not a two-column grid', () => {
    const { container } = open()
    const root = container.querySelector('[data-guide="studio-workbench"]') as HTMLElement
    expect(root).not.toBeNull()
    expect(root.className).not.toMatch(/grid-cols/)
  })

  test('the root itself carries no width cap, so the wall below can run full width', () => {
    const { container } = open()
    const root = container.querySelector('[data-guide="studio-workbench"]') as HTMLElement
    expect(root.className).not.toMatch(/max-w-\[var\(--measure-form\)\]/)
  })

  /** The composer floats: sticky, with its own ground, so the wall passes under its edge. */
  test('the composer section is sticky, with its own ground', () => {
    const { container } = open()
    const make = container.querySelector('#studio-make')?.parentElement as HTMLElement
    expect(make.className).toMatch(/sticky/)
    expect(make.className).toMatch(/bg-canvas/)
  })
})

describe('the inline result section is gone', () => {
  test('there is no canvas panel, picture-actions row or logo bar anywhere on the screen', () => {
    const { container } = open(LIBRARY, MADE)
    expect(container.querySelector('[data-guide="studio-canvas"]')).toBeNull()
    expect(container.querySelector('[data-guide="studio-picture-actions"]')).toBeNull()
    expect(container.querySelector('[data-guide="studio-logo-bar"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /use these words again/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /use it in a post/i })).toBeNull()
    expect(screen.queryByText(/exact placement/i)).toBeNull()
  })
})

describe('the wall: full page width, with a filter row', () => {
  const square = { ...MADE[0]!, imageId: 'sq', width: 1080, height: 1080 }
  const story = {
    ...MADE[1]!,
    imageId: 'story',
    width: 1080,
    height: 1920,
    stampedUrl: null,
    stampOutcome: null,
  }
  const wide = {
    ...MADE[0]!,
    imageId: 'wide',
    width: 1600,
    height: 900,
    stampedUrl: null,
    stampOutcome: null,
  }
  const stamped = {
    ...MADE[0]!,
    imageId: 'stamped',
    width: 1080,
    height: 1080,
    stampedUrl: 'https://example.test/stamped.png',
    stampOutcome: 'stamped' as const,
  }
  const SHAPES = [square, story, wide, stamped]

  /**
   * ── EACH TILE LINKS TO THE VIEWER'S OWN ROUTE ─────────────────────────
   * `/studio/<id>` does not exist yet — pass 2 builds it. A real `<Link>`
   * that 404s for one commit is the honest gap; a click handler here would
   * be a second thing that pass would have to unpick.
   *
   * MUTATION: point every tile's `href` at a constant id (say
   * `picture.imageId` replaced with `'x'`) in `studio-workbench.tsx` and the
   * second assertion below goes red — every tile would carry the same href.
   */
  test('every tile is a link to /studio/<its own id>', () => {
    const { container } = open(LIBRARY, SHAPES)
    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    const links = within(grid).getAllByRole('link')
    expect(links).toHaveLength(SHAPES.length)
    // By HREF, not by accessible name: two of these fixtures share a prompt
    // on purpose (the whole point of this test is that the id, not the
    // words, decides where a tile goes), so a name query would find more
    // than one and prove nothing about the id.
    for (const picture of SHAPES) {
      const link = links.find((one) => one.getAttribute('href') === `/studio/${picture.imageId}`)
      expect(link, picture.imageId).toBeTruthy()
      expect(link!.getAttribute('aria-label')).toBe(picture.prompt)
    }
    const hrefs = new Set(links.map((link) => link.getAttribute('href')))
    expect(hrefs.size).toBe(SHAPES.length)
  })

  test('all four shapes are shown under "All"', () => {
    const { container } = open(LIBRARY, SHAPES)
    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(within(grid).getAllByRole('link')).toHaveLength(SHAPES.length)
  })

  test('"Square post" narrows the grid to square pictures', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, SHAPES)
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    await user.click(within(filters).getByRole('button', { name: 'Square post' }))

    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(within(grid).getAllByRole('link')).toHaveLength(2)
  })

  test('"Story" and "Wide" narrow to the tall and the landscape picture respectively', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, SHAPES)
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    const grid = () => container.querySelector('[data-guide="studio-strip"]') as HTMLElement

    await user.click(within(filters).getByRole('button', { name: 'Story' }))
    expect(within(grid()).getAllByRole('link')).toHaveLength(1)
    expect(within(grid()).getByRole('link', { name: story.prompt })).toBeTruthy()

    await user.click(within(filters).getByRole('button', { name: 'Wide' }))
    expect(within(grid()).getAllByRole('link')).toHaveLength(1)
    expect(within(grid()).getByRole('link', { name: wide.prompt })).toBeTruthy()
  })

  test('"With logo" narrows to pictures Sahoda actually stamped', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, SHAPES)
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    await user.click(within(filters).getByRole('button', { name: 'With logo' }))

    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(within(grid).getAllByRole('link')).toHaveLength(1)
    expect(within(grid).getByRole('link', { name: stamped.prompt })).toBeTruthy()
  })

  test('a filter that matches nothing says so rather than showing an empty grid silently', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, [square])
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    await user.click(within(filters).getByRole('button', { name: 'Story' }))
    expect(container.querySelector('[data-guide="studio-strip"]')).toBeNull()
    expect(screen.getByText(/nothing matches this filter/i)).toBeTruthy()
  })

  test("the grid is not capped at the composer's own measure", () => {
    const { container } = open(LIBRARY, SHAPES)
    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(grid.className).not.toMatch(/max-w-\[820px\]/)
  })

  test('every earlier picture carries the two facts that tell it from the others', () => {
    const made = [
      { ...MADE[0]!, formatId: 'square', madeAgo: '2 h ago', stampedUrl: null, stampOutcome: null },
      {
        ...MADE[1]!,
        formatId: 'story',
        madeAgo: '3 days ago',
        stampedUrl: null,
        stampOutcome: null,
      },
    ]
    open(LIBRARY, made)

    expect(screen.getByText(/square · 2 h ago/i)).toBeTruthy()
    expect(screen.getByText(/story · 3 days ago/i)).toBeTruthy()
  })

  test('a picture whose age would not parse still shows its shape', () => {
    open(LIBRARY, [{ ...MADE[0]!, formatId: 'square', madeAgo: null }])
    expect(screen.getByText('square')).toBeTruthy()
  })

  test('the wall shows the stamped version where there is one', () => {
    open(LIBRARY, [
      { ...MADE[0]!, stampedUrl: 'https://example.test/stamped.png', stampOutcome: 'stamped' },
    ])
    const tile = screen.getAllByRole('link', { name: MADE[0]!.prompt })[0]!
    expect(tile.querySelector('img')!.getAttribute('src')).toBe('https://example.test/stamped.png')
  })

  test('says how to open one, and every tile is a real, enabled link with a name', () => {
    const { container } = open(LIBRARY, MADE)
    expect(screen.getByText(/open one to see how it was made/i)).toBeTruthy()

    const strip = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    for (const tile of within(strip).getAllByRole('link')) {
      expect(tile.getAttribute('aria-label')).toBeTruthy()
      expect(tile.getAttribute('href')).toMatch(/^\/studio\//)
    }
  })
})

describe('first run: nothing made yet', () => {
  test('the grid is replaced by a line saying nothing has been made, with no invented picture', () => {
    const { container } = open(LIBRARY, [])
    expect(screen.getByText(/nothing made yet/i)).toBeTruthy()
    const empty = container.querySelector('[data-guide="studio-empty"]') as HTMLElement
    expect(empty).not.toBeNull()
    expect(within(empty).queryAllByRole('img')).toHaveLength(0)
  })

  test('the empty-run block does not repeat the composer’s own starter chips', () => {
    const { container } = open(LIBRARY, [])
    const barStarters = container.querySelector('[data-guide="studio-starters"]') as HTMLElement
    expect(barStarters).not.toBeNull()
    expect(within(barStarters).getAllByRole('button').length).toBeGreaterThan(2)

    const empty = container.querySelector('[data-guide="studio-empty"]') as HTMLElement
    expect(within(empty).queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelectorAll('[data-guide="studio-starters"]')).toHaveLength(1)
  })

  test('the empty-run block disappears once a picture exists', () => {
    const { container } = open(LIBRARY, MADE)
    expect(container.querySelector('[data-guide="studio-empty"]')).toBeNull()
  })

  /**
   * ── THE COMPOSER'S OWN `busy` REACHES THE WALL'S FIRST-RUN MESSAGE ────────
   * `composer.test.tsx` proves the composer reports `busy` via
   * `onBusyChange`; this proves the wall actually uses it to swap its
   * first-run sentence, which is the one thing about the message that only
   * exists once the two components are mounted together.
   *
   * MUTATION: drop `onBusyChange={setBusy}` from the `<Composer>` call in
   * `studio-workbench.tsx` and this goes red — the first-run message would
   * stay "Nothing made yet" even while a press is in flight.
   */
  test('says Sahoda is working, fed by the composer, on the first press', async () => {
    vi.mocked(queueGeneration).mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    open(LIBRARY, [])
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    fireEvent.click(screen.getByRole('button', { name: /generate image/i }))

    await waitFor(() => expect(screen.getByText(/generating your first image now/i)).toBeTruthy())
  })
})
