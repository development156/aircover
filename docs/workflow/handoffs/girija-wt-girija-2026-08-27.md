# Handoff — girija — wt-girija — 2026-08-27

**Owner** girija · **Lane** wt-girija · **Branch** `claude/lead-research-tz63ld` at `7780ef8`,
12 commits beyond `wt-core` `3137bc3`. PR #13, draft, open.

Replaces the Stop hook's automatic skeleton. That file listed WHAT changed; this one is
the WHY, plus the three things a skeleton cannot know: what was not done, which guards
were proved by mutation, and which gate legs never ran.

---

## What this lane did

Two things, in order.

**The Marketing Brain learned whether the work worked.** It could describe how a business
writes (`tone_drift`) and how much it corrects Sahoda (`edit_distance`). Neither says
whether any of it worked. MEASURED against production: 132 rows of `post_metric_snapshots`
and 46 of `audience_snapshots` had been collected and **never read by the brain**. Three
new observation kinds now read them: `channel_return`, `audience_growth`, `format_effect`.

**The product got somewhere to record where a business actually is.** `workspaces` gains
`timezone`, `business_model`, `regime`, `locale`.

---

## Decisions a later session must not re-litigate

**Three columns, not one `category`.** `docs/55` step 4 asks for `workspaces.category`.
That vocabulary already exists as `BUSINESS_MODELS × REGIMES × LOCALES` in
`apps/web/src/lib/onboarding/intake.ts`, is already asked for at onboarding, and is
already persisted inside `brand_memory.payload.intake`. A bakery and a caterer share a
regime and differ in model. Collapsing three axes to one would lose an axis or invent a
second taxonomy for a fact we already capture.

**Nothing is defaulted.** MEASURED before writing the backfill: of 33 workspaces, ONE
carries a timezone anywhere (a demo seed, inside `settings`) and TWO have an intake. NULL
means nobody has told us. A default of `UTC` or `Asia/Kolkata` would convert 30 silences
into confident claims about where somebody lives.

**The receipt rule is conditional, not loosened.** Every observation cites the posts it
was computed from. `audience_growth` is not computed from posts, so citing them would
imply those posts caused the follower change, which was never measured. The contract
refuses a row in BOTH directions.

**`timezone` rides on `WorkspaceOption`.** The first version read it in its own query and
`read-waterfall` failed it: /settings went 7 to 8 sequential reads. Regenerating the
baseline was the wrong fix. The shell already reads and memoises that row per request, so
one short column costs no latency where a second read cost a full round trip.

---

## The contradiction this lane found and did not fix

MEASURED 2026-08-26: `Asia/Kolkata` is hardcoded **38 times across 29 non-test files**,
while the scheduling INPUT runs on the browser's own zone (`schedule-choices.ts` calls
`setHours`, which is host-local). A customer in Dubai picks "tomorrow morning", gets 9:00
Gulf time as the stored instant, and the list reads it back as "11:30 am IST".

`loop_settings.plan_at_minute` has stored a workspace-local wall-clock minute since
`20260820000200` with no zone to interpret it in, and has **zero runtime readers** for
exactly that reason.

The column now exists. Replacing those 38 sites is its own change and needs the column
populated first.

---

## Production

`20260826200000_workspace_timezone_and_intake` is **APPLIED** to `rloztdhzfliyvpvxsgjl`
with the founder's explicit authorisation, and verified after: 33 workspaces, 1 timezone,
2 of each intake axis, 30 left NULL. `get_advisors(security)` reports 0 findings naming
any new object, and `refuse_unknown_timezone` does not join the 16
`function_search_path_mutable` warnings because the migration pins its search path.

The trigger was then shown to fire ON PRODUCTION, not only in the test harness: setting
`Asia/Kolkatta` raises `22023` and writes nothing.

Three earlier migrations widening the `marketing_observations.kind` CHECK are also
applied, 0 rows to validate each time.

### FOUR repo migrations have never reached production

Found while applying the above, because `workspaces.deleted_at` did not exist:

| Migration | What it carries |
| --- | --- |
| `20260823000000_dpdp_erasure` | the entire "Delete everything" feature and `erase_workspace` |
| `20260823020000_ops_owner_count_requires_a_linked_user` | |
| `20260823020100_clerk_webhook_stops_flooding_the_audit_log` | |
| `20260824200000_reprice_plans_from_business_model_deck` | a pricing change |

**None is this lane's to apply.** Judge "is it applied" by NAME, not version: the Supabase
MCP stamps its own apply-time version, so `20260825000000` in the repo is `20260825201932`
in production.

Because of the first, `20260826210000_workspace_profile_cleared_on_erase` is written but
**cannot be applied**. It exists because `erase_workspace` blanks `settings`, which is
where the one existing timezone lives: promoting that value into a column the erasure does
not touch would have quietly weakened a deletion promise, inside a migration that is not
about deletion. Nothing is unprotected today, because production has no erasure at all.

---

## Guards, and the mutations that proved them

**33 mutations across three commits, every one shown red.** Three came back GREEN first
and each was a finding rather than a bad mutation. Those three are the ones worth
remembering:

1. **A cross-post test that could not fail.** Removing `distinct on (p.id)` from
   `readFeaturedPosts` left the test green, because the fixture created only one variant.
   Added `givenSecondVariant`; the mutation now goes red.
2. **A trigger condition nothing exercised.** Replacing the erasure trigger's
   `deleted_at is not null and old.deleted_at is null` with `if true` left every test
   passing, because nothing had ever written `deleted_at` on a workspace that was not
   being erased. Added the restore-path test.
3. **A guard enforced by an accident.** Deleting the `!data` check in
   `setWorkspaceTimezone` left every test green: `data` was null, reading `.timezone`
   threw, and the catch produced the SAME sentence as the error arm. One
   `data?.timezone ?? null` later it would have reported success on a write RLS refused.
   The no-row arm now has its own sentence.

`workspaces-contract.pglite.test.ts` is new and general: it boots the real migrations and
compares the `workspaces` columns to `WorkspaceSchema`, and the CHECK lists to the
onboarding constants. It immediately found that `deleted_at` had been on the table since
2026-08-23 and never in the zod schema, because nothing compared the two.

---

## Gate

Cold, `TURBO_FORCE=true`, 0 cached, at `7780ef8`:

| Leg | Result |
| --- | --- |
| `turbo typecheck lint test` | **PASS** — 27/27 tasks, apps/web 5,055 passed, 378s |
| `prettier --check .` | **PASS** |
| `turbo build` | **PASS** |
| `vitest run` (root) | **FAIL, not this lane's** — 2 tests in `scripts/lib/mutation-harness.test.mjs`. Both assert a directory chmodded `0o500` refuses a write; this sandbox runs as uid 0, where it does not. Verified identical on a clean HEAD by stashing. |
| `turbo test:smoke` | **UNRUN** — Chromium here completes no outbound HTTPS request and every `@smoke` spec signs in through Clerk. REQUESTS §25 carries the six measurements. |

**The smoke leg must be run where Chromium has normal egress before this lane merges.**

### GitHub Actions was down for the whole session

Every `gate` job in this repository, on every branch, settled in 2 to 17 seconds with
`runner_id: 0`, an empty `runner_name` and logs returning HTTP 404. No machine was ever
assigned. Confirmed repo-wide across four branches at 18:44Z and last checked at 01:45Z,
by which point no job had even entered the queue since 20:44Z. One standing-down comment
is posted on PR #13; the one permitted re-run is spent. **The red mark on PR #13 is the
queue, not the code.** Vercel built and deployed every head to Ready throughout, which is
independent evidence the code compiles.

Read the JOB record, never the run's wall-clock duration: a run's clock includes queue
time, and that misread cost two wrong reports earlier in the day.

---

## What was NOT done

- The smoke leg, above.
- `20260826210000` is not applied and cannot be until `dpdp_erasure` is.
- Nothing writes `timezone` except the settings field. Onboarding does not ask.
- The 38 hardcoded `Asia/Kolkata` sites are untouched.
- **Flagged, not fixed:** `renameWorkspace` collapses its error and no-row arms into one
  sentence, the same latent defect mutation 3 above found in `setWorkspaceTimezone`. Left
  alone because its copy is pinned by other tests; fix it in a commit that moves those.
- `docs/55` steps 5 (`leads.post_id` attribution), 6 (move `tone_drift` to the Brand Brain,
  now unblocked), and 7 through 11.

## Anything needing a decision

The four unapplied migrations. The DPDP one is the one to act on first: if the "Delete
everything" button ever reaches production without it, it fails on a legal obligation.
