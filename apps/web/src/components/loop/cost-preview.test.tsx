import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { creditCost, toChannelSet } from '@sahoda/shared'

// `vi.hoisted` because vi.mock is lifted above every const in the file, and a
// factory closing over a plain `const` throws "cannot access before
// initialization" at import time.
const { approve, create } = vi.hoisted(() => ({
  approve: vi.fn(async () => ({ ok: true, approvedCredits: 6 })),
  create: vi.fn(async () => ({ ok: true, created: 2, spent: 6 })),
}))
vi.mock('@/app/actions/loop-controls', () => ({ approveCycleCost: approve }))
vi.mock('@/app/actions/loop-create', () => ({ runCreateStage: create }))

import { CostPreview } from './cost-preview'
import type { LoopBriefView } from '@/lib/loop/read'

const brief = (id: string, priority: number, title: string): LoopBriefView => ({
  id,
  priority,
  title,
  body: 'a short brief',
  channels: toChannelSet(['instagram']),
  suggestedSlot: '2026-08-25T10:00:00.000Z',
  rationale: null,
  estimatedCredits: creditCost('post_variants'),
  included: true,
  postId: null,
  stageOutcome: 'planned',
})

const THREE = [
  brief('a', 1, 'First idea'),
  brief('b', 2, 'Second idea'),
  brief('c', 3, 'Third idea'),
]

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
 */
describe('the cost preview', () => {
  it('shows the total BEFORE anything is spent, and says so', () => {
    render(<CostPreview cycleId="c1" briefs={THREE} budgetCredits={150} spentCredits={20} />)
    expect(screen.getByText(/Nothing has been spent on these yet/i)).toBeTruthy()
    // 3 × post_variants creation, plus the orchestration already charged.
    const creation = 3 * creditCost('post_variants')
    expect(screen.getByText(`${creation} credits`)).toBeTruthy()
    expect(screen.getByText(`${creation + creditCost('loop_cycle')} credits`)).toBeTruthy()
  })

  it('puts the price in the button label, never only in a total', () => {
    render(<CostPreview cycleId="c1" briefs={THREE} budgetCredits={150} spentCredits={20} />)
    const button = screen.getByRole('button', { name: /Write this week/i })
    // UI_RULES_v3: the price is in the label, so a person reads what they are
    // about to spend before committing to spending it.
    expect(button.textContent).toMatch(new RegExp(String(3 * creditCost('post_variants'))))
    expect(button.textContent).toMatch(/credits?/)
  })

  it('follows the total DOWN as briefs are unchecked, button included', () => {
    render(<CostPreview cycleId="c1" briefs={THREE} budgetCredits={150} spentCredits={20} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    fireEvent.click(boxes[0]!)
    const two = 2 * creditCost('post_variants')
    expect(screen.getByRole('button', { name: /Write this week/i }).textContent).toMatch(
      new RegExp(String(two)),
    )
    // A total a person cannot decompose is a total they cannot trim, so the
    // per-line prices are present too.
    expect(screen.getAllByText(`${creditCost('post_variants')} credits`).length).toBe(3)
  })

  it('sends the total IT SHOWED as the expected credits', async () => {
    render(<CostPreview cycleId="c1" briefs={THREE} budgetCredits={150} spentCredits={20} />)
    fireEvent.click(screen.getAllByRole('checkbox')[2]!)
    fireEvent.click(screen.getByRole('button', { name: /Write this week/i }))
    await vi.waitFor(() => expect(approve).toHaveBeenCalled())
    const [cycleId, excluded, expected] = approve.mock.calls[0] as unknown as [
      string,
      string[],
      number,
    ]
    expect(cycleId).toBe('c1')
    expect(excluded).toEqual(['c'])
    // This is what makes the preview a contract: the server recomputes from the
    // rows and REFUSES if it disagrees with the figure that was on screen.
    expect(expected).toBe(2 * creditCost('post_variants'))
  })

  it('warns when the plan exceeds the weekly budget, and still lets it through', () => {
    // Budget measured against what is LEFT after the orchestration charge.
    const tight = creditCost('loop_cycle') + creditCost('post_variants')
    render(<CostPreview cycleId="c1" briefs={THREE} budgetCredits={tight} spentCredits={20} />)
    expect(screen.getByRole('status').textContent).toMatch(/over your weekly budget/i)
    // Not blocked — the budget is the customer's to set, and a hard stop would
    // make a slider into a gate nobody agreed to.
    expect(
      (screen.getByRole('button', { name: /Write this week/i }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('refuses to approve an empty plan, and says what to do instead', () => {
    render(<CostPreview cycleId="c1" briefs={THREE} budgetCredits={150} spentCredits={20} />)
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    expect(
      (screen.getByRole('button', { name: /Write this week/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText(/Keep at least one post/i)).toBeTruthy()
  })

  it('prints NO figure that is not a credit price or a count of rows', () => {
    const { container } = render(
      <CostPreview cycleId="c1" briefs={THREE} budgetCredits={150} spentCredits={20} />,
    )
    const numbers = (container.textContent ?? '').match(/\d+/g) ?? []
    const allowed = new Set(
      [
        3,
        creditCost('post_variants'),
        creditCost('loop_cycle'),
        3 * creditCost('post_variants'),
        3 * creditCost('post_variants') + creditCost('loop_cycle'),
        150,
      ].map(String),
    )
    // Every number on this panel is a price from pricing.config.json, a sum of
    // them, or how many posts there are. No predicted reach, no expected
    // engagement, no score — each would be a claim about the reader's business
    // that no query behind this panel has earned.
    expect(numbers.filter((n) => !allowed.has(n))).toEqual([])
  })
})
