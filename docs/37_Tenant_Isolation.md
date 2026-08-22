# 37 — Tenant isolation, measured against production

**Measured 2026-08-22 against `rloztdhzfliyvpvxsgjl`.** Re-run with
`node packages/db/scripts/rls-live-matrix.mjs`.

## The headline

| | count |
|---|---|
| tenant tables (catalog: `public` tables carrying `workspace_id`) | **47** |
| RLS enabled | 47 / 47 |
| **PROVEN** — a foreign row exists and the attacker saw none of it | **47 / 47** |
| leaks | **0** |
| workspace-scoped views without `security_invoker` | **0 / 1** |

47/47 PROVEN is reached in two halves. **31** were proven against rows that
already live in production. The other **16** hold no rows at all, so they were
seeded with one foreign row each, probed, and cleaned up — see below.

## Why the old 47/47 was not 47/47

The isolation suite reported every table green. It was green because for 16 of
them *there was nothing to see*. "The attacker read nothing" and "there was
nothing to read" produce the same pass, and only one of them is a proof.

The 16 turned out to be exactly the 16 tenant tables with **zero rows**:

```
asset_derivatives  asset_usages       billing_profiles    competitor_subscriptions
inbox_messages     inbox_threads      invoices            knowledge_chunks
knowledge_documents playbook_run_items playbook_runs      playbooks
remix_batches      remix_derivatives  tour_progress       zernio_webhook_events
```

`rls-live-matrix.mjs` therefore never reports PROVEN without printing the row
count it was reached with, and names an empty table **UNEXERCISED** — which is
neither a pass nor a failure. It exits **3** for that case, so a caller can tell
"nothing leaked" from "isolation is proven everywhere".

## Exercising the 16

One throwaway workspace, one foreign row in each of the 16, probed as a stranger,
then deleted. **16/16 PROVEN**, and the cleanup verified back to zero rows in all
sixteen plus the workspace and the one global `competitors` row.

Cleanup is the **workspace cascade**, never a per-table delete, and that is not a
style preference. `app.block_mutations` guards `invoices`, `knowledge_chunks` and
`zernio_webhook_events` as append-only, raising `restrict_violation` on a direct
DELETE — but it exempts `pg_trigger_depth() > 1`, and an FK cascade runs at depth
2. MEASURED inside a rolled-back transaction: the cascade succeeds where the
direct delete cannot.

## The four ways this harness could have lied, and what stops each

**Counting rows through the token that was just refused.** The attacker probes
over PostgREST with a minted JWT; the counting is a separate service-role
Postgres connection. Two credentials, two protocols — they cannot be confused.

**A platform operator as the attacker.** The attacker is a synthetic Clerk id
(`user_rlsmatrix_probe_*`) that appears in no table. `memberships=0 ops_seats=0
owned=0` is asserted from the service-role side and printed before any probe
runs; if it fails, the run exits 2 and reports nothing. Otherwise the harness
would be crying leak at a policy working correctly.

**One exception aborting the transaction, so fifteen later probes read the abort
as a refusal.** There is no shared transaction. One HTTP request per table.

**A blind probe.** This is the one that nearly got through. A probe whose token
is wrong returns zero rows for every table and looks like flawless isolation. So
the run first probes as a REAL member and requires that it sees rows *and only
its own*: a member of the demo workspace sees 5 of 123 posts, all from
`6473b616…`, while the stranger sees 0 on the same channel and table. The first
attempt at this control picked a member whose workspace held **no** posts, so its
zero proved nothing — the control needs a member who owns rows, and the harness
now selects one by `order by count desc`.

A forged signature answers `401 PGRST301 "None of the keys was able to decode the
JWT"`, which confirms the tokens are genuinely verified rather than waved through.

## What this does NOT cover

- **INSERT / UPDATE / DELETE.** Only SELECT is probed. A write policy could be
  wider than its read policy and this would not see it.
- **`ai_provider_logs` has RLS enabled and ZERO policies** (226 rows). That fails
  closed — nobody can read it through the API — but it is worth knowing that the
  table is unreadable rather than protected by a rule someone chose.
- **`relforcerowsecurity` is false on all 47**, so the table OWNER bypasses RLS.
  PostgREST connects as `authenticator` and switches to `authenticated`, so this
  is not reachable from the app, but a migration running as `postgres` is not
  constrained by any of the above.
- Storage buckets, Realtime channels and Edge Functions are outside this matrix.
