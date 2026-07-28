import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  exportResult: {} as Record<string, unknown>,
  importResult: {} as Record<string, unknown>,
}))

vi.mock('@/app/actions/ops-qa-transfer', () => ({
  exportQaJson: vi.fn(async () => state.exportResult),
  importQaJson: vi.fn(async () => state.importResult),
}))

import { QaTransfer } from './qa-transfer'

beforeEach(() => {
  state.exportResult = {
    ok: true,
    filename: 'sahoda-qa-2026-07-28.json',
    json: '{}',
    truncated: false,
  }
  state.importResult = {
    ok: true,
    summary: { headline: 'Imported 2 of 2 runs.', artifactNote: null, conflicts: [] },
  }

  // jsdom has neither, and the component uses both to hand over a file.
  global.URL.createObjectURL = vi.fn(() => 'blob:x')
  global.URL.revokeObjectURL = vi.fn()
})

function pick(name = 'export.json', contents = '{}') {
  return new File([contents], name, { type: 'application/json' })
}

describe('QaTransfer', () => {
  it('says up front that screenshots do not travel in the file', () => {
    // The single most surprising thing about this feature, so it is stated
    // before anyone clicks rather than discovered after a restore.
    render(<QaTransfer />)

    expect(screen.getByText(/restores the runs, not the images/i)).toBeInTheDocument()
  })

  it('shows nothing in the panel until something has happened', () => {
    render(<QaTransfer />)

    expect(screen.queryByTestId('qa-transfer-panel')).not.toBeInTheDocument()
  })

  it('names the file it saved', async () => {
    render(<QaTransfer />)

    await userEvent.click(screen.getByRole('button', { name: 'Export JSON' }))

    expect(await screen.findByText('sahoda-qa-2026-07-28.json')).toBeInTheDocument()
  })

  it('warns where the person is when the export was truncated', async () => {
    // Stating it only inside the file they may never open is not stating it.
    state.exportResult = { ...state.exportResult, truncated: true }
    render(<QaTransfer />)

    await userEvent.click(screen.getByRole('button', { name: 'Export JSON' }))

    expect(await screen.findByText(/more runs than one export holds/i)).toBeInTheDocument()
  })

  it('reports a failed export instead of a silent no-op', async () => {
    state.exportResult = {
      ok: false,
      message: 'We could not read the runs, so nothing was exported.',
    }
    render(<QaTransfer />)

    await userEvent.click(screen.getByRole('button', { name: 'Export JSON' }))

    expect(await screen.findByText(/nothing was exported/i)).toBeInTheDocument()
  })

  it('lists conflicts rather than merging them silently', async () => {
    // §11: "conflicts and rejects listed in a result panel, never silently
    // merged."
    state.importResult = {
      ok: true,
      summary: {
        headline: 'Imported 1 of 2 runs, 1 already recorded.',
        artifactNote: null,
        conflicts: [{ id: 'abc-123', reason: 'already recorded' }],
      },
    }
    render(<QaTransfer />)

    await userEvent.upload(screen.getByLabelText('Import JSON'), pick())

    expect(await screen.findByText('Imported 1 of 2 runs, 1 already recorded.')).toBeInTheDocument()
    expect(screen.getByText(/abc-123 · already recorded/)).toBeInTheDocument()
  })

  it('surfaces the artifact note when the file described screenshots', async () => {
    state.importResult = {
      ok: true,
      summary: {
        headline: 'Imported 1 of 1 runs.',
        artifactNote: '3 screenshots are described in this file but were not restored.',
        conflicts: [],
      },
    }
    render(<QaTransfer />)

    await userEvent.upload(screen.getByLabelText('Import JSON'), pick())

    expect(await screen.findByText(/were not restored/i)).toBeInTheDocument()
  })

  it('shows a rejected file as an error, not as an import', async () => {
    state.importResult = { ok: false, message: 'That is not a JSON file.' }
    render(<QaTransfer />)

    await userEvent.upload(screen.getByLabelText('Import JSON'), pick('notes.txt', 'hello'))

    expect(await screen.findByText('That is not a JSON file.')).toBeInTheDocument()
    expect(screen.queryByText(/Imported/)).not.toBeInTheDocument()
  })
})
