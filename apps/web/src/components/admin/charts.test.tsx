import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OpsQaRun, OpsTask } from '@sahoda/shared'

import { FlowChart } from './flow-chart'
import { GateChart } from './gate-chart'
import { buildFlowHistory } from '@/lib/ops/flow-history'
import { buildGateHistory } from '@/lib/ops/gate-history'

const NOW = new Date('2026-07-28T12:00:00Z')

const task = (createdAt: string, over: Partial<OpsTask> = {}): OpsTask =>
  ({
    code: 'SL-001',
    title: 'x',
    detail: null,
    doc_ref: null,
    roadmap_code: null,
    board_column: 'todo',
    assignee: 'claude',
    blocked: false,
    blocked_reason: null,
    pr_ref: null,
    commit_sha: null,
    started_at: null,
    review_at: null,
    done_at: null,
    moved_by: 'claude',
    sort: 10,
    created_at: createdAt,
    updated_at: createdAt,
    ...over,
  }) as OpsTask

const run = (suite: string, status: string, day: string): OpsQaRun =>
  ({
    id: crypto.randomUUID(),
    task_code: null,
    kind: 'auto',
    suite,
    status,
    summary_plain: null,
    details: null,
    actor: 'claude',
    duration_ms: 10,
    started_at: `${day}T09:00:00Z`,
    finished_at: `${day}T09:00:01Z`,
    created_at: `${day}T09:00:00Z`,
    updated_at: `${day}T09:00:01Z`,
  }) as OpsQaRun

describe('FlowChart', () => {
  it('invites the first card rather than drawing an empty axis', () => {
    render(<FlowChart history={buildFlowHistory([], NOW)} />)

    expect(screen.getByText(/The first card will start this/i)).toBeInTheDocument()
  })

  it('says so, visibly, when there is not enough history for a trend', () => {
    // The rule has to be legible to the reader, not just obeyed by the renderer.
    render(<FlowChart history={buildFlowHistory([task('2026-07-27T09:00:00Z')], NOW)} />)

    expect(screen.getByText(/Fewer than five days of history/i)).toBeInTheDocument()
  })

  it('drops the warning once five days exist', () => {
    render(<FlowChart history={buildFlowHistory([task('2026-07-24T09:00:00Z')], NOW)} />)

    expect(screen.queryByText(/Fewer than five days/i)).not.toBeInTheDocument()
  })

  it('names its window and its blind spot', () => {
    render(<FlowChart history={buildFlowHistory([task('2026-07-24T09:00:00Z')], NOW)} />)

    expect(screen.getByText(/5 days · 2026-07-24 to 2026-07-28/)).toBeInTheDocument()
    expect(screen.getByText(/under-reports rather than over-reports/i)).toBeInTheDocument()
  })

  it('labels every stage in a legend, so colour is never the only cue', () => {
    render(<FlowChart history={buildFlowHistory([task('2026-07-24T09:00:00Z')], NOW)} />)

    for (const label of ['To Do', 'In Progress', 'For Review', 'Done']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

describe('GateChart', () => {
  it('renders a day with no run as a hollow cell, not a coloured one', () => {
    // The gap rule, at the pixel. A filled cell would assert a verdict.
    const history = buildGateHistory([run('unit', 'pass', '2026-07-28')], NOW, 3)
    const { container } = render(<GateChart history={history} />)

    const unitRow = screen.getByLabelText('unit by day')
    const cells = Array.from(unitRow.querySelectorAll('li'))

    expect(cells).toHaveLength(3)
    expect(cells[0]!.className).toContain('border-dashed')
    expect(cells[2]!.className).toContain('bg-ok')
    expect(container.querySelectorAll('.bg-ok')).toHaveLength(1)
  })

  it('says "never ran" rather than leaving a suite looking green', () => {
    const history = buildGateHistory([run('unit', 'pass', '2026-07-28')], NOW, 3)
    render(<GateChart history={history} />)

    expect(screen.getAllByText('never ran').length).toBeGreaterThan(0)
  })

  it('paints a failure crimson and names it in words', () => {
    const history = buildGateHistory([run('rls', 'fail', '2026-07-28')], NOW, 3)
    render(<GateChart history={history} />)

    expect(screen.getByText(/failing · 1d/)).toBeInTheDocument()
  })

  it('tells the reader an empty window is empty, not green', () => {
    render(<GateChart history={buildGateHistory([], NOW, 7)} />)

    expect(screen.getByText(/empty, not green/i)).toBeInTheDocument()
  })

  it('warns when nothing has five measured days yet', () => {
    const history = buildGateHistory([run('unit', 'pass', '2026-07-28')], NOW, 7)
    render(<GateChart history={history} />)

    expect(screen.getByText(/read these as individual runs, not a trend/i)).toBeInTheDocument()
  })

  it('titles every cell so a gap is readable, not just visible', () => {
    const history = buildGateHistory([run('unit', 'pass', '2026-07-28')], NOW, 2)
    render(<GateChart history={history} />)

    // Scoped to one suite: every suite has a cell for every day, so these
    // titles legitimately repeat across rows.
    const unitRow = screen.getByLabelText('unit by day')
    const titles = Array.from(unitRow.querySelectorAll('li')).map((cell) =>
      cell.getAttribute('title'),
    )

    expect(titles).toEqual(['2026-07-27 — did not run', '2026-07-28 — passing'])
  })
})
