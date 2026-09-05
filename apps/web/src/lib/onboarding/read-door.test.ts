import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreditChargeContext,
  WithCreditsFn,
  WithCreditsOpts,
  WithCreditsResult,
} from '@sahoda/shared'

import { MAX_PDF_BYTES } from './door'

/**
 * THE PDF ARM RAN PAID WORK WITH NO HOLD. `brand_extract` on the standard tier,
 * then `mistral-ocr` when it came back empty, both on Sahoda's account with no
 * ledger row, no ceiling and a screen showing an estimate nobody was charged.
 * This file executes the arm against a fake ledger and pins the four claims:
 * one hold covers the whole read, a success debits, every failure releases,
 * and an oversize PDF costs neither a hold nor a copy of its bytes.
 */

const runTask = vi.fn()

vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask }),
  brandExtractTask: { def: { name: 'brand_extract' }, buildMessages: () => [] },
}))
vi.mock('@sahoda/research', () => ({
  openSite: vi.fn(),
  crawlSite: vi.fn(),
  quarantineCorpus: (pages: { text: string }[]) => pages.map((p) => p.text).join('\n'),
}))
// The real singleton would open a Postgres pool from env. Every test injects.
vi.mock('@sahoda/billing', () => ({
  createWithCredits: () => {
    throw new Error('the default ledger must never be built in a unit test')
  },
  createPgLedgerPort: () => ({}),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://x' }),
}))

const { readDoorStreaming } = await import('./read-door')

const ledger = { holds: [] as unknown[], debits: 0, releases: 0 }
let refuseHold: { required: number; available: number } | null = null

const fakeWithCredits: WithCreditsFn = async <T>(
  opts: WithCreditsOpts,
  fn: (ctx: CreditChargeContext) => Promise<T>,
): Promise<WithCreditsResult<T>> => {
  if (refuseHold) {
    return {
      ok: false,
      error: {
        code: 'CREDIT_INSUFFICIENT',
        message: 'Not enough credits',
        traceId: 't',
        details: refuseHold,
      },
    }
  }
  ledger.holds.push(opts)
  try {
    const data = await fn({ actionType: opts.action, creditsCharged: 50 })
    ledger.debits += 1
    return { ok: true, data: { data, balanceAfter: 50 } }
  } catch {
    ledger.releases += 1
    return {
      ok: false,
      error: { code: 'PROVIDER_ERROR', message: 'The action did not complete.', traceId: 't' },
    }
  }
}

const FIELD = { channel: 'brand', key: 'one_liner', value: 'We bake bread.' }

function pdf(size = 40) {
  const read = vi.fn(async () => new TextEncoder().encode('%PDF-1.4 hello world').buffer)
  return { name: 'deck.pdf', size, read }
}

function read(input: ReturnType<typeof pdf> | null) {
  return readDoorStreaming(
    { pdf: input, url: '', sentence: '', workspaceId: 'ws-1', userId: 'user-1' },
    () => undefined,
    { withCredits: () => fakeWithCredits },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  ledger.holds = []
  ledger.debits = 0
  ledger.releases = 0
  refuseHold = null
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  runTask.mockResolvedValue({
    ok: true,
    data: { fields: [FIELD], instruction_attempts: [], gaps: [] },
  })
})

describe('the PDF arm holds credits', () => {
  it('one hold under the brand_extract pricing key, debited when the read returns text', async () => {
    const result = await read(pdf())

    expect(result.ok).toBe(true)
    expect(ledger.holds).toHaveLength(1)
    expect(ledger.holds[0]).toMatchObject({ workspaceId: 'ws-1', action: 'brand_research' })
    expect(ledger.debits).toBe(1)
    expect(ledger.releases).toBe(0)
    if (result.ok) expect(result.creditsCharged).toBe(50)
    // The mesh call carries the charge for telemetry, as every paid path does.
    expect(runTask.mock.calls[0]![2]).toMatchObject({
      actionType: 'brand_research',
      creditsCharged: 50,
    })
  })

  it('the OCR escalation runs INSIDE the same hold: two model calls, one ledger hold', async () => {
    runTask
      .mockResolvedValueOnce({ ok: true, data: { fields: [], instruction_attempts: [], gaps: [] } })
      .mockResolvedValueOnce({
        ok: true,
        data: { fields: [FIELD], instruction_attempts: [], gaps: [] },
      })

    const result = await read(pdf())

    expect(result.ok).toBe(true)
    expect(runTask).toHaveBeenCalledTimes(2)
    expect(ledger.holds).toHaveLength(1)
    expect(ledger.debits).toBe(1)
  })

  it("a model failure releases the hold and keeps the door's own sentence", async () => {
    runTask.mockResolvedValue({
      ok: false,
      error: { code: 'PROVIDER_ERROR', message: 'all providers failed to respond' },
    })

    const result = await read(pdf())

    expect(result.ok).toBe(false)
    expect(ledger.holds).toHaveLength(1)
    expect(ledger.debits).toBe(0)
    expect(ledger.releases).toBe(1)
    if (!result.ok) {
      expect(result.creditsCharged).toBe(0)
      expect(result.message).toMatch(/could not turn it into a brand/i)
      expect(result.message).not.toMatch(/providers|mesh|token/i)
    }
  })

  it('not enough credits refuses before any model call, and names the free way in', async () => {
    refuseHold = { required: 50, available: 12 }

    const result = await read(pdf())

    expect(result.ok).toBe(false)
    expect(runTask).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.message).toMatch(/50 credits/)
      expect(result.message).toMatch(/has 12/)
      expect(result.message).toMatch(/website link/i)
    }
  })

  /**
   * The cap runs BEFORE the hold and BEFORE `read()`. door.ts used to claim
   * the bytes were never read into memory while the route had already copied
   * them; now the copy is a call this test can see was not made.
   */
  it('an oversize PDF costs neither a hold nor a copy of its bytes', async () => {
    const big = pdf(MAX_PDF_BYTES + 1)

    const result = await read(big)

    expect(result.ok).toBe(false)
    expect(big.read).not.toHaveBeenCalled()
    expect(ledger.holds).toHaveLength(0)
    expect(runTask).not.toHaveBeenCalled()
    // Derived from the constant rather than typed. This read `/over 6MB/` and had
    // to be edited by hand when the cap dropped to 4 MB to fit under the platform's
    // request ceiling — which means it was pinning a NUMBER, not the claim. The
    // claim is that the refusal names the cap actually enforced; that survives the
    // next change to the cap, and still fails if the sentence stops naming one.
    const capMB = Math.round(MAX_PDF_BYTES / 1024 / 1024)
    if (!result.ok) expect(result.message).toContain(`over ${capMB}MB`)
  })

  it('the URL and sentence arms take no hold at all', async () => {
    const result = await readDoorStreaming(
      {
        pdf: null,
        url: '',
        sentence: 'We bake sourdough bread in Pune.',
        workspaceId: 'ws-1',
        userId: 'user-1',
      },
      () => undefined,
      { withCredits: () => fakeWithCredits },
    )
    expect(result).toMatchObject({ ok: true, kind: 'sentence', creditsCharged: 0 })
    expect(ledger.holds).toHaveLength(0)
  })
})
