import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `/studio/<id>`, WITH THE READ STUBBED.
 *
 * The page's own job is to turn `readPictureForViewer`'s four answers into
 * the right thing: a real Next 404 for `not-found`, an inline "could not be
 * read" section for `unreadable` that STILL offers Back, and — for `ok` — the
 * right props reaching `ViewerScreen`, most importantly `remixLocked` tracking
 * the lineage columns rather than being guessed.
 */

const readPictureForViewer = vi.fn()
vi.mock('@/lib/studio/viewer-read', () => ({
  readPictureForViewer: (...args: unknown[]) => readPictureForViewer(...args),
}))

vi.mock('@/lib/studio/read', () => ({
  readLibraryPictures: vi.fn().mockResolvedValue({ status: 'ok', pictures: [] }),
}))
vi.mock('@/lib/studio/brand-signals', () => ({ brandSignalsFor: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/studio/formats', () => ({ generatableFormats: () => [] }))
vi.mock('@/lib/wallet/read', () => ({
  readBalance: vi.fn().mockResolvedValue({ status: 'ok', balance: { available: 42 } }),
}))
vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: vi.fn().mockResolvedValue({ status: 'ok', workspace: { id: 'ws1' } }),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/components/studio/viewer-screen', () => ({
  ViewerScreen: (props: {
    remixLocked: boolean
    sourceGenerationId: string
    initialValues: { wanted?: string }
  }) => (
    <div
      data-testid="viewer-screen"
      data-remix-locked={String(props.remixLocked)}
      data-source-generation={props.sourceGenerationId}
      data-wanted={props.initialValues.wanted}
    />
  ),
}))

const { default: StudioViewerPage } = await import('./page')

const GENERATION = {
  id: 'gen-1',
  workspace_id: 'ws1',
  status: 'ready' as const,
  mode: 'on_brand' as const,
  prompt_given: 'A plate of fresh samosas',
  prompt_sent: null,
  provider: null,
  model_id: null,
  image_tier: null,
  seed: null,
  format_id: null,
  channel: null,
  width: null,
  height: null,
  requested_count: 1,
  reference_asset_ids: [],
  brand_signals: null,
  cost_credits: null,
  ledger_entry_id: null,
  provider_cost_micro_usd: null,
  error_code: null,
  error_detail: null,
  started_at: null,
  finished_at: '2026-09-04T00:01:00Z',
  created_by: null,
  created_at: '2026-09-04T00:00:00Z',
  updated_at: '2026-09-04T00:01:00Z',
}

const PICTURE = {
  imageId: 'img-1',
  assetId: 'asset-1',
  url: 'https://signed.example/a.png',
  width: 1024,
  height: 1024,
  prompt: 'A plate of fresh samosas',
  formatId: null,
  mime: 'image/png',
  mode: 'on_brand' as const,
  referenceAssetIds: [],
  stampedUrl: null,
  stampOutcome: null,
  madeAgo: '2h ago',
}

async function page(id = 'img-1') {
  return render(await StudioViewerPage({ params: Promise.resolve({ id }) }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a picture that does not exist, or belongs to another workspace', () => {
  it('is a 404, never a rendered screen', async () => {
    readPictureForViewer.mockResolvedValue({ status: 'not-found' })
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('a read that failed', () => {
  it('says the picture could not be read, offers Back, and is not a 404', async () => {
    readPictureForViewer.mockResolvedValue({ status: 'unreadable' })
    await page()
    expect(screen.getByText(/could not read this picture/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to your work/i })).toHaveAttribute(
      'href',
      '/studio',
    )
  })
})

describe('a picture that reads fine', () => {
  it('locks the remix control when the lineage columns are not applied', async () => {
    readPictureForViewer.mockResolvedValue({
      status: 'ok',
      picture: PICTURE,
      generation: GENERATION,
      lineage: { columnsApplied: false },
      versions: null,
    })
    await page()
    const screenEl = screen.getByTestId('viewer-screen')
    expect(screenEl).toHaveAttribute('data-remix-locked', 'true')
    expect(screenEl).toHaveAttribute('data-source-generation', 'gen-1')
    expect(screenEl).toHaveAttribute('data-wanted', 'A plate of fresh samosas')
  })

  it('leaves the remix control live once the lineage columns are confirmed', async () => {
    readPictureForViewer.mockResolvedValue({
      status: 'ok',
      picture: PICTURE,
      generation: GENERATION,
      lineage: { columnsApplied: true, remixedFrom: null, stamp: null },
      versions: null,
    })
    await page()
    expect(screen.getByTestId('viewer-screen')).toHaveAttribute('data-remix-locked', 'false')
  })
})
