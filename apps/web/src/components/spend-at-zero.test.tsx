import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * EVERY SPEND CONTROL, AT A ZERO BALANCE.
 *
 * ── WHY THIS IS A TEST AND NOT A QA WALK ─────────────────────────────────────
 * The state is unreachable by hand. Emptying the wallet needs either real AI
 * generation — which spends real money to reach a screen — or a ledger write,
 * which is forbidden. So five spend controls had shipped for months with the
 * one outcome nobody has ever seen: the customer runs out mid-task. Remix is the
 * sixth, and it joined this file on the day it was built rather than months
 * later — which is the only reason it did not ship with the same gap.
 *
 * A zero balance is not an error. It is the most ordinary thing that happens to
 * a paying account, and it has exactly one correct shape, which three of the
 * original five already had and this file now holds all six to:
 *
 *   1. state the shortfall with BOTH numbers, so it is a fact and not a scold
 *   2. say plainly that nothing was charged
 *   3. offer the route out — a link to /wallet
 *
 * A control that fails and stops is a dead end, and it is worse here than
 * anywhere else in the app: the customer has already written the prompt, picked
 * the channels, described the image. Telling them the number and nothing else
 * ends the session.
 *
 * ── WHY THE BUTTON IS NOT DISABLED AT ZERO ───────────────────────────────────
 * Deliberate, and asserted below. The balance is a server fact; a client that
 * pre-disabled on a cached number would refuse a customer who topped up in
 * another tab. Attempt-then-explain is the honest order, and the action's own
 * `withCredits` gate is the enforcement — never this.
 */

const INSUFFICIENT = { required: 6, available: 0 }

const state = vi.hoisted(() => ({
  image: {} as Record<string, unknown>,
  variants: {} as Record<string, unknown>,
  rewrite: {} as Record<string, unknown>,
  planWeek: {} as Record<string, unknown>,
  site: {} as Record<string, unknown>,
  remix: {} as Record<string, unknown>,
}))

vi.mock('@/app/actions/studio', () => ({
  queueGeneration: () => Promise.resolve(state.image),
}))
vi.mock('@/app/actions/posts-ai', () => ({
  generateVariants: () => Promise.resolve(state.variants),
  rewriteCaption: () => Promise.resolve(state.rewrite),
}))
vi.mock('@/app/actions/plan-week', () => ({
  planMyWeek: () => Promise.resolve(state.planWeek),
}))
vi.mock('@/app/actions/site-generate', () => ({
  generateSite: () => Promise.resolve(state.site),
}))
// Remix approves and then runs. The APPROVAL succeeds — it spends nothing and
// there is nothing for an empty wallet to refuse about it — and the run is what
// meets the empty wallet. Mocking the approval as a failure instead would have
// tested a different sentence entirely.
vi.mock('@/app/actions/remix', () => ({
  approveRemixBatch: () => Promise.resolve({ ok: true, approvedCredits: 6 }),
  setDerivativeIncluded: () => Promise.resolve({ ok: true }),
}))
vi.mock('@/app/actions/remix-run', () => ({
  runRemixBatch: () => Promise.resolve(state.remix),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { GenerateForm } from './studio/generate-form'
import { generatableFormats } from '@/lib/studio/formats'
import { GeneratePanel } from './posts/generate-panel'
import { InlineRewrite } from './posts/inline-rewrite'
import { PlanWeekPanel } from './planner/plan-week-panel'
import { GenerateSitePanel } from './sites/generate-site-panel'
import { BatchPreview } from './remix/batch-preview'
import { previewBatch } from '@/lib/remix/cost'
import type { BatchView, DerivativeView } from '@/lib/remix/read'
import { toChannelSet } from '@sahoda/shared'

/** One planned draft, enough to press the button on. */
const REMIX_DERIVATIVES: DerivativeView[] = [
  {
    id: 'd1',
    kind: 'short',
    channel: 'x',
    format: 'text',
    included: true,
    status: 'pending',
    postId: null,
    failure: null,
  },
]

const REMIX_BATCH: BatchView = {
  id: 'b1',
  status: 'planned',
  sourcePostId: 'p1',
  sourceTitle: 'The long one',
  sourceCredit: 'Remixed from “The long one” in this workspace.',
  approvedCredits: null,
  derivatives: REMIX_DERIVATIVES,
  cost: previewBatch(REMIX_DERIVATIVES),
}

const REFUSAL = { ok: false, insufficient: true, message: 'Not enough credits.', ...INSUFFICIENT }

beforeEach(() => {
  state.image = REFUSAL
  state.variants = REFUSAL
  state.rewrite = REFUSAL
  state.planWeek = REFUSAL
  state.site = REFUSAL
  state.remix = REFUSAL
})

/**
 * Each entry renders one control and performs whatever the customer would do to
 * reach the spend. The `press` step is real interaction, not a prop — a refusal
 * that only renders from a hand-set state proves nothing about the path there.
 */
const CONTROLS: ReadonlyArray<{
  name: string
  press: () => Promise<void>
}> = [
  {
    // RETARGETED, NOT DELETED. This drove the composer's own image generator
    // until the Studio replaced it as the only place media enters the product.
    // What is guarded is the refusal at a zero balance, and the refusal moved
    // with the control.
    name: 'Make a picture',
    press: async () => {
      const user = userEvent.setup()
      render(<GenerateForm formats={generatableFormats()} cost={6} />)
      await user.type(screen.getByPlaceholderText(/plate of fresh samosas/i), 'a warm shopfront')
      await user.click(screen.getByRole('button', { name: /make this picture/i }))
    },
  },
  {
    name: 'Generate variants',
    press: async () => {
      const user = userEvent.setup()
      render(
        <GeneratePanel
          channels={toChannelSet(['instagram'])}
          flush={async () => 'p1'}
          onGenerated={() => {}}
        />,
      )
      await user.click(screen.getByRole('button', { name: /adapt for/i }))
    },
  },
  {
    name: 'Rewrite a caption',
    press: async () => {
      const user = userEvent.setup()
      render(
        <InlineRewrite
          body="A short caption about the bakery."
          selection={{ start: 0, end: 15 }}
          onReplace={() => true}
        />,
      )
      await user.click(screen.getByRole('button', { name: /rewrite/i }))
    },
  },
  {
    name: 'Plan my week',
    press: async () => {
      const user = userEvent.setup()
      render(<PlanWeekPanel />)
      await user.click(screen.getByRole('button', { name: /plan my week/i }))
    },
  },
  {
    name: 'Generate site',
    press: async () => {
      const user = userEvent.setup()
      render(<GenerateSitePanel limitNotice={null} />)
      await user.type(screen.getAllByRole('textbox')[0]!, 'Corner Bakery')
      await user.click(screen.getByRole('button', { name: /generate site/i }))
    },
  },
  {
    // THE SIXTH. Remix reaches an empty wallet later than the other five — a
    // person has already picked a source, picked what to make, and trimmed the
    // batch — which makes the dead end here the most expensive of the six.
    name: 'Make these drafts',
    press: async () => {
      const user = userEvent.setup()
      render(<BatchPreview batch={REMIX_BATCH} />)
      await user.click(screen.getByRole('button', { name: /make these drafts/i }))
    },
  },
]

describe.each(CONTROLS)('$name, with an empty wallet', ({ press }) => {
  test('states the shortfall, confirms nothing was charged, and offers the way out', async () => {
    await press()

    const alert = await screen.findByRole('alert')
    const text = alert.textContent ?? ''

    // 1. BOTH numbers. "Not enough credits" alone is a scold; the pair is a fact
    //    the customer can act on — they know exactly how far short they are.
    expect(text).toMatch(/\b6\b/)
    expect(text).toMatch(/\b0\b/)
    // 2. The charge claim. Right after describing an image or picking channels,
    //    "did that cost me anything?" is the first question.
    expect(text).toMatch(/not charged|nothing was charged|weren.t charged/i)
    // 3. THE ROUTE OUT. Without this the control is a dead end — which is what
    //    "Make an image" was: it stated the shortfall and stopped.
    const topUp = screen.getByRole('link', { name: /top up your wallet/i })
    expect(topUp).toHaveAttribute('href', '/wallet')
  })
})

describe('the spend controls do not pre-disable on a balance they did not read', () => {
  test('Make a picture stays pressable so a top-up in another tab still works', async () => {
    render(<GenerateForm formats={generatableFormats()} cost={6} />)

    // Only the prompt gates it. A client-side balance check here would refuse a
    // customer who has just paid, and the server gate is the real enforcement.
    const button = screen.getByRole('button', { name: /make this picture/i })
    expect(button).toBeDisabled() // no prompt yet
    await userEvent.type(screen.getByPlaceholderText(/plate of fresh samosas/i), 'a shopfront')
    expect(button).toBeEnabled()
  })
})
