# Incident · 2026-07-24 — a manual top-up was recorded as a plan grant

**Status:** RESOLVED 2026-07-25 · **Impact:** one workspace's wallet history showed a false
label · **Credits gained or lost by the user: zero** · **Severity:** low impact, high principle.

This note lives on the trunk deliberately. The correction script that fixes it was written on
the `wt-db` branch, which is abandoned in the 2026-07-28 branch reconciliation; an archive tag
is not a discoverable audit trail. **A production ledger correction must be readable from
`main`.**

---

## What happened

During the live paid-journey verification on **2026-07-24**, the `site_generate` step needed
credits that the test workspace did not have. An engineer added **100 credits** by hand,
directly through `app.apply_ledger_entry` — the correct write path — as:

| field | value |
|---|---|
| workspace | `c12b271a-a9be-44a4-b713-3ff8faa70066` |
| seq | `5374` |
| entry_type | `GRANT` |
| amount | `+100` |
| action_type | `signup_grant` |
| idempotency_key | `manual-verify-topup:c12b271a:20260724-1` |
| actor | `claude-verification` |

The credits themselves were real and were genuinely spent on a real `site_generate`. **The
defect was the label, not the money.** `apps/web` maps every `GRANT` to one fixed string in
`lib/wallet/entry-copy.ts` — *"Plan credits · Included with your plan"* — so a real user's
wallet history asserted a plan grant that no plan backed.

## Why it could not simply be edited

`credit_ledger` is append-only by construction, and that is the property which makes it worth
trusting:

- a `block_mutations` trigger rejects both `UPDATE` and `DELETE`
  (`20260718000006_billing_ledger.sql`);
- `app.apply_ledger_entry` is the only write path, and it only ever appends.

So the fix goes **forward**, never back. This is the standard remedy for an append-only ledger:
a compensating pair.

## The correction (applied 2026-07-25)

| seq | entry_type | amount | balance_after | actor | meaning |
|---|---|---:|---:|---|---|
| 5374 | GRANT | +100 | 126 | `claude-verification` | the original, mislabelled |
| **5596** | **ADJUST** | **+100** | 126 | `claude-ledger-correction` | the honest re-record |
| **5597** | **ADJUST** | **−100** | 26 | `claude-ledger-correction` | reverses the false grant |

**Net effect on the balance: exactly zero** — which is correct. The 100 credits were real and
were spent (seq 5375/5376); clawing them back would drive a live workspace to −74. What changed
is the *record*: `ADJUST` renders as "Manual adjustment · Adjusted by Sahoda support", which is
true.

**The `+100` was applied first, deliberately.** The other order is transiently negative and
would stamp `balance_after = -74` into an immutable row — asserting a state this workspace was
never in.

Both entries carry fixed idempotency keys (`ledger-correction:2026-07-25:relabel-seq-5374:
reissue` / `:reversal`), so a second run replays through `apply_ledger_entry`'s idempotency
branch and writes nothing.

## Verification — three independent ways, re-confirmed 2026-07-28

Queried read-only against project `rloztdhzfliyvpvxsgjl`:

```
GRANT  n=2  Σ=+200
ADJUST n=2  Σ=   0
DEBIT  n=5  Σ=-174
HOLD   n=5  Σ= 174
                       200 + 0 - 174 = 26
credit_balances.balance_total          = 26   ✓
last credit_ledger.balance_after       = 26   ✓
credit_balances.balance_held           =  0   ✓  (HOLD Σ == DEBIT Σ — nothing stranded)
```

The books reconcile. No further action is required.

## The script

`packages/db/corrections/2026-07-25-relabel-manual-grant.ts` (committed `25d305a`, also on tag
`archive/wt-db-wip`). Two safety properties worth copying into any future correction:

1. **It refuses to run against a row it has not verified.** `assertTargetUnchanged` compares
   *every* identifying field — seq, workspace, type, amount, actor — not just the id. A reused
   key, a changed amount or a different workspace stops the run before anything is written.
2. **It is balance-neutral or it rolls back.** The whole correction runs in one transaction and
   re-reads the balance at the end; if the total moved at all, it throws and rolls back.

```
pnpm --filter @sahoda/db exec tsx corrections/2026-07-25-relabel-manual-grant.ts
```

## What this changes going forward

- **A manual ledger entry needs an `action_type` that is true.** `signup_grant` was borrowed
  because it was to hand. SL-032 (*"Constrain `credit_ledger.action_type` instead of parsing
  grant keys"*) is the open card that would have prevented this at the database level.
- **Wallet copy derives from `entry_type` alone**, so any `GRANT` inherits plan-grant wording.
  Copy that makes a claim about *why* money moved needs a field that records why.
- A correction is not a rollback. It is two more rows, and the history keeps both.
