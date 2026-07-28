import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { OpsQaRun } from '@sahoda/shared'

const state = vi.hoisted(() => ({
  save: { ok: true, runId: '11111111-1111-4111-8111-111111111111' } as
    { ok: true; runId: string } | { ok: false; message: string },
  finalize: { ok: true } as { ok: true } | { ok: false; message: string },
  finalizeCalls: [] as unknown[],
  toasts: [] as string[],
}))

vi.mock('@/app/actions/ops-qa', () => ({
  saveQaDraft: vi.fn(async () => state.save),
  finalizeQaRun: vi.fn(async (input: unknown) => {
    state.finalizeCalls.push(input)
    return state.finalize
  }),
  signQaUpload: vi.fn(async () => ({ ok: false, message: 'not used here' })),
  recordQaArtifact: vi.fn(async () => ({ ok: true })),
}))

vi.mock('sonner', () => ({
  toast: {
    error: (message: string) => state.toasts.push(`error:${message}`),
    success: (message: string) => state.toasts.push(`success:${message}`),
  },
}))

import { QaComposer } from './qa-composer'

const DRAFT: OpsQaRun = {
  id: '22222222-2222-4222-8222-222222222222',
  task_code: 'SL-019',
  kind: 'manual',
  suite: 'manual',
  status: 'running',
  summary_plain: 'half-written notes',
  details: 'step one',
  actor: 'divas@example.test',
  duration_ms: null,
  started_at: '2026-07-28T09:00:00Z',
  finished_at: null,
  created_at: '2026-07-28T09:00:00Z',
  updated_at: '2026-07-28T09:00:00Z',
} as OpsQaRun

beforeEach(() => {
  state.save = { ok: true, runId: '11111111-1111-4111-8111-111111111111' }
  state.finalize = { ok: true }
  state.finalizeCalls = []
  state.toasts = []
})

describe('QaComposer', () => {
  it('restores an unfinished draft rather than showing an empty form', async () => {
    // §11: "a closed tab never loses notes; drafts restore on return." A blank
    // form here is the failure that requirement exists to prevent, and it looks
    // exactly like a working one.
    render(<QaComposer openDraft={DRAFT} restoredThumbs={[]} taskCodes={['SL-019', 'SL-020']} />)

    expect(screen.getByLabelText('What you checked')).toHaveValue('half-written notes')
    expect(screen.getByLabelText('Notes')).toHaveValue('step one')
    expect(screen.getByLabelText('Task')).toHaveValue('SL-019')
  })

  it('starts empty when there is no draft to restore', () => {
    render(<QaComposer openDraft={null} restoredThumbs={[]} taskCodes={[]} />)

    expect(screen.getByLabelText('What you checked')).toHaveValue('')
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
  })

  it('shows restored screenshots as already stored, not as uploading', () => {
    render(
      <QaComposer
        openDraft={DRAFT}
        restoredThumbs={[
          { key: 'a', url: 'https://signed/one.png', caption: 'the wallet', state: 'stored' },
        ]}
        taskCodes={[]}
      />,
    )

    expect(screen.getByAltText('the wallet')).toBeInTheDocument()
    expect(screen.queryByText('Uploading…')).not.toBeInTheDocument()
  })

  it('refuses to record without a verdict, and does not call the server', async () => {
    render(<QaComposer openDraft={DRAFT} restoredThumbs={[]} taskCodes={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Record run' }))

    expect(state.finalizeCalls).toEqual([])
    expect(state.toasts).toContain('error:Pick a result first.')
  })

  it('refuses to record an empty summary — a sealed run cannot be edited later', async () => {
    render(
      <QaComposer
        openDraft={{ ...DRAFT, summary_plain: '' } as OpsQaRun}
        restoredThumbs={[]}
        taskCodes={[]}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Record run' }))

    expect(state.finalizeCalls).toEqual([])
    expect(state.toasts.some((entry) => entry.startsWith('error:Say in one line'))).toBe(true)
  })

  it('records a complete run with the verdict that was chosen', async () => {
    render(<QaComposer openDraft={DRAFT} restoredThumbs={[]} taskCodes={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Fail' }))
    await userEvent.click(screen.getByRole('button', { name: 'Record run' }))

    expect(state.finalizeCalls).toHaveLength(1)
    expect(state.finalizeCalls[0]).toMatchObject({ status: 'fail', summary: 'half-written notes' })
  })

  it('keeps the notes on screen when recording fails', async () => {
    // Clearing the form on a failed seal would destroy the very notes the
    // person is being asked to retry.
    state.finalize = { ok: false, message: 'That was not saved.' }
    render(<QaComposer openDraft={DRAFT} restoredThumbs={[]} taskCodes={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Record run' }))

    expect(screen.getByLabelText('Notes')).toHaveValue('step one')
    expect(state.toasts).toContain('error:That was not saved.')
  })

  it('says a recorded run cannot be edited, where the person can see it', () => {
    render(<QaComposer openDraft={null} restoredThumbs={[]} taskCodes={[]} />)

    expect(screen.getByText(/cannot be edited afterwards/i)).toBeInTheDocument()
  })
})
