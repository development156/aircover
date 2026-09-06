import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ViewerComposer } from './viewer-composer'

const recordRemixLineage = vi.fn()
vi.mock('@/app/actions/studio-remix', () => ({
  recordRemixLineage: (...args: unknown[]) => recordRemixLineage(...args),
}))

/**
 * The real `Composer` is exercised by its own tests. What matters here is
 * whether THIS caller (a) hands it the prefilled values it was given and
 * (b) reacts correctly to `onGenerated`, so it is stubbed to a button that
 * fires the same callback the real bar fires on a successful press.
 */
vi.mock('@/components/studio/composer', () => ({
  Composer: (props: {
    initialValues?: { wanted?: string }
    extraControls?: React.ReactNode
    onGenerated?: (result: {
      ok: true
      generationId: string
      balanceAfter: number
      made: number
      asked: number
    }) => void
  }) => (
    <div>
      <span data-testid="prefilled-wanted">{props.initialValues?.wanted}</span>
      {props.extraControls}
      <button
        type="button"
        onClick={() =>
          props.onGenerated?.({
            ok: true,
            generationId: 'new-generation-id',
            balanceAfter: 10,
            made: 1,
            asked: 1,
          })
        }
      >
        fire onGenerated
      </button>
    </div>
  ),
}))

const SOURCE_ID = '11111111-1111-4111-8111-111111111111'

function renderComposer(remixLocked: boolean) {
  render(
    <ViewerComposer
      formats={[]}
      library={{ status: 'ok', pictures: [] }}
      signals={null}
      initialValues={{ wanted: 'A plate of fresh samosas' }}
      sourceGenerationId={SOURCE_ID}
      remixLocked={remixLocked}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  recordRemixLineage.mockResolvedValue({ ok: true })
})

describe('ViewerComposer', () => {
  it('hands the composer the prefilled values it was given, asserted by value', () => {
    renderComposer(false)
    expect(screen.getByTestId('prefilled-wanted')).toHaveTextContent('A plate of fresh samosas')
  })

  it('remix on and unlocked: a successful press links the new picture to the one it started from', async () => {
    renderComposer(false)
    fireEvent.click(screen.getByText('fire onGenerated'))
    await waitFor(() =>
      expect(recordRemixLineage).toHaveBeenCalledWith('new-generation-id', SOURCE_ID),
    )
  })

  it('remix turned off: a successful press links nothing', async () => {
    renderComposer(false)
    fireEvent.click(screen.getByRole('button', { name: /keep with this one/i }))
    fireEvent.click(screen.getByText('fire onGenerated'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(recordRemixLineage).not.toHaveBeenCalled()
  })

  it('locked: renders the locked reason, never a live toggle that could no-op', () => {
    renderComposer(true)
    expect(screen.queryByRole('button', { name: /keep with this one/i })).not.toBeInTheDocument()
    expect(screen.getByText(/cannot yet remember/i)).toBeInTheDocument()
  })

  it('locked: a successful press never attempts to link, whatever the toggle would have said', async () => {
    renderComposer(true)
    fireEvent.click(screen.getByText('fire onGenerated'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(recordRemixLineage).not.toHaveBeenCalled()
  })
})
