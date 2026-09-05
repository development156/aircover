# Handoff — divas — wt-divas3 — 2026-09-01

**Branch** `wt-core` at `88425ae9`. Lane `wt-divas3`. Pushed: **yes**, to
`origin/wt-core` (`ed15a04b..88425ae9`, 69 commits) and to `origin/wt-divas3`
(`b476f6aa`).

> **This session ended on `wt-core`, not on its own lane, and that is the single
> most important line in this file.** The founder asked for all twelve lanes to
> be merged and pushed to the trunk. That was done. The lane's own work —
> `b476f6aa` — was already contained in `wt-core` before the session started.

---

## What shipped

| # | What | Proof | Covered by |
| --- | --- | --- | --- |
| 1 | The composer selector matched **5 elements, not 1** | `b476f6aa`, 19 call sites across 11 files | the 17 specs that were failing on it |
| 2 | **All twelve lanes merged into `wt-core`** | `88425ae9`; each verified with `git merge-base --is-ancestor` | the gate below |
| 3 | `asset_logo_facts` added to the customer export | `apps/web/src/lib/privacy/export-manifest.ts:109` | `packages/db/tests/export_manifest.pglite.test.ts` |
| 4 | Same table added to the data-handling document, count 58 → 59 | `docs/38_Data_Handling.md:54` and §3 | `packages/db/tests/data_handling_doc.pglite.test.ts` (6 passed) |
| 5 | Two studio files allowlisted in the raw-hex scan | `scripts/design/design-lint.mjs` | mutation, below |
| 6 | Chromium and dependencies installed; the sandbox can drive a browser | `.sahoda-setup-status` = `OK`, `set_count=43` | `scripts/sandbox-probe.mjs` |

### Item 1, because it is the one another lane will hit

`getByLabel` matches on **substring**. The composer's toolbar carries four
buttons whose `aria-label` each contain "your post" — Undo, Redo, Clear, Add an
emoji — so `getByLabel('Your post')` resolved to five elements and every `fill`
threw a strict-mode violation before the test body began.

**MEASURED on a full @smoke run: 118 tests, 39 failed, and 17 of those 39 were
this one selector.** The blast radius is that wide because
`e2e/fixtures/compose.ts:86` uses it and most composer specs go through that
fixture.

The product is not at fault. `writing-pane.tsx:76` labels the textarea exactly
`Your post`, and the longer button labels are correct accessibility.
`{ exact: true }` matches the whole string case-sensitively, which the four
buttons cannot satisfy.

**PROVEN both directions**: before, the call log reads `resolved to 5 elements`;
after, `34 × locator resolved to <textarea…>`, which is one.

---

## What was NOT done, and why

- **The @smoke suite has NOT passed. It is UNRUN on the merged trunk, and it was
  never reported as passed.** Two attempts, two different walls, both measured:
  - Locally: 39 failed / 79 passed. 15 of those failures are
    `net::ERR_CONNECTION_RESET` on `http://127.0.0.1:3100` — the Node transport,
    not the app. Persistence cannot work here either: `db.rloztdhzfliyvpvxsgjl.supabase.co`
    resolves **IPv6-only** (`2406:da1a:…`) and this sandbox has no IPv6 route.
  - On a GitHub runner: run **1124**, job `Playwright @smoke`, **failed in 20
    seconds** at its own guard step. `##[error]Repository secrets are not
    configured: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY
    NEXT_PUBLIC_SUPABASE_URL`. `Install Chromium` and `Run the smoke suite` are
    both marked **skipped**. A real runner WAS allocated (`runner_id
    1000001169`), so this is not the no-runner problem this lane has recorded.
- **`wt-core` was NOT promoted to `wt-web`.** That is production, it needs
  `SAHODA_PROMOTE=wt-web`, and it was not asked for.
- **The 22 non-selector failures were not individually fixed.** 15 are the
  transport; 7 are individual and unread. Fixing them needs an environment where
  the browser and the database both work.
- **karunesh3's `/report` rebuild was NOT taken.** Founder's decision, this
  session — see "Contract, migration or money".
- **I did not commit `ops/state/qa.pending.json`, twice.** See "Anything
  retracted", item 2.

---

## Shared surfaces touched

| Surface | Change | Shape |
| --- | --- | --- |
| `apps/web/e2e/fixtures/compose.ts:86` | selector made exact | **Behaviour-preserving.** Any spec calling it is unaffected except that it now works |
| `apps/web/src/lib/privacy/export-manifest.ts` | one entry added | **Additive.** No existing entry changed |
| `scripts/design/design-lint.mjs` | two paths added to `HEX_EXEMPT_FILES` | **Additive and narrow** — mutation-proven below |
| `apps/web/src/components/posts/post-card.tsx:121-124` | `media = []` added ALONGSIDE `zone` | **Additive.** `PostCardProps & { zone?: string \| null }` unchanged |
| `apps/web/src/app/(app)/report/page.tsx` | a `ReportModule` inserted; the money module renumbered `7:5` → `8:6` | **The numbering is hand-maintained and conditional.** A lane adding a module must renumber by hand; nothing guards the sequence |
| `apps/web/scripts/perf/js-budget.json` | `+/(app)/report/loading`, `studio/[id]` NOT added | A route with no budget is a hard build failure; a budget for a route that no longer exists is stale |

**`/(app)/studio/[id]` no longer exists on the trunk.** MEASURED:
`git ls-tree origin/wt-core` lists only `studio/page.tsx`. Any lane still
carrying that route, or a budget entry or generated type for it, is stale.

---

## Contract, migration or money

**No migration was written and none was applied. `pricing.config.json` and the
ledger were not touched.** MEASURED.

But the merge brought **five migrations from other lanes** into the trunk, and
one of them had a consequence nobody in its own lane could see:

**`asset_logo_facts` carries `workspace_id` and was in NO customer export.**
`export_manifest.pglite.test.ts` and `data_handling_doc.pglite.test.ts` both
went red the moment the lanes met. That is a privacy defect, not a test defect:
a manifest that does not know a table omits that table's data from every DPDP
export, silently. Added as `readable`, which is what its standard membership
policy makes it.

**One founder's decision is recorded here because it is a product ruling, not a
merge choice.** `/report` was rebuilt independently by two lanes.
MEASURED: `git merge-base --is-ancestor` says `wt-karunesh3` does **not**
contain jiban2's `87abe541`, so these are two independent rebuilds, not one on
top of the other. jiban2's (30 August, numbered briefing) is newer and was
already on the trunk; karunesh3's is 29 August. **Founder ruled: keep the
trunk's.** karunesh3's eight correctness fixes live in `lib/report/*`, which
merged cleanly, so they came in regardless — but some of his new helpers
(`withheld.ts`, the `verdict.ts` additions) may now be unreferenced by
jiban2's page. **That is INFERRED, not measured, and it is owed a check.**

---

## Guards written, and the mutation that proved each

**One guard was relaxed, so the mutation proves the relaxation stayed narrow
rather than proving a new guard bites.**

`scripts/design/design-lint.mjs` now exempts `lib/studio/stamp.ts` and
`lib/studio/stamp.test.ts` from the raw-hex rule. Both reason ABOUT hex rather
than painting with it: the first carries `#ffffff` inside the error message
"The plate colour must be six hex digits such as #ffffff", the second pins a
magenta chosen so no fixture could produce it by accident.

**The mutation, applied and WATCHED:** appended `const MUTATION_PROBE = "#abcdef"`
to `apps/web/src/lib/studio/brand-signals.test.ts` — a sibling in the SAME
directory — and the scanner printed:

```
  FAIL  raw hex colour — 1 (docs/37 §18 — tokens only)
```

Reverted; the scanner returned to `ok raw hex colour`, and `git status` on that
file is clean. The exemption is two named paths, not a directory.

**No new guard was written this session**, and the export-manifest and
data-handling guards that caught the privacy defect were written by another
lane. I watched them go red and then green; I did not author them.

---

## Anything retracted

**1 · I told the founder "nothing is being written to production" during the
local @smoke run. That was wrong, and it was decision-relevant.** I based it on
two `getaddrinfo ENOTFOUND` events. MEASURED afterwards: `ENOTFOUND` appears
**4 times** in a 782-line log, not on every request, and the REST host
`rloztdhzfliyvpvxsgjl.supabase.co` resolves to IPv4 and answers `401`. The app
writes through REST, so rows were created. The founder had approved a
production-writing run partly on what I said.

**The correction is not "it was fine anyway", but it did end well:** MEASURED,
the log contains **zero** occurrences of `cleanup UNVERIFIED`, `leak`, or
`left behind`. `e2e/fixtures/seeded-user.ts` deletes the Clerk user and the
Supabase rows and throws on a confirmed leak. Rows were written and then
removed.

**2 · `ops/state/qa.pending.json` reset itself to `{"runs": []}` and I nearly
committed the deletion of 163 run records.** MEASURED: `git diff --numstat`
read **+1 / −2121**; the committed file held 163 runs, the working copy held 0.
The SessionStart hook's own line said `qa 0`. Reverted, all 163 restored.
**This is the same standing rule the 28 August session in this lane wrote —
revert it, never commit it — reached from the OPPOSITE symptom.** That session
saw 306 characters of spurious re-encoding; this one saw total collapse. The
rule held for a failure mode it was not written for.

**3 · I wrote `MEASURED 2026-08-31` into `docs/38_Data_Handling.md` when
`date +%F` says `2026-09-01`.** Caught while writing this file and corrected in
the same commit as this handoff. A stale date on a privacy document is precisely
the defect that commit exists to fix, and I introduced one while fixing one.

**4 · I read six packages as failing when one had.** `turbo` cancels siblings,
and `@sahoda/shared:test` / `@sahoda/web:test` print `[ELIFECYCLE] Test failed`
when cancelled — identical to a real failure. Run alone, `@sahoda/shared` passed
**465** and `@sahoda/web` passed **7592**. A three-second turbo run is a
cancellation cascade, never a result.

---

## What the next session in THIS lane should pick up

1. **The three repository secrets are the only thing between this project and a
   real end-to-end number.** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, under Settings → Secrets and
   variables → Actions. Until they exist the smoke job **cannot** run — it exits
   at its guard in 20 seconds. This is now measured on run 1124, not inferred
   from the workflow file. **Report it; never work around it.**
2. **Re-dispatch the smoke job the moment they exist.**
   `gate.yml`, `workflow_dispatch`, `ack_target=rloztdhzfliyvpvxsgjl`. About
   fifteen minutes. The 17 selector failures should be gone; the 15 transport
   failures should vanish on a runner with a real network. **That is the number
   to compare against 39 / 79.**
3. **The 7 individual failures have never been read.** `palette-legibility:73`
   (60s timeout, ×2), `accent-budget:238` (`Execution context was destroyed`),
   `connections-widths:155`, `every-section-loads:101`, `rail-collapse:245`,
   `roadmap-honesty:251`. Each has a trace and a screenshot under
   `apps/web/test-results/`.
4. **Check whether karunesh3's report helpers are now dead code.** `withheld.ts`
   and the `verdict.ts` additions merged in; jiban2's page may not call them.
   INFERRED, owed a grep.
5. **`SAHODA_E2E_ACK_TARGET` arrives pre-set in this sandbox**, written by
   `scripts/cloud-setup.sh`. The acknowledgement was designed as a deliberate
   per-person act — `e2e-target.ts` says a boolean "would be satisfiable by
   anyone who wanted the error to go away". Pre-setting it on the environment
   turns the typed act back into a habit. **Worth a founder's ruling.**
6. **`pnpm turbo` strips `NODE_EXTRA_CA_CERTS`.** The build fails with
   `SELF_SIGNED_CERT_IN_CHAIN` on Google Fonts unless you build the app
   directly: `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt pnpm --filter
   @sahoda/web build`. PROVEN: exit 0, zero cert errors, `js-budget ok: 82
   routes within budget`. Never disable TLS verification.
7. **Playwright's `PORT` defaults to 3100** (`playwright.config.ts:90`), while a
   comment in the same file uses 3210. Starting the server on 3210 makes the
   readiness probe wait five minutes on the wrong port and report
   `Timed out waiting 300000ms from config.webServer` — which reads as a broken
   app. That cost a full run.
8. **Two sessions were on `wt-divas3` at once**, two minutes apart, on
   2026-08-29. Nothing was lost, but "one person, one lane" was not held.

---

## Gate

Measured on `3ca210f5`. `88425ae9` on top of it is **formatting only** —
2 lines, prettier, no rendered output change — and `tsc --noEmit` exited 0 on it.

| Leg | Result | Real output |
| --- | --- | --- |
| `turbo run typecheck lint test --force` | **PASS** | `27 successful, 27 total`, `0 cached`, **5m35.284s** |
| `@sahoda/web` vitest, alone | **PASS** | `576 passed \| 3 skipped (579)`; `7592 passed \| 13 skipped (7605)` |
| `@sahoda/db` vitest | **PASS** after the fix | was `3 failed \| 834 passed \| 207 skipped`; the 3 were `data_handling_doc` ×2 and `export_manifest` ×1 |
| `data_handling_doc` + `export_manifest`, after the fix | **PASS** | `Test Files 2 passed (2)`, `Tests 10 passed (10)` |
| `prettier --check .` | **PASS** | `All matched files use Prettier code style!` |
| `tsc --noEmit` (`@sahoda/web`) | **PASS** | exit 0 |
| `design-lint.mjs` | **PASS**, and mutation-proven | `ok raw hex colour`; a probe hex in a sibling file gave `FAIL raw hex colour — 1` |
| `node scripts/sandbox-probe.mjs` | **LOCAL_ONLY** | Chromium loopback 200; http AND https outbound both `ERR_CONNECTION_RESET`. Not a certificate problem |
| Playwright `@smoke`, locally | **39 failed / 79 passed** (38.6m) | 118 ran. 17 = the selector (now fixed), 15 = loopback resets, 7 = individual |
| Playwright `@smoke`, GitHub runner 1124 | **UNRUN** | failed at `Refuse without the keys the suite needs` in 20s; three secrets absent |
| `gate.yml` checks job, run 1124 | **PASS** | all 13 steps green, 21:40:40 → 21:46:50, on `b476f6aa` |

**The one number nobody has yet: @smoke on the merged trunk.** Everything above
is the unit and integration half. The browser half is UNRUN on `88425ae9` and
saying otherwise would be the exact failure this file exists to prevent.
