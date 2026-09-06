import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { ComposerInitialValues } from '@/components/studio/composer'
import type { CanvasPicture } from '@/lib/studio/canvas'

import { ViewerScreen } from './viewer-screen'

/**
 * THE TWO ACTIONS THE TWO-SCREEN SPLIT SWITCHED OFF, WIRED BACK IN.
 *
 * "Draw on it" and "Remove this from the list" were reachable from the wall
 * until 2026-09-05, when the wall stopped mounting the components that offered
 * them and nothing else did. wt-divas's unmounted-components guard named them
 * at the merge. These tests pin the WIRING, which is the thing that went
 * missing: the action is offered, pressing it opens the tool, and finishing
 * lands the person somewhere useful. The tools themselves keep their own tests.
 */
const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))

// The tool is loaded on the press; here it is a stub that reports what it was
// handed and offers one Save.
vi.mock('@/components/studio/draw-modal', () => ({
  DrawModal: ({
    open,
    picture,
    onSaved,
  }: {
    open: boolean
    picture: { width: number; height: number } | null
    onSaved: (assetId: string) => void
  }) =>
    open ? (
      <div role="dialog" aria-label="Draw">
        <span data-testid="draw-size">
          {picture === null ? 'no picture' : `${picture.width}x${picture.height}`}
        </span>
        <button type="button" onClick={() => onSaved('drawn-1')}>
          Save the mark-up
        </button>
      </div>
    ) : null,
}))

// The composer's seed is the claim, so the stub prints it.
vi.mock('@/components/studio/viewer-composer', () => ({
  ViewerComposer: ({ initialValues }: { initialValues: ComposerInitialValues }) => (
    <div data-testid="composer-seed">
      {initialValues.mode}:{(initialValues.referenceAssetIds ?? []).join(',')}
    </div>
  ),
}))

vi.mock('@/components/studio/picture-actions', () => ({
  PictureActions: ({ onDraw }: { onDraw?: () => void }) => (
    <div>{onDraw === undefined ? null : <button onClick={onDraw}>Draw on it</button>}</div>
  ),
}))

const discardGeneration = vi.fn()
vi.mock('@/app/actions/studio', () => ({
  discardGeneration: (id: string) => discardGeneration(id),
}))

vi.mock('@/components/studio/viewer-logo-section', () => ({
  ViewerLogoSection: () => <div data-testid="logo-section" />,
}))
vi.mock('@/components/studio/viewer-details', () => ({
  ViewerDetails: () => <div data-testid="details" />,
}))
vi.mock('@/components/studio/viewer-prompt-panel', () => ({
  ViewerPromptPanel: () => <div data-testid="prompt-panel" />,
}))
vi.mock('@/components/studio/viewer-header', () => ({
  ViewerHeader: () => <div data-testid="header" />,
}))
vi.mock('@/components/studio/viewer-versions-strip', () => ({
  ViewerVersionsStrip: () => null,
}))

const PICTURE: CanvasPicture = {
  imageId: 'img-1',
  assetId: 'asset-1',
  url: 'https://signed.example/a.png',
  width: 1024,
  height: 768,
  prompt: 'A plate of fresh samosas',
  formatId: null,
  mime: 'image/png',
  mode: 'on_brand',
  referenceAssetIds: [],
  stampedUrl: null,
  stampOutcome: null,
  madeAgo: '2h ago',
}

const INITIAL: ComposerInitialValues = {
  wanted: 'A plate of fresh samosas',
  mode: 'on_brand',
  referenceAssetIds: [],
}

function open(picture: CanvasPicture = PICTURE) {
  return render(
    <ViewerScreen
      picture={picture}
      modelId={null}
      referenceAssetIds={[]}
      versions={null}
      formats={[]}
      library={{ status: 'ok', pictures: [] }}
      signals={[]}
      initialValues={INITIAL}
      sourceGenerationId="gen-1"
      remixLocked
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom has no <dialog> methods; the confirmation is `ui/modal.tsx`'s native
  // dialog. Same stub `plan-offer-modal.test.tsx` uses.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('draw on it', () => {
  test('is offered, opens the canvas at the picture’s own size, and the mark-up becomes the next edit', async () => {
    const user = userEvent.setup()
    open()
    expect(screen.getByTestId('composer-seed').textContent).toBe('on_brand:')

    await user.click(screen.getByRole('button', { name: /draw on it/i }))
    const dialog = await screen.findByRole('dialog', { name: /draw/i })
    expect(dialog).toBeTruthy()
    expect(screen.getByTestId('draw-size').textContent).toBe('1024x768')

    await user.click(screen.getByRole('button', { name: /save the mark-up/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /draw/i })).toBeNull())
    // Straight into the mode that uses it, with it already picked.
    expect(screen.getByTestId('composer-seed').textContent).toBe('edit:drawn-1')
    // The asset is on the server; the library prop is not until this re-reads.
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('is not offered for a picture whose size was never recorded', () => {
    open({ ...PICTURE, width: null, height: null })
    expect(screen.queryByRole('button', { name: /draw on it/i })).toBeNull()
  })
})

describe('remove this from the list', () => {
  test('confirms, removes the record, and leaves the screen that was showing it', async () => {
    const user = userEvent.setup()
    discardGeneration.mockResolvedValue({ ok: true })
    open()

    await user.click(await screen.findByRole('button', { name: /remove this from the list/i }))
    await user.click(screen.getByRole('button', { name: /remove the request/i }))

    await waitFor(() => expect(discardGeneration).toHaveBeenCalledWith('gen-1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/studio'))
  })

  test('stays put when the removal failed, and says so', async () => {
    const user = userEvent.setup()
    discardGeneration.mockResolvedValue({
      ok: false,
      message: 'Sahoda could not remove that just now.',
    })
    open()

    await user.click(await screen.findByRole('button', { name: /remove this from the list/i }))
    await user.click(screen.getByRole('button', { name: /remove the request/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })
})
