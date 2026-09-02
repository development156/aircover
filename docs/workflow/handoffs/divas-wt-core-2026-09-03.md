# Handoff — divas — wt-core — 2026-09-03

**Branch** `wt-core`, 16 commits from `2dba741c` to `cd8ff8c7`. **NOT pushed.**
Gate green after every step: 27/27 turbo tasks (forced, 0 cached), root vitest
240/240, `prettier --check .` clean, `turbo run build` successful with 82 routes
within budget.

Report artifact: https://claude.ai/code/artifact/0ebff6a1-e3e0-4005-98a3-3266b6fd6d56

In plain terms: the product could not take money, and the live database password
was published on a public repository and still worked. Both are addressed here
except the one part no code can do, which is rotating that password. A hundred
and thirteen findings were confirmed by a hostile second reader; three were
blockers and all three are fixed. Nothing has been pushed or deployed.

## The one thing that cannot wait

**Rotate the Supabase database password.** It was in `ops/state/qa.pending.json`,
tracked, on all sixteen origin branches of a PUBLIC repository, because a red
`live-guard` run printed the connection string and the ops queue copies the last
4000 characters of any failure. A verifier fetched the file unauthenticated,
connected, and came back as `postgres` — which bypasses RLS, the only boundary
this product has.

Fixed here: redaction in `scripts/lib/ops-classify.mjs` BEFORE the truncation (a
cut between `Bearer ` and its token defeats every shape rule), a pre-commit
refusal with no hatch, the test asserting a boolean, and the working copy
redacted. Still open and not code: the rotation, the history on sixteen
branches, and one `ops_qa_runs` row in production.

## What shipped

| commit | what |
| --- | --- |
| `79ccfde2` | the redaction, the hook and the boolean assertion |
| `e3cb0ca9` | the redacted line itself (ALLOW_QA_PENDING, deliberately alone) |
| `b66ec549` | the checkout bridge, the subscription row, the purchase grant key |
| `bb4bca3d` | publish copy, the fixture false-green, the cross-rail key, the stale lease |
| `e79bbf52` | provider timeouts, and the two planners that dropped `nowIso` |
| `5abc87c7` | L2 needs a person, the create stage writes what it charges for |
| `b303ce43` | the PDF door holds credits, the sixth namesake can sign up |
| `de9e9c00` | four migrations (NOT applied), two suites that had never run |
| `4004928a` | Radar charges, the batch rotates, a failed night reports failure |
| `93cf4071` | the embed form, and the embed pages without the login SDK |
| `9eb3dd65` | owner check before erase, OAuth nonce, Zernio idempotency key |
| `b0218855` | the remix fee is released when nothing was produced |
| `0976759f` | a premium picture is charged at the premium price |
| `4788c808` | the upload limit the platform actually accepts |
| `af3c20cc` | analytics cache, 927 lines of dead code |
| `cd8ff8c7` | LEARNINGS |

## Three things worth carrying

**1. The enum that never learned `radar`.** `20260822090000` widened
`posts_origin_check` to four values on 22 August and is applied; `PostOriginSchema`
stayed at three, so `PostInsertSchema` refused every Radar draft before any
database call and that feature has never once produced one. The new guard
(`packages/db/tests/post_origin_enum.test.ts`) parses the migration's own SQL and
diffs it — and strips comment lines first, because that file quotes the OLD
constraint verbatim in its header and a whole-text scan would read the history as
the present and pass.

**2. Two agents' worth of test files were RED because they were specs, not
regressions.** The Fable quota died mid-run and killed 20 of 21 fix agents; several
had written their failing test and not the implementation. A red file whose mtime
is inside the last hour is a spec, not a break. Check the clock before debugging.

**3. `pkill -f "turbo run typecheck"` kills the shell running it.** The traps doc
says never to pkill by a pattern matching your own command line; it cost two
commands here. Also: two builds writing to one `.next` gives a js-budget reading
of roughly double, on every route. Move `.next` aside, build once, then measure.

## Migrations written and NOT applied

`20260902220001_connections_identity_locked` · `20260902220002_publish_state_service_only`
· `20260902220003_signup_grant_per_user` · `20260902220004_radar_subscribe_sources_locked`

They cannot be pushed anyway: `docs/db/MIGRATION_DIVERGENCE_2026-09-02.md` records
92 versions applied against 96 local files, eighteen of them the same DDL under a
different timestamp. Both reconciliation routes are written out with statements.

## Needs a decision

1. **Rotate the database password** (above). Then history purge, then the ops row.
2. **Cashfree production keys answer 401.** A support ticket. The bridge is built
   and the plan is recorded, so this is the only thing left before a first payment.
3. **Reconcile the migration history**, direction A (rename 18 files) or B
   (rewrite 18 history rows).
4. **The PDF door now costs 50 credits** and no screen says so before an upload.
5. **The upload ceiling drops 8 MB → 4 MB** until a direct-to-storage upload exists.
6. **Set `NEXT_PUBLIC_SENTRY_DSN` on Vercel** and add it to `.env.example` (this
   lane may not edit that file). Browser errors are invisible until then.
7. **Run one live Facebook connect on the preview** before promoting: the OAuth
   nonce assumes a SameSite=Lax cookie survives the four-hop trip, which is
   inherited from the code's comments and has never been measured.
8. **`scripts/radar-pass.ts` now debits real customers** when run by hand.
9. **A partial per-channel model answer in the Loop is charged in full** (parity
   with playbooks).

## What was NOT done

- **The Playwright `@smoke` suite is UNRUN**, not passed. All 118 sign in through
  Clerk against the only database this project has, which is production, and the
  repo's own guard refuses without an explicit acknowledgement. That is a person's
  call and it was asked for and not answered.
- **Nothing pushed, nothing deployed.** 16 commits sit on this branch.
- **51 low-severity findings** are recorded and unverified. None is about money,
  tenancy, or a false statement to a customer.
- **The old onboarding tree** (~3,800 dead lines) stays: a mutation script and two
  source-scanning guards point at it, and retargeting them is its own change.
- **`publishing-5`** (per-channel crops sent to every channel) is reported, not
  fixed: the join needs `asset_derivatives` confirmed applied in production.
- **Two shared-chunk routes grew 13.6 kB** this session and the precise cause was
  not isolated. Budgets re-recorded against a clean build.
