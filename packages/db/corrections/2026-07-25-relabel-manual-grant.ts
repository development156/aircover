import { pathToFileURL } from 'node:url'
import {
  ApplyLedgerInputSchema,
  LedgerEntrySchema,
  type ApplyLedgerInput,
  type LedgerEntry,
} from '@sahoda/shared'
import type { PoolClient } from 'pg'
import { databaseUrl } from '../seeds/demo/context'
import { openPool } from '../seeds/demo/pgpool'

/**
 * One-off ledger correction · 2026-07-25
 *
 * `credit_ledger` seq 5374 is a GRANT of 100 credits written by hand during the 2026-07-24
 * live paid-journey verification, so that the site_generate step had the credits to run.
 * It is not a plan grant and no plan grant backs it — but `apps/web` maps every GRANT to
 * the fixed copy "Plan credits · Included with your plan" (lib/wallet/entry-copy.ts), so
 * that is what a real user sees in their wallet history for it.
 *
 * The row cannot be edited or deleted. `credit_ledger` carries a `block_mutations` trigger
 * on update AND delete (20260718000006_billing_ledger.sql), and `app.apply_ledger_entry` —
 * the only write path — appends and nothing else. That immutability is the property that
 * makes the ledger worth trusting, so the fix goes forward, not back.
 *
 * The remedy is the standard one for an append-only ledger: a compensating pair.
 *
 *   1. ADJUST +100 — the honest record of what actually happened.
 *   2. ADJUST -100 — reverses the mislabelled GRANT it replaces.
 *
 * Net effect on the wallet is exactly zero, which is correct: the 100 credits were real,
 * they were spent on a real site_generate (seq 5375/5376), and clawing them back now would
 * drive a live workspace to -74. What changes is the record: ADJUST renders as "Manual
 * adjustment · Adjusted by Sahoda support", which is true, where GRANT rendered a claim
 * about a plan that does not exist.
 *
 * The +100 is applied FIRST on purpose. The other order is transiently negative and would
 * stamp `balance_after = -74` into an immutable row, asserting a state this workspace was
 * never really in.
 *
 * Idempotent: both keys are fixed, so a second run replays through
 * `app.apply_ledger_entry`'s idempotency branch and writes nothing.
 *
 *   pnpm --filter @sahoda/db exec tsx corrections/2026-07-25-relabel-manual-grant.ts
 */

/** The mislabelled entry, pinned by every field that identifies it. */
const TARGET = {
  workspaceId: 'c12b271a-a9be-44a4-b713-3ff8faa70066',
  seq: 5374,
  idempotencyKey: 'manual-verify-topup:c12b271a:20260724-1',
  entryType: 'GRANT',
  amount: 100,
  actor: 'claude-verification',
} as const

const CORRECTION_ACTOR = 'claude-ledger-correction'
const KEY_PREFIX = 'ledger-correction:2026-07-25:relabel-seq-5374'

const APPLY_ENTRY = `select app.apply_ledger_entry(
  p_workspace_id => $1, p_entry_type => $2, p_amount => $3, p_idempotency_key => $4,
  p_action_type => $5, p_object_ref => $6, p_model_tier => null, p_cogs_usd_est => null,
  p_settles_entry_id => null, p_hold_ttl => null, p_actor => $7, p_meta => $8::jsonb
) as result`

interface ApplyResult {
  readonly entry: LedgerEntry
  readonly replayed: boolean
}

async function apply(
  client: PoolClient,
  call: Omit<ApplyLedgerInput, 'workspaceId'>,
): Promise<ApplyResult> {
  const input = ApplyLedgerInputSchema.parse({ ...call, workspaceId: TARGET.workspaceId })
  const { rows } = await client.query<{ result: { entry: unknown; replayed: boolean } }>(
    APPLY_ENTRY,
    [
      input.workspaceId,
      input.entryType,
      input.amount,
      input.idempotencyKey,
      input.actionType ?? null,
      input.objectRef ?? null,
      input.actor ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  )
  const result = rows[0]?.result
  if (!result) throw new Error(`apply_ledger_entry returned no row for ${input.idempotencyKey}`)
  return { entry: LedgerEntrySchema.parse(result.entry), replayed: result.replayed }
}

/**
 * Refuse to run against anything but the exact row this correction was written for.
 *
 * Same discipline as the demo teardown's marker check: this file appends to a real user's
 * wallet, so it must be incapable of doing that to a row it has not verified. Every
 * identifying field is compared, not just the id — a key that has been reused, an amount
 * that has changed, or a different workspace all stop the run.
 */
async function assertTargetUnchanged(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{
    seq: string
    workspace_id: string
    entry_type: string
    amount: number
    actor: string | null
  }>(
    `select seq, workspace_id, entry_type, amount, actor
       from credit_ledger where idempotency_key = $1`,
    [TARGET.idempotencyKey],
  )

  const row = rows[0]
  if (!row) {
    throw new Error(
      `no credit_ledger row with idempotency_key ${TARGET.idempotencyKey}. ` +
        'Nothing was written. This correction targets one specific entry and that entry is ' +
        'not in this database — check you are pointed at the right project.',
    )
  }

  const actual = {
    seq: Number(row.seq),
    workspaceId: row.workspace_id,
    entryType: row.entry_type,
    amount: row.amount,
    actor: row.actor,
  }
  const expected = {
    seq: TARGET.seq,
    workspaceId: TARGET.workspaceId,
    entryType: TARGET.entryType,
    amount: TARGET.amount,
    actor: TARGET.actor,
  }

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `credit_ledger seq ${actual.seq} is not the entry this correction was written for.\n` +
        `    expected ${JSON.stringify(expected)}\n` +
        `    actual   ${JSON.stringify(actual)}\n` +
        '  Nothing was written.',
    )
  }
}

async function balanceOf(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ total: number }>(
    'select balance_total::int as total from credit_balances where workspace_id = $1',
    [TARGET.workspaceId],
  )
  const total = rows[0]?.total
  if (total === undefined) throw new Error(`no credit_balances row for ${TARGET.workspaceId}`)
  return total
}

export interface CorrectionSummary {
  readonly balanceBefore: number
  readonly balanceAfter: number
  readonly entries: readonly ApplyResult[]
}

export async function runCorrection(): Promise<CorrectionSummary> {
  const pool = openPool(databaseUrl())
  const client = await pool.connect()
  try {
    await client.query('begin')
    try {
      await assertTargetUnchanged(client)
      const balanceBefore = await balanceOf(client)

      // 1 · the honest record of the credits that were actually added.
      const reissue = await apply(client, {
        entryType: 'ADJUST',
        amount: TARGET.amount,
        idempotencyKey: `${KEY_PREFIX}:reissue`,
        actionType: 'manual_adjustment',
        actor: CORRECTION_ACTOR,
        meta: {
          reason:
            'Manual top-up added by an engineer on 2026-07-24 to complete the site_generate ' +
            'step of the live paid-journey verification. Not a plan grant.',
          replaces_seq: TARGET.seq,
          correction: '2026-07-25-relabel-manual-grant',
        },
      })

      // 2 · reverse the entry that claimed to be a plan grant.
      const reversal = await apply(client, {
        entryType: 'ADJUST',
        amount: -TARGET.amount,
        idempotencyKey: `${KEY_PREFIX}:reversal`,
        actionType: 'manual_adjustment',
        actor: CORRECTION_ACTOR,
        meta: {
          reason:
            `Reverses seq ${TARGET.seq}, a manual GRANT that the wallet rendered as ` +
            '"Plan credits · Included with your plan". No plan grant backed it. Replaced by ' +
            'the ADJUST immediately above; net effect on the balance is zero.',
          reverses_seq: TARGET.seq,
          correction: '2026-07-25-relabel-manual-grant',
        },
      })

      const balanceAfter = await balanceOf(client)
      if (balanceAfter !== balanceBefore) {
        throw new Error(
          `the correction must be balance-neutral, but the total moved ` +
            `${balanceBefore} → ${balanceAfter}. Rolled back.`,
        )
      }

      await client.query('commit')
      return { balanceBefore, balanceAfter, entries: [reissue, reversal] }
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    }
  } finally {
    client.release()
    await pool.end()
  }
}

async function main(): Promise<void> {
  try {
    const summary = await runCorrection()
    const lines = summary.entries.map(
      (e) =>
        `  seq ${String(e.entry.seq).padStart(5)}  ${e.entry.entry_type} ` +
        `${e.entry.amount > 0 ? '+' : ''}${e.entry.amount}` +
        `  balance_after ${e.entry.balance_after}${e.replayed ? '  (replayed, nothing written)' : ''}`,
    )
    process.stdout.write(
      [
        '',
        `  corrected credit_ledger seq ${TARGET.seq} in ${TARGET.workspaceId}`,
        '',
        ...lines,
        '',
        `  balance    ${summary.balanceBefore} → ${summary.balanceAfter} (unchanged, by design)`,
        '',
      ].join('\n'),
    )
  } catch (error) {
    process.stderr.write(
      `\n  correction failed: ${error instanceof Error ? error.message : String(error)}\n` +
        '  Nothing was written: the whole correction runs in one transaction.\n\n',
    )
    process.exitCode = 1
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main()
}
