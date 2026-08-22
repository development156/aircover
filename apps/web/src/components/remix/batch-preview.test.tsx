import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { creditCost } from '@sahoda/shared'

/**
 * THE REPLACEMENT FOR /remix's PLACE IN roadmap-honesty.spec.ts.
 *
 * ── WHY THAT SUITE NO LONGER COVERS THIS SCREEN ──────────────────────────────
 * `roadmap-honesty.spec.ts` walks each roadmap section, requires the words
 * "coming soon", and requires every number on it to be a credit price or an
 * ordinal. Both claims were true of the /remix DRAWING and neither is true of
 * the screen that replaced it: it prices a real batch, counts real drafts and
 * charges real credits. Widening that suite's allow-list to admit them would
 * have turned a guard about unbuilt screens into a guard about nothing — the
 * exact repair the suite's own header names as the mistake to avoid.
 *
 * So the property moves here, where it can be stronger: not "these digits are
 * permitted" but "every digit came from a price, a sum of prices, or a count of
 * rows", asserted against the rendered panel with the counts under this file's
 * control.
 *
 * ── AND IT HAS BEEN WATCHED FAIL ─────────────────────────────────────────────
 * MEASURED: adding `<span>Reaches 4,200 people</span>` to `batch-preview.tsx`
 * fails `prints NO figure that is not a price or a count` and fails nothing else
 * in the repository. A guard nobody has watched fail is not a guard.
 *
 * WHAT THAT RUN ALSO SHOWED, and it is worth writing down rather than
 * discovering later: the failure named `["200"]` and NOT `["4", "200"]`. The
 * "4" survived because `post_variants` + `caption_rewrite` is also 4, so a
 * fabricated figure that happens to equal a sum of prices is invisible to this
 * check. That is the honest bound of a digit scan against a small allow-list,
 * and the reason the counts in the fixture are kept small and nameable: it makes
 * the collisions few and visible instead of many and silent.
 */

const { approve, run, trim } = vi.hoisted(() => ({
  approve: vi.fn(async () => ({ ok: true, approvedCredits: 0 })),
  run: vi.fn(async () => ({ ok: true, drafts: 2, spent: 0, failedKinds: 0 })),
  trim: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/actions/remix', () => ({
  approveRemixBatch: approve,
  setDerivativeIncluded: trim,
}))
vi.mock('@/app/actions/remix-run', () => ({ runRemixBatch: run }))

import { BatchPreview } from './batch-preview'
import type { BatchView, DerivativeView } from '@/lib/remix/read'
import { previewBatch } from '@/lib/remix/cost'

function derivative(
  id: string,
  kind: DerivativeView['kind'],
  channel: DerivativeView['channel'],
  format = 'text',
): DerivativeView {
  return {
    id,
    kind,
    channel,
    format,
    included: true,
    status: 'pending',
    postId: null,
    failure: null,
  }
}

/** Two kinds, three drafts. Small enough that every figure is nameable. */
const DERIVATIVES: DerivativeView[] = [
  derivative('d1', 'adaptation', 'x'),
  derivative('d2', 'adaptation', 'linkedin'),
  derivative('d3', 'short', 'x'),
]

function view(overrides: Partial<BatchView> = {}): BatchView {
  const derivatives = overrides.derivatives ?? DERIVATIVES
  return {
    id: 'b1',
    status: 'planned',
    sourcePostId: 'p1',
    sourceTitle: 'The long one',
    sourceCredit: 'Remixed from “The long one” in this workspace.',
    approvedCredits: null,
    derivatives,
    cost: previewBatch(derivatives),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

const ADAPT = creditCost('post_variants')
const SHORT = creditCost('caption_rewrite')
const PACK = creditCost('remix_pack')

describe('the batch preview', () => {
  test('shows the total BEFORE anything is spent, and says so', () => {
    render(<BatchPreview batch={view()} />)
    expect(screen.getByText(/Nothing has been spent on these yet/i)).toBeTruthy()
    expect(screen.getByText(`${ADAPT + SHORT + PACK} cr`)).toBeTruthy()
  })

  test('puts the price in the button label, never only in a total', () => {
    render(<BatchPreview batch={view()} />)
    const button = screen.getByRole('button', { name: /Make these drafts/i })
    expect(button.textContent).toMatch(new RegExp(String(ADAPT + SHORT + PACK)))
    expect(button.textContent).toMatch(/credits?/)
  })

  test('unticking a CHANNEL takes a draft and leaves the total alone', () => {
    render(<BatchPreview batch={view()} />)
    const before = screen.getByRole('button', { name: /Make these drafts/i }).textContent
    // d2 is the second channel of `adaptation`, and a kind is one model call.
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    expect(screen.getByRole('button', { name: /Make these drafts/i }).textContent).toBe(before)
    // And the screen SAYS so, rather than leaving a person to infer it from a
    // number that did not move.
    expect(screen.getByText(/takes away a draft and not a credit/i)).toBeTruthy()
  })

  test('unticking a whole KIND is what moves the total', () => {
    render(<BatchPreview batch={view()} />)
    fireEvent.click(screen.getAllByRole('checkbox')[2]!) // the only `short`
    expect(screen.getByRole('button', { name: /Make these drafts/i }).textContent).toMatch(
      new RegExp(String(ADAPT + PACK)),
    )
  })

  test('refuses an empty batch, and says what to do instead', () => {
    render(<BatchPreview batch={view()} />)
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    expect(
      (screen.getByRole('button', { name: /Make these drafts/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText(/Keep at least one draft/i)).toBeTruthy()
  })

  test('a draft that needs a photo says so before the spend, not after', () => {
    const batch = view({
      derivatives: [derivative('d1', 'short', 'instagram', 'image')],
    })
    render(<BatchPreview batch={batch} />)
    expect(screen.getByText(/needs a photo/i)).toBeTruthy()
  })

  test('carries the attribution the batch stored', () => {
    render(<BatchPreview batch={view()} />)
    expect(screen.getByText(/Remixed from/)).toBeTruthy()
  })

  test('sends the total IT SHOWED as the figure being agreed to', async () => {
    // The contract that makes the button's number mean something. The server
    // re-prices from the rows and REFUSES if it disagrees, so a trim still in
    // flight — or one whose write failed — is caught instead of silently
    // charging a number nobody saw. `lib/loop/cost.ts`'s panel makes the same
    // contract; without it, both halves of the runner's price check are
    // server-side and the screen/ledger disagreement is invisible.
    render(<BatchPreview batch={view()} />)
    fireEvent.click(screen.getAllByRole('checkbox')[2]!) // trim the only `short`

    // The trim is written back inside a transition, which disables the button
    // while it is in flight. Waiting for it is not test hygiene — it is the
    // scenario: `makeThem` does NOT await that write, so a person who presses
    // fast enough is exactly the case this contract exists to catch.
    const button = () => screen.getByRole('button', { name: /Make these drafts/i })
    await vi.waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(false))
    const label = button().textContent ?? ''
    fireEvent.click(button())

    await vi.waitFor(() => expect(approve).toHaveBeenCalled())
    const [batchId, expected] = approve.mock.calls[0] as unknown as [string, number]
    expect(batchId).toBe('b1')
    expect(expected).toBe(ADAPT + PACK)
    // And it is the number that was on the button, not a second computation.
    expect(label).toMatch(new RegExp(`\\b${expected}\\b`))
  })

  test('prints NO figure that is not a price or a count', () => {
    const { container } = render(<BatchPreview batch={view()} />)
    const numbers = (container.textContent ?? '').match(/\d+/g) ?? []
    const allowed = new Set(
      [
        DERIVATIVES.length, // a count of rows
        ADAPT,
        SHORT,
        PACK,
        ADAPT + SHORT,
        ADAPT + SHORT + PACK,
      ].map(String),
    )
    expect(numbers.filter((n) => !allowed.has(n))).toEqual([])
  })
})

describe('the refusal at a zero balance, RENDERED', () => {
  async function refuseWith(required: number, available: number) {
    run.mockResolvedValueOnce({
      ok: false,
      insufficient: true,
      required,
      available,
    } as never)
    render(<BatchPreview batch={view()} />)
    fireEvent.click(screen.getByRole('button', { name: /Make these drafts/i }))
    return screen.findByRole('alert')
  }

  test('states BOTH numbers, claims nothing was charged, and offers the way out', async () => {
    const alert = await refuseWith(21, 0)
    const text = alert.textContent ?? ''
    expect(text).toMatch(/\b21\b/)
    expect(text).toMatch(/\b0\b/)
    expect(text).toMatch(/nothing was charged/i)
    expect(screen.getByRole('link', { name: /top up your wallet/i })).toHaveAttribute(
      'href',
      '/wallet',
    )
  })

  test('says "1 credit", not "1 credits"', async () => {
    // The branch a funded workspace never reaches, which is exactly why it has
    // shipped wrong before: the only way to see it is to render it. Read from
    // the DOM, never from a line of source.
    const alert = await refuseWith(1, 0)
    const text = alert.textContent ?? ''
    expect(text).toMatch(/\b1 credit\b/)
    expect(text).not.toMatch(/\b1 credits\b/)
  })

  test('the plural stays plural for every other number', async () => {
    const alert = await refuseWith(2, 0)
    expect(alert.textContent ?? '').toMatch(/\b2 credits\b/)
  })
})

describe('a batch whose run was cut off', () => {
  test('is reported as stopped, never as made, and does not wedge the screen', () => {
    // Nothing resumes a batch, so `running` is terminal on read. The screen
    // shows what became of it and the page renders the planner again — the
    // alternative is a screen whose only button refuses and whose only message
    // claims work that may have half happened.
    render(<BatchPreview batch={view({ status: 'running' })} />)
    expect(screen.getByText(/stopped part-way/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Make these drafts/i })).toBeNull()
  })
})

describe('after the run', () => {
  test('every draft is a draft, and the screen says who approves it', async () => {
    render(<BatchPreview batch={view()} />)
    fireEvent.click(screen.getByRole('button', { name: /Make these drafts/i }))
    await screen.findByText(/The drafts are written/i)
    expect(screen.getByText(/approve it yourself before it goes anywhere/i)).toBeTruthy()
    // Never a claim that anything was scheduled or published.
    const text = document.body.textContent ?? ''
    expect(/\bscheduled\b/i.test(text)).toBe(false)
    expect(/\bpublished\b/i.test(text)).toBe(false)
  })

  test('a kind that came back empty is reported and named as uncharged', async () => {
    run.mockResolvedValueOnce({ ok: true, drafts: 1, spent: 0, failedKinds: 1 } as never)
    render(<BatchPreview batch={view()} />)
    fireEvent.click(screen.getByRole('button', { name: /Make these drafts/i }))
    const status = await screen.findByRole('status')
    expect(status.textContent ?? '').toMatch(/not charged/i)
  })
})
