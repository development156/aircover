import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { creditCost } from '@sahoda/shared'

// `vi.hoisted` because vi.mock is lifted above every const in the file, and a
// factory closing over a plain `const` throws "cannot access before
// initialization" at import time.
const { approve, execute } = vi.hoisted(() => ({
  approve: vi.fn(async () => ({ ok: true, approvedCredits: 6, includedItems: 2 })),
  execute: vi.fn(async () => ({ ok: true, drafted: 2, suggested: 0, spent: 8 })),
}))
vi.mock('@/app/actions/playbook-controls', () => ({ approveRunCost: approve }))
vi.mock('@/app/actions/playbook-run', () => ({ executeRun: execute }))

import { RunPreview, type PreviewItem } from './run-preview'

const DRAFT = creditCost('post_variants')
const RUN = creditCost('playbook_run')

const item = (id: string, position: number, title: string): PreviewItem => ({
  id,
  position,
  title,
  estimatedCredits: DRAFT,
  channels: ['instagram'],
})

const TWO = [item('a', 1, 'Republic Day'), item('b', 2, 'Independence Day')]

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * THE COST PREVIEW, RENDERED.
 *
 * The `(app)` routes cannot be opened without a Clerk session, and this
 * environment has no `apps/web/.env.local` to make one — so the rendered tree is
 * where these claims get checked. That is not a lesser check for what is being
 * asserted here: every claim below is about TEXT AND NUMBERS, which is exactly
 * what a DOM assertion reads and what a screenshot cannot.
 *
 * ── THIS FILE IS WHAT `/playbooks` LEFT `roadmap-honesty.spec.ts` FOR ────────
 * That spec asserts a permitted SET of digits on screens that are drawings. This
 * screen is not a drawing any more, so the property it needs is about
 * PROVENANCE: every digit here is a price out of pricing.config.json, a sum of
 * them, or a count of rows. The last test in this file is the one that matters,
 * and the test after it proves the scan can fail.
 */
describe('the playbook cost preview', () => {
  it('shows the whole total BEFORE anything is spent, and says so', () => {
    render(<RunPreview runId="r1" items={TWO} availableCredits={100} approvedCredits={null} />)
    expect(screen.getByText(/Nothing has been charged/i)).toBeTruthy()
    // Per line, plus the run's own charge, plus both together. `getAllByText`
    // because the whole total appears twice on purpose — once in the summary and
    // once IN THE BUTTON LABEL, which is where UI_RULES_v3 requires it.
    expect(screen.getAllByText(String(DRAFT)).length).toBe(2)
    expect(screen.getAllByText(String(2 * DRAFT)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(String(RUN)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(String(2 * DRAFT + RUN)).length).toBe(2)
  })

  it('puts the price in the button label, never only in a total', () => {
    render(<RunPreview runId="r1" items={TWO} availableCredits={100} approvedCredits={null} />)
    const button = screen.getByRole('button', { name: /Approve this run/i })
    expect(button.textContent).toMatch(new RegExp(String(2 * DRAFT + RUN)))
    expect(button.textContent).toMatch(/credits?/)
  })

  it('follows the total DOWN as items are unchecked, button included', () => {
    render(<RunPreview runId="r1" items={TWO} availableCredits={100} approvedCredits={null} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    fireEvent.click(boxes[0]!)
    expect(screen.getByRole('button', { name: /Approve this run/i }).textContent).toMatch(
      new RegExp(String(DRAFT + RUN)),
    )
  })

  it('sends the OUTPUT total it showed as the expected credits', async () => {
    render(<RunPreview runId="r1" items={TWO} availableCredits={100} approvedCredits={null} />)
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    fireEvent.click(screen.getByRole('button', { name: /Approve this run/i }))
    await vi.waitFor(() => expect(approve).toHaveBeenCalled())
    const [runId, excluded, expected] = approve.mock.calls[0] as unknown as [
      string,
      string[],
      number,
    ]
    expect(runId).toBe('r1')
    expect(excluded).toEqual(['b'])
    // This is what makes the preview a contract: the server recomputes from the
    // rows and REFUSES if it disagrees with the figure that was on screen. The
    // per-run charge is excluded because no trim can change it.
    expect(expected).toBe(DRAFT)
  })

  // ── THE REFUSAL, AT THE ONE AND AT THE MANY ───────────────────────────────
  // This branch is the one a funded workspace never reaches, and therefore the
  // one nobody ever looks at. A peer lane shipped "needs 1 credits" into exactly
  // this corner. Rendered here rather than read off the source, at both numbers.
  it('refuses at zero balance, showing both numbers and stating nothing was charged', () => {
    render(<RunPreview runId="r1" items={TWO} availableCredits={0} approvedCredits={null} />)
    const alert = screen.getByText(/Nothing was charged\./i)
    expect(alert.textContent).toMatch(new RegExp(`needs ${2 * DRAFT + RUN} credits`))
    expect(alert.textContent).toMatch(/has 0 credits/)
    expect(
      (screen.getByRole('button', { name: /Approve this run/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('says "1 credit", not "1 credits", in the branch only an empty wallet sees', () => {
    // The BALANCE half of the sentence, driven to one. The `needs` half cannot
    // reach one from this component — the per-run charge alone is already more
    // than that — so it is pinned directly on `shortfallMessage` in
    // `lib/playbooks/cost.test.ts`, which is where the string is built.
    render(
      <RunPreview
        runId="r1"
        items={[{ ...item('a', 1, 'New Year'), estimatedCredits: DRAFT }]}
        availableCredits={1}
        approvedCredits={null}
      />,
    )
    const alert = screen.getByText(/Nothing was charged\./i)
    expect(alert.textContent).toMatch(/has 1 credit\b/)
    expect(alert.textContent).not.toMatch(/has 1 credits/)
  })

  // ── THE PROPERTY THIS SCREEN LEFT roadmap-honesty.spec.ts FOR ─────────────
  it('prints NO figure that is not a credit price, a sum of them, or a count of rows', () => {
    const { container } = render(
      <RunPreview runId="r1" items={TWO} availableCredits={100} approvedCredits={null} />,
    )
    expect(unexpectedFigures(container.textContent ?? '', 2, 100)).toEqual([])
  })

  it('AND THE SCAN CAN FAIL — a fabricated engagement figure is caught', () => {
    // The check above is worth exactly as much as its ability to go red. A test
    // built by scraping the same `creditCost()` calls the component makes would
    // be self-consistent under any mutation; this proves it is not.
    const withReach = `${2 * DRAFT} ${RUN} 2 100 · 4,200 people reached`
    expect(unexpectedFigures(withReach, 2, 100)).toEqual(['4200'])
  })
})

/**
 * Every standalone run of digits in `text` that is NOT a credit price, a sum of
 * the prices on screen, a count of the rows, or the balance.
 *
 * The permitted set is WRITTEN OUT rather than derived from the component, for
 * the reason `roadmap-honesty.spec.ts` gives about its own allow-list: a test
 * that builds its expectation from the code it is testing passes whatever that
 * code returns.
 */
function unexpectedFigures(text: string, itemCount: number, balance: number): string[] {
  const allowed = new Set(
    [
      DRAFT, // one draft
      RUN, // the run's own charge
      itemCount * DRAFT, // the drafts together
      itemCount * DRAFT + RUN, // the whole total
      itemCount, // a count of rows
      balance, // what the workspace holds
      0, // a zero balance, and a zero count
      1, // the singular branch's balance
    ].map(String),
  )
  return (text.match(/\d[\d,]*/g) ?? [])
    .map((n) => n.replace(/,/g, ''))
    .filter((n) => !allowed.has(n))
}
