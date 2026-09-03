import type { ApplyLedgerInput } from '@sahoda/shared'
import type { LatestHold, LedgerApplyResult, LedgerBalance, LedgerPort } from '@sahoda/billing'

/**
 * AN IN-MEMORY LEDGER FOR RADAR'S TESTS. Not used in production.
 *
 * It mirrors the three properties of `app.apply_ledger_entry` that the weekly
 * charge depends on, and nothing else:
 *
 *   1. AN IDEMPOTENCY KEY REPLAYS. The same key returns the ORIGINAL row with
 *      `replayed: true` and moves no money. This is what makes a re-run of the
 *      same week charge nobody twice, and a fake that simply appended a row
 *      would let a double charge pass every test.
 *   2. A HOLD IS REFUSED WHEN THE SPENDABLE BALANCE IS SHORT, with the same
 *      `CREDIT_INSUFFICIENT` marker `withCredits` looks for.
 *   3. A HOLD SETTLES ONCE. A second DEBIT or RELEASE against the same hold
 *      raises `HOLD_ALREADY_SETTLED`, as the UNIQUE `settles_entry_id` does.
 */
export interface LedgerRow {
  id: string
  workspaceId: string
  entryType: ApplyLedgerInput['entryType']
  amount: number
  idempotencyKey: string
  actionType: string | null
  objectRef: string | null
  settlesEntryId: string | null
}

export class FakeLedger implements LedgerPort {
  readonly rows: LedgerRow[] = []
  private readonly total = new Map<string, number>()
  private readonly held = new Map<string, number>()
  private readonly holdAmounts = new Map<string, number>()
  private readonly settledBy = new Map<string, 'debit' | 'release'>()
  private seq = 0

  constructor(balances: Record<string, number>) {
    for (const [workspaceId, total] of Object.entries(balances)) this.total.set(workspaceId, total)
  }

  /** The rows of one type, replays excluded — what the customer would see charged. */
  entries(entryType: ApplyLedgerInput['entryType'], workspaceId?: string): LedgerRow[] {
    return this.rows.filter(
      (r) =>
        r.entryType === entryType && (workspaceId === undefined || r.workspaceId === workspaceId),
    )
  }

  async apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
    const existing = this.rows.find((r) => r.idempotencyKey === input.idempotencyKey)
    if (existing) {
      return {
        entry: {
          id: existing.id,
          balanceAfter: this.spendable(existing.workspaceId),
          amount: existing.amount,
        },
        replayed: true,
      }
    }

    const ws = input.workspaceId
    const settles = input.settlesEntryId ?? null
    if (input.entryType === 'HOLD') {
      if (this.spendable(ws) < input.amount) throw new Error('ledger: CREDIT_INSUFFICIENT')
      this.held.set(ws, (this.held.get(ws) ?? 0) + input.amount)
    } else if (input.entryType === 'DEBIT' || input.entryType === 'RELEASE') {
      if (!settles || this.settledBy.has(settles)) throw new Error('ledger: HOLD_ALREADY_SETTLED')
      const heldAmount = this.holdAmounts.get(settles) ?? 0
      this.held.set(ws, (this.held.get(ws) ?? 0) - heldAmount)
      if (input.entryType === 'DEBIT') this.total.set(ws, (this.total.get(ws) ?? 0) - input.amount)
      this.settledBy.set(settles, input.entryType === 'DEBIT' ? 'debit' : 'release')
    } else {
      throw new Error(`FakeLedger: unexpected entry type ${input.entryType}`)
    }

    const row: LedgerRow = {
      id: `entry-${++this.seq}`,
      workspaceId: ws,
      entryType: input.entryType,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      actionType: input.actionType ?? null,
      objectRef: input.objectRef ?? null,
      settlesEntryId: settles,
    }
    if (input.entryType === 'HOLD') this.holdAmounts.set(row.id, input.amount)
    this.rows.push(row)
    return {
      entry: { id: row.id, balanceAfter: this.spendable(ws), amount: row.amount },
      replayed: false,
    }
  }

  async latestHold(ref: {
    workspaceId: string
    action: string
    objectRef: string
  }): Promise<LatestHold | null> {
    const holds = this.rows.filter(
      (r) =>
        r.entryType === 'HOLD' &&
        r.workspaceId === ref.workspaceId &&
        r.actionType === ref.action &&
        r.objectRef === ref.objectRef,
    )
    const last = holds[holds.length - 1]
    if (!last) return null
    const attempt = Number(last.idempotencyKey.split(':').pop())
    return { attempt, settledBy: this.settledBy.get(last.id) ?? null }
  }

  async balance(workspaceId: string): Promise<LedgerBalance> {
    return { total: this.total.get(workspaceId) ?? 0, held: this.held.get(workspaceId) ?? 0 }
  }

  private spendable(workspaceId: string): number {
    return (this.total.get(workspaceId) ?? 0) - (this.held.get(workspaceId) ?? 0)
  }
}
