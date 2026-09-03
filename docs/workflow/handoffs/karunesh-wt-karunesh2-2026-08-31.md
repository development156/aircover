# Handoff — karunesh — wt-karunesh2 — 2026-08-31

**Branch** `wt-karunesh2` at `6a4fda80`. Lane `wt-karunesh2`. Pushed: **yes**, level
with `origin/wt-karunesh2`. Open draft PR:
[development156/aircover#33](https://github.com/development156/aircover/pull/33),
base `wt-core`.

**The one finding worth carrying out of this session is in "Anything retracted".**
The reason the smoke suite cannot run in a cloud sandbox is now MEASURED end to
end, and the diagnosis that has stood since 28 August is wrong.

---

## What shipped

No new product code this session. `6a4fda80` and `873da5de` were written in the
previous session on this lane and are unchanged; their contents are described in
full in PR #33's body and are not repeated here.

| Item | Proof | Covered by |
| --- | --- | --- |
| Analytics rebuilt as the evidence layer | `6a4fda80` | `apps/web/src/components/analytics/rebuilt.test.tsx` (15), `lib/analytics/{timing,view-params,rows,headline}.test.ts` (65) |
| The shared timing selector both screens read | `apps/web/src/lib/analytics/timing.ts:180` `timingGrid`, `:245` `bestSlotSentence` | `timing.test.ts` (18) |
| The weekly narrative arithmetic, kept | `lib/analytics/{grouped-lift,like-age,week-report}.ts` | 55 tests across three files |

This session's own output is this document plus the measurements below.

---

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN as a suite.** I ran ONE spec
  (`e2e/unauthenticated.spec.ts`, 5 tests) and it FAILED, 5 for 5, on a single
  message. That is a measurement of the sandbox, not a result about the diff.
  See Gate and "Anything retracted".
- **I did not fix the sandbox blocker.** The fix is not in this lane's files
  (`scripts/`, `playwright.config.ts`, and possibly the environment itself), and
  the right owner should decide between three options I have set out below.
- **I did not run `pnpm gate` locally this session.** CI ran the whole thing on
  this exact SHA and passed, which is the stronger evidence; re-running it
  locally at an unchanged tree would have measured nothing new. MEASURED: check
  run `typecheck · lint · test · format`, **success**, 7m50s, on
  `6a4fda80fe422215e9444702b55c16da751368cf`.
- **The two decisions from the last session are still open** and nobody has
  answered them. They are restated at the end.
- **`ops/state/qa.pending.json` is modified in the working tree and is not
  mine.** A hook writes it at session start. It is left uncommitted, as it was
  last session, because a git hook in this repository refuses a commit that
  stages it.

---

## Shared surfaces touched

**None this session.** Nothing was edited. The shared surfaces introduced by the
two commits already on this branch are listed in PR #33 and are unchanged:
`lib/analytics/timing.ts` (read by both `/analytics` and `/report`),
`lib/analytics/grouped-lift.ts` (now the single implementation behind
`lib/loop/reflect.ts`), and `lib/loop/iso-week.ts` (one added export,
`isoWeekStart`; nothing removed, so no existing caller breaks).

---

## Contract, migration or money

**None.** No change to `packages/shared`, no migration, no price, no ledger call.

---

## Guards written, and the mutation that proved each

**No new guards this session.** The 95 tests behind the two commits were each
mutation-proved in the previous session on this lane, and the table of which
mutation turned which test red is in PR #33's body rather than duplicated here.

The nearest thing to a guard this session produced is a **refutation**, and it
is recorded with its counter-measurement in the next section. It is the same
discipline pointed at a claim instead of at a test.

---

## Anything retracted

### The cloud sandbox smoke blocker was misdiagnosed, and this is the correction

**MEASURED, 2026-08-31, on this lane, seven ways.**

The standing account, from `jiban-wt-jiban2-2026-08-28.md`, is that Chromium
cannot reach the local dev server over plain HTTP loopback, that the cause is
unknown, and that the Node transport and the proxy were both ruled out. That
account is **wrong in its central claim**. Chromium's loopback is fine. What is
broken is Chromium's outbound HTTPS, exactly as `CLAUDE.md` said before 28
August, and the loopback reset is that failure wearing the navigation URL.

The chain, each step measured:

| # | Test | Result |
| --- | --- | --- |
| 1 | `pnpm exec playwright test e2e/unauthenticated.spec.ts` | **5 failed**, one message: `net::ERR_CONNECTION_RESET` at `http://127.0.0.1:3100/sign-in` |
| 2 | Chromium → a bare `node:http` server on `127.0.0.1:3122` | **200.** Loopback HTTP from Chromium WORKS |
| 3 | Chromium → `http://localhost:3122/` | **200** |
| 4 | Chromium → the Next dev server, same run | `ERR_CONNECTION_RESET` |
| 5 | `node:http` (does not follow redirects) → dev server with `sec-fetch-dest: document` | **307**, not a reset |
| 6 | The `Location` on that 307 | `https://leading-hyena-7.clerk.accounts.dev/v1/client/handshake?…&__clerk_hs_reason=dev-browser-missing` |
| 7 | Chromium → `https://example.com/` and → that Clerk handshake URL | **both `ERR_CONNECTION_RESET`** |

**What actually happens.** Clerk's middleware answers any DOCUMENT request
without the dev-browser cookie with a 307 to its own HTTPS handshake host. Only
document-shaped requests get it, which is why `curl` and Node `fetch` with
default headers see 200 and a browser never does: the trigger is
`sec-fetch-dest: document` OR an HTML `Accept` header, and I isolated both
(`sec-fetch-mode`, `sec-fetch-site` and `upgrade-insecure-requests` each still
return 200 on their own). The browser follows the 307, the HTTPS request is
reset, and **Playwright reports the failure against the ORIGINAL navigation
URL** — the loopback one. Every session that read that message concluded
loopback was broken. Nobody had a reason to look at the second request.

`--no-proxy-server` is the tell that should have caught it: the same navigation
then fails with `ERR_CERT_AUTHORITY_INVALID` instead, which is not an error a
plain-HTTP loopback request can produce.

**Two things this retracts, and one it restores.**

- **Retracted:** "the loopback is reset and the cause is unknown"
  (`jiban-wt-jiban2-2026-08-28.md`). The cause is known and it is not loopback.
- **Retracted:** that lane's refutation of the Node transport. Setting
  `SAHODA_BROWSER_VIA_NODE=0` failing identically proves nothing, because the
  transport was never the variable — every configuration fails at the same
  HTTPS hop.
- **Restored:** `CLAUDE.md`'s original sentence, that Chromium in this sandbox
  cannot complete any outbound HTTPS request and `https://example.com/` resets
  the same as Clerk's host does. Re-measured today, still true.

**What is still NOT known, and I am not claiming it:** why Chromium's HTTPS is
reset when Node's is not. Node reached `https://api.clerk.com` (200) and
Supabase's REST host in the same session. The agent proxy logs no attempt for
Chromium's, which is consistent with the traffic dying before it reaches the
proxy. That is the environment's question, not this repository's.

### One correction to a claim about `scripts/`, which stands

`sandbox-probe.mjs` reporting `LOCAL_ONLY` / "the suite CAN run here" off its own
ephemeral listener is real and was correctly reported on 28 August. My step 2
above is the same check and it passes for the same reason: the probe is right
that loopback works, and wrong that this licenses the suite.

---

## What the next session in THIS lane should pick up

**1 · The two open decisions, unanswered since 29 August.**

- Do `week-card.tsx`, `week-copy.ts` and `week-data.ts` move to `/report`, or
  come out? They are rendered by nothing today and are deliberately left in
  place rather than deleted.
- Which of the six unbuilt pieces is first: CSV export, post thumbnails, a
  custom date-picker UI, a multi-brand switcher, a plain-English trend sentence
  under the chart. The seventh, a filter by editorial format, is BLOCKED: no such
  classification exists in the data.

**2 · The smoke blocker now has three options rather than a mystery.** None of
them is this lane's file, so somebody should be given it deliberately.

| Option | What it costs | What it buys |
| --- | --- | --- |
| Keep dispatching the `smoke` job on `.github/workflows/gate.yml` by hand | nothing; it is the status quo | the only currently-proven green path |
| Give the sandbox's Chromium working outbound HTTPS | an environment change, outside this repo | the whole suite runs in a lane |
| Have the E2E fixture pre-seed the Clerk dev-browser cookie so no handshake redirect is issued | test-infrastructure work of unknown size, and it must not weaken what the suite proves | the suite runs with no environment change |

I have NOT costed the third and would not want it chosen off this paragraph.

**3 · Fix `sandbox-probe.mjs`'s verdict.** It says "the suite CAN run here" on a
check that cannot see the failure. Under this project's one rule, a check that
passes without testing the thing it licenses is the defect, and it has now cost
two sessions a wrong diagnosis.

---

## Gate

| Leg | Result |
| --- | --- |
| `typecheck · lint · test · format` (CI, on `6a4fda80`) | **PASS** — success, 7m50s |
| `turbo typecheck lint test --force`, 27 tasks (previous session, same SHA) | **PASS**, forced, not a cache replay |
| `@sahoda/web` unit, 6,358 tests (previous session, same SHA) | **PASS**, 13 skipped |
| `prettier --check .` | **PASS**, clean repo-wide |
| Design lint | **PASS**, no raw hex, no off-scale type |
| Playwright `@smoke`, full suite | **UNRUN.** Skipped by this repository's workflow; unrunnable here for the reason measured above |
| Playwright `e2e/unauthenticated.spec.ts` (5 tests, run today) | **FAIL**, 5 for 5, one message, environment |
| Clerk `global-setup` | **PASS** — the key is `pk_test_`, `clerkSetup()` completed, no throw. This is NEW: it used to be the blocker and is not one now |

**Environment, as of today.** All seven variables `scripts/cloud-setup.sh` marks
REQUIRED are present, and it wrote 47 into each of `.env`, `apps/web/.env` and
`apps/web/.env.local`; its status file reads `OK`. `api.clerk.com` answers 200
from Node with `CLERK_SECRET_KEY`. Three optional names are absent and each
degrades one feature honestly rather than crashing: `GOOGLE_GEMINI_API_KEY`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

**Preview.** https://sahodalabs-git-wt-karunesh2-development-4417s-projects.vercel.app/analytics
