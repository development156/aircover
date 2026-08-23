# 35 — Operations

**Measured 2026-08-22** against production (`rloztdhzfliyvpvxsgjl`,
`https://app.sahodalabs.com`, deployed from `origin/wt-web`).

## 1 · What production actually runs

`origin`'s **default branch is `wt-web`**, not `main`. That matters twice over:
Vercel builds it, and GitHub fires `schedule` triggers only from it.

| | integration branch | `origin/wt-web` (deployed) |
|---|---|---|
| tip | 2026-08-22 | `c8faa34`, **2026-08-14** |
| cron routes on disk | 3 | **1** (`sweeps`) |
| `vercel.json` cron entries | 3 | **1** |
| `.github/workflows/` | 3 files | **absent entirely** |
| `lib/cron/heartbeat*` | present | **absent** |

So production has one cron, no heartbeat, and no scheduled workflow of any kind.

## 2 · Cron reachability — proven, not assumed

`node scripts/probe-crons.mjs` asks the deployment, sending **no cron secret**, so
it can never trigger a job. A reachable route answers 401 and that 401 is the pass.

```
CONTROL  /api/cron/__probe_control_never_exists  307  discriminator sound

PASS /api/cron/sweeps     401  reachable    (*/5 * * * *)
FAIL /api/cron/metrics    307  shadowed     (20 1 * * *)
FAIL /api/cron/loop       307  shadowed     (0 21 * * 0)

1/3 scheduled crons are reachable
```

**The control is the whole design.** A path that was never written answers 307
too, because Clerk redirects a navigation to any unmatched path. So "not exempt"
and "not deployed" are indistinguishable from the outside, and a probe without
the control would send someone to edit `middleware.ts` for a missing file. The
run prints the control first and refuses to report if it misbehaves.

Also measured: the request headers decide the answer. Without
`Sec-Fetch-Dest: document` the same missing route reads 404 rather than 307,
which on 31 July was read as production being down.

### The halves that must agree

A cron path is written in **four** places, not the three `lib/cron/wiring.test.ts`
names: `vercel.json`, the route file, `isPublicRoute`, and `config.matcher`.
`isPublicRoute` decides what Clerk DOES; `config.matcher` decides whether it RUNS.
A path in the first and not the second ticks perfectly and is crashable by one
malformed bearer header — `middleware.ts` documents that as a live 500. That case
is now tested, and PROVEN to fail: removing `/api/cron/loop` from both matchers
left five of the file's six assertions green.

## 3 · The heartbeat

`lib/cron/heartbeat.ts` watches ABSENCE — a job that stops being called produces
no error, and every other alarm here fires on errors. It was well built and had
two defects that made it inert.

**The alert rail answered 400 on every call.** MEASURED against real Upstash:

```
?NX=true&EX=60  →  HTTP 400  {"error":"ERR syntax error"}
?NX&EX=60       →  HTTP 200  {"result":"OK"}  then  {"result":null}
```

`NX` is a Redis flag, not a parameter with a value. `claimAlertSlot` sent the
first form, `!response.ok` was true every time, every alarming job was recorded
as `suppressed`, and **no alert had ever been sent or could be**. The unit suite
could not see it: it mocks `fetch`, so it asserted our own idea of the URL back
to us. `heartbeat.live.test.ts` drives the real service and fails on that mutation.

**`declined` and `unavailable` were one boolean.** "Another tick already alerted"
and "we could not ask" are opposite facts. They are now separate, and the cron
response body carries `undeliverable` beside `suppressed`.

**The job list was hard-coded to two of three.** `checkAndAlertHeartbeats` read
`['sweeps','metrics']` while `allHeartbeatVerdicts` iterated all three schedules,
so `loop` was judged on a last-run nobody fetched. Now derived from
`CRON_SCHEDULES`.

**A missed run is proven, not just an errored one.** The live suite writes a stamp
one millisecond past each job's own allowance, reads it back through real Upstash
and requires `stopped` + alarming — for all three schedules, at the boundary.
Nothing throws anywhere in that test.

### Alerts that reach a phone — what is really provisioned

Honest position, unchanged from `lib/cron/alert.ts`'s own header: **there is no
SMS, WhatsApp or push rail in this project.** The environment carries
`RESEND_API_KEY` and `SENTRY_DSN` and nothing that can reach a phone directly.
Alerts go by email, which on a phone with mail push is a phone alert and is not
an SMS. Adding a real rail is a founder action — an account and a number.

## 4 · Post-deploy smoke — it ran, and it never once passed

Via the Actions API: **16 runs, 6 `failure`, 10 `skipped`, zero successes**, on 19,
20 and 22 August from `wt-loose-ends`, `wt-loop` and `wt-handoff`.

Every failure was the same. `deployment_status` fires for PREVIEW deployments,
a protected preview answers `302 → vercel.com/sso-api` and lands on
`vercel.com/login`, so all six routes "landed on /login" and it reported
`0/6 routes behave`. The app was fine every time; the probe was grading Vercel's
login page.

Fixed two ways: the job runs only for `Production` deployments, and
`probe-routes.mjs` detects the wall by **host** — we asked `*.vercel.app` and
ended on `vercel.com`, which the app cannot forge — reporting **UNMEASURED** with
exit 2 rather than a failure with exit 1.

**The `@smoke` suite is deliberately not wired here**, and the reason is stronger
than the original one: it does not read, it CREATES. Running 99 browser tests on
every deploy would write test workspaces into the customer database
automatically. See §6.

## 5 · Dead letters

`post_publish_logs` held **7 failed publishes** and one member-scoped select
policy, so no operator could see any of them in any tenant — and `apps/web` has
no service-role client, correctly. Migration `20260822160000` adds the
`app.is_ops_admin()` policy. **Applied to production and recorded.**

Verified live through minted tokens on the real endpoint:

| caller | rows | workspaces | failed |
|---|---|---|---|
| ops admin | 21 | 2 | 7 |
| member, not an admin | 6 | 1 | 1 |
| stranger | 0 | 0 | 0 |

`/admin/jobs` renders it through the operator's own token, so RLS decides.
`workspaces` was deliberately NOT widened, so tenants show as ids.

**Two `ops_admins` rows carry `user_id = NULL` with `status = 'active'`.**
`app.is_ops_admin()` compares `user_id = auth.jwt()->>'sub'`, and NULL equals
nothing — so those seats grant no access while appearing active in any list.
Fails closed, but the team screen is showing two seats that are not seats.

## 6 · Status page

`.github/workflows/status-page.yml` builds a static page from the two read-only
probes and publishes it to **GitHub Pages** — a different company, network and
failure domain from Vercel, Supabase and Upstash. Built 2026-08-22 against
production: `Public routes 6/6 · Scheduled jobs reachable 1/3` → "1 of 2 checks
failing".

Every page states when it was built and calls itself STALE past 60 minutes,
because a status page frozen on "all systems operational" is worse than none.
The probes are unauthenticated: the claim is about public routes and cron
reachability, and nothing about signed-in behaviour, publishing or billing.

**It is not armed.** `schedule` fires only from the default branch, and
`.github/workflows` does not exist on `wt-web`. Neither is `post-deploy-smoke`
nor `metrics-nightly`. Moving them there is a founder decision.

## 7 · The migration record

**The record is not behind. It is ahead.**

```
64  versions in supabase_migrations.schema_migrations
56  migration files on the integration branch
```

Nine migrations are applied in production whose files exist **only on lane
branches**:

| version | lives only on | creates |
|---|---|---|
| `20260812000000` | `wt-db3` | index on `ai_provider_logs.repaired` |
| `20260812000001` | `wt-db3` | `resolve_brand_memory` v2 |
| `20260821000000` | `wt-media` | `asset_derivatives` |
| `20260822000000` | `wt-knowledge` | `knowledge_documents`, `knowledge_chunks`, 6 RPCs |
| `20260822000100` | `wt-knowledge` | revoke anon on knowledge |
| `20260822000200` | `wt-knowledge` | `propose_memory_event` |
| `20260822000300` | `wt-knowledge` | delete-gate fix |
| `20260822060000` | `wt-radar` | `competitors`, `competitor_sources` |
| `20260822060100` | `wt-radar` | `competitor_changes`, radar RPCs |

**What that means:** a fresh Supabase project built from the integration branch
would be missing nine migrations' worth of schema that production has — three
tables the app reads, six RPCs, and the radar registry. It would not resemble
production, and nothing in the branch would say so. The fix is merging those
lanes, not editing the record.

### Is `db push` safe?

Exactly one file on this branch is unrecorded: `20260805000000_clerk_id_remap`.
It is **genuinely unapplied** — verified from the catalog, not from the record:
`clerk_id_map` does not exist and neither `remap_clerk_user_ids` nor
`verify_clerk_remap` is present. **No INSERT was made.** Recording it would mark
as applied something that is not, and `db push` would then skip it forever,
leaving the Clerk dev→production remap machinery permanently absent from a
migration whose whole purpose is a one-way door.

So: `supabase db push` from this branch would apply that one migration and
nothing else. Its own header says applying it is harmless — an empty map means
`remap_clerk_user_ids()` changes zero rows — and it self-rehearses inside its own
transaction. It was **not** run here; `db push` is the founder's call.

## 8 · The five items in this pass

| item | state |
|---|---|
| cron heartbeat that fires on a MISSED run | built, proven against real Upstash, 9/9 |
| alerts that reach a person | email via Resend; **no phone rail exists** — founder action |
| dead-letter admin view | built, policy applied to production, verified live |
| post-deploy smoke against the deployment | fixed and extended; **inert until it is on the default branch** |
| independent status page | built on GitHub Pages; **inert until it is on the default branch** |

## 10 · The two scanners that are not tests

`scripts/lib/scanner-registry.test.mjs` enumerates every guard that reads source,
but it only looks at `*.test.ts` / `*.test.mjs` / `*.test.tsx`. Two of this repo's
most active scanners are neither, so they are audited here. Both caught real
defects in this lane's own work, which is the argument for writing their limits
down rather than trusting them silently.

### `scripts/design/design-lint.mjs`

Five rules, each with a count baseline that can shrink and never grow: `hex`
(raw colour), `disabled` (coming-soon button), `spacing` (hardcoded), `breakpoint`
(dead variant), `typesize` (hand-written font size).

**What it can see:** class-name strings written literally in `.ts`/`.tsx` under
`apps/web/src`, walked with `readdirSync`.

**What it cannot see:**
- a class assembled at runtime — concatenation, a template literal, a variable, a
  `clsx` call whose parts live elsewhere. The literal is the unit;
- CVA `size` variants, which are config objects and not classes at all — the file
  says so itself and treats them as a known false-positive source;
- anything outside `apps/web/src`: `packages/sites` renders markup and is not
  scanned;
- inline `style={{…}}`, which bypasses class names entirely;
- CSS files. A raw hex in a `.css` is invisible to it.

*It caught six hand-written font sizes in `/admin/jobs` on 2026-08-22 — copied
from a grandfathered file, which is exactly how a baseline erodes.*

### `scripts/lint.mjs`

Five rules: `test-only` (a focused test left behind), `assertionless-test`,
`console-log`, `uncollected-tests` (a test file no vitest `include` reaches), and
`stale-exception` (a declared exception that no longer applies).

**What it can see:** per-package source text, plus each package's vitest
`include` globs for the collection rule.

**What it cannot see:**
- a test skipped by a runtime condition — `describe.skipIf(...)`. `uncollected-tests`
  answers "is this file reachable", never "did anything in it execute". A suite
  that skips everything reports as collected and passing;
- an assertion made through a helper it does not recognise, which reads as
  assertionless;
- logging that is not literally `console.log` — a wrapper, `process.stdout.write`,
  or a logger import;
- **it is a ROOT script and sits outside `turbo`.** `pnpm gate` runs it via each
  package's `lint` task, but `node scripts/lint.mjs .` at the repo root is not a
  gate leg. That root invocation currently FAILS on a pre-existing finding —
  `packages/sites/src/theme/readability.test.ts` is never collected — and has been
  failing independently of this lane's changes (verified against a stashed tree).

## 9 · Founder actions

1. **Put `.github/workflows/` on `wt-web`.** Three workflows exist and none is
   armed. Until then `workflow_dispatch` is the only trigger that works.
2. **Deploy the integration branch.** Production is 8 days behind, runs one cron
   of three, and has no heartbeat at all.

   Until that happens, **`post-deploy-smoke` will be RED on every production
   deploy**, because `probe-crons.mjs` exits 1 at 1/3 reachable. That redness is
   the accurate state of production and not a broken check — but an always-red
   check is one people mute, which is the exact cry-wolf failure §4 just fixed in
   the same workflow. Item 2 is what clears it. If it cannot be done soon, prefer
   turning the cron step off deliberately over letting the team learn to ignore
   a red tick.
3. **Enable GitHub Pages** with source "GitHub Actions", or the status page job
   fails at its deploy step.
4. **Decide on a phone rail** (Twilio/Gupshup account + number) if email is not
   enough.
5. **Clear the two NULL `ops_admins` rows**, which grant nothing and read as seats.
6. **Rotate the secrets** — see docs/36 for the copy count.
