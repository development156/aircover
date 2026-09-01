# Handoff — divas — wt-divas2 — 2026-09-01

**Branch** `wt-divas2` at `40c232e1`, which is `lane-sync`'s merge of `wt-core`
(the lane was **138 behind**) on top of `03499609`, this handoff and the two mesh
guards it describes writing. The Studio work it reports ends at `bb117725`.
Lane `wt-divas2`. Pushed: yes.

In plain terms: the picture Studio now lets you choose which of three drawing
engines makes your picture, and that choice changes what the screen will let you
ask for. The database change is live in production. The browser test suite still
has not been run anywhere, and that is the one thing this lane cannot fix on its
own.

## What shipped

| What | Proof | Test that covers it |
| --- | --- | --- |
| A model picker on the Studio: three models, one per family | `apps/web/src/components/studio/model-picker.tsx:29` | `studio-workbench.test.tsx` — "choosing which model draws it" (4 tests) |
| The catalogue itself, every figure fetched from OpenRouter's own model page 2026-08-31 | `apps/web/src/lib/studio/models.ts:86` | `models.test.ts` (26 tests) |
| The mesh will only address those three ids | `packages/mesh/src/routing.ts` `ALLOWED_IMAGE_MODELS` | `routing.test.ts` — "refuses an id nobody allow-listed, however plausible it looks" |
| The picker and the router can never drift apart | `models.test.ts:180` | "every model on offer is one the mesh will address" + its inverse + a length check |
| The chosen model reaches the provider, and an unlisted one never does | `chooseImageModel` in `packages/mesh/src/routing.ts:157`, called by `planImage` | `routing.test.ts` — "silently uses the tier's own model when the request asks for one we do not allow" |
| Choosing a model changes what the screen allows | `ruleFor(mode, modelId)` in `apps/web/src/lib/studio/modes.ts` | `modes.test.ts` — Series is refused on a model that draws one at a time |
| The model id is written at request time, not at read time | `queueGeneration` in `apps/web/src/app/actions/studio.ts` | `studio-actions.test.ts` |
| The catalogue may never claim a feature that is ours | `models.test.ts:164` | "no model claims a feature that is actually ours" |

MEASURED: `bb117725` and `3a70f361` are the two commits that carry all of the
above. 106 files changed against `origin/wt-core`, 10978 insertions.

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN, not passed — but for the first time it was
  actually DISPATCHED and the reason is now measured rather than assumed.**
  Chromium in this sandbox cannot complete any outbound HTTPS request (CLAUDE.md
  records the six measurements) and every `@smoke` spec signs in through Clerk,
  so CI is the only route. The GitHub connection came back partway through this
  session and I dispatched `gate.yml` on `wt-divas2` with
  `ack_target=rloztdhzfliyvpvxsgjl`. **Run 1194 (id `33489860396`).** The smoke
  job reached its guard step and exited 1 in **under one second**. Full finding
  under Gate. The suite still has not executed a single test.
- **`wt-core` push not done.** `lane-sync push` prints the gate to run before it;
  the gate is **not green** on two legs, neither of them this lane's, and my brief
  forbids pushing to another branch without explicit permission. Asked once, not
  granted, not worked around.
- **`packages/db/tests/live-guard.test.ts` left RED and untouched.** It is a
  guard written after a production write incident, `packages/db` is `wt-db`'s by
  the CLAUDE.md rule, and making it green is a judgement about the secrets that
  were just added rather than a test fix. Written up in full under Gate.
- **`ops/state/changelog.pending.json` and `ops/state/qa.pending.json` restored,
  not committed.** They are scratch queues drained by the sync and gate hooks;
  the pre-commit hook refuses `qa.pending.json` by name, and the changelog entry
  in the file belongs to another lane. Left as the working tree found them.
- **No component tests for `discard-generation.tsx`, `draw-canvas.tsx`,
  `draw-modal.tsx`.** Their pure halves (`draw-objects.ts`, `draw-render.ts`) are
  covered; the components are not.
- **Generation is still synchronous** inside the server action, and
  `image_tier` and `seed` are still written null. Both are honest nulls, not
  placeholders.

## Shared surfaces touched

Every one of these is consumed by another lane. **A required field breaks
constructors, not readers** — none of the additions below is required.

| Surface | Change | Who it breaks |
| --- | --- | --- |
| `packages/shared` `GENERATION_MODES` | gained `'edit'` | nobody: exhaustive `switch`es over it must add a case, and none exist outside this lane (MEASURED by grep) |
| `packages/shared` `ImageGenerateInputSchema` | gained `dims`, `references` (max 16), `modelId` — **all optional** | nobody |
| `@sahoda/mesh` | **new exports** `ALLOWED_IMAGE_MODELS`, `isAllowedImageModel`, `chooseImageModel` | nobody; additive |
| `packages/mesh` `planImage` | gained a second optional argument | nobody; callers unchanged |
| `packages/shared/tokens.css` | **two new tokens** `--photo-ink`, `--photo-ink-edge`; inline copy regenerated with `scripts/gen-tokens-inline.mjs` | nobody, but a lane editing `tokens.css` will conflict on the file |
| `apps/web` `MAX_REFERENCES` | meaning changed 3 → 14 → 16; it is now the OUTER bound and the per-model cap is the binding one | Studio only |
| `scripts/js-budget.mjs` | the `/(app)/studio` key moved twice (643392 → 749730 → 761123) | nobody; single-line in-place edits, no other route's drift baked in |
| 39 old-Studio files | deleted | nothing imports them (MEASURED: typecheck green) |

## Contract, migration or money

- **`packages/db/supabase/migrations/20260829210000_studio_generations.sql` is
  APPLIED to production** (ref `rloztdhzfliyvpvxsgjl`). Verified structurally
  after the fact: RLS on for both tables, **zero policies for `anon`** on either,
  the images table carries SELECT and INSERT only, and the deletion-reach guard
  lists it independently. The `mode` check constraint includes `'edit'`.
- **One qualified UPDATE on `supabase_migrations.schema_migrations`.** The MCP
  `apply_migration` had recorded the version as `20260830172106` while the file
  on disk is `20260829210000`, so a later `db push` would have re-run it. Fixed
  with a single row-qualified UPDATE. No DROP, no TRUNCATE, no unqualified
  statement was run at any point.
- **Money:** `queueGeneration` takes a `withCredits` hold **per picture** and
  stops at the first failure, so a run that dies halfway charges for what it
  drew and nothing more. A throw inside the callback releases the hold. No price
  was invented: everything reads `pricing.config.json`.

## Guards written, and the mutation that proved each

Each of these was mutated, the mutation **grepped for in the file to prove it
landed**, the suite run, and the red watched. That grep step is new this session
and it caught four mutations that had not actually applied.

**Two of these guards were written because writing this handoff found they did
not exist.** The allow-list is a SPENDING boundary — a model id now arrives from
a request, and an unvetted one would bill this account against any model on
OpenRouter — and it was covered only indirectly, through the Studio catalogue
test importing the constant. Nothing exercised the refusal itself. The vetting
also lived inside a closure in `createMesh`, where no test could reach it; it is
now `chooseImageModel` in `routing.ts`, exported and pure, because a closure
nobody can call is a boundary nobody can prove.

| Guard | Mutation applied | Result |
| --- | --- | --- |
| `models.test.ts` "every model on offer is one the mesh will address" | removed `openai/gpt-image-1` from `ALLOWED_IMAGE_MODELS` | RED, 2 tests |
| …its inverse | added a fourth id to `ALLOWED_IMAGE_MODELS` only | RED, 2 tests |
| "a number in the unlocks line is a number the model actually carries" | changed Seedream's copy from 4 to 5 | RED, 1 test |
| "a model that draws one at a time never claims to draw a set" | gave Gemini "in one go" copy at `maxPerPress: 1` | RED, 1 test |
| "no model claims a feature that is actually ours" | added "layers and annotation" to a `goodAt` | RED, 1 test |
| "the default is a model we can actually reach" | flipped the first model to `routed: false` | RED, 2 tests |
| `routing.test.ts` "refuses an id nobody allow-listed" | loosened `isAllowedImageModel` to a trimmed, case-insensitive match | RED, 1 test |
| `routing.test.ts` "silently uses the tier's own model…" | made `chooseImageModel` pass the requested id straight through | RED, 1 test |
| `modes.test.ts` model-aware Series rule | dropped the `model.maxPerPress > 1` term from `ruleFor` | RED, 4 tests |
| `modes.test.ts` reference cap | changed `Math.min` to `Math.max` | RED, 3 tests |
| canvas aspect ratio | **first attempt stayed GREEN** — the assertion checked the shape `/^\d+ \/ \d+$/`, which `1 / 1` satisfies. Rewritten to assert the chosen format's actual numbers, re-mutated | RED, 2 tests |
| `ai-zero-balance.test.tsx` | scoped to `findByRole('alert')` after a model description broke its uniqueness; mutated the alert away | RED |

## Anything retracted

- **"Seedream 5.0" does not exist on OpenRouter.** MEASURED: fetching
  `bytedance-seed/seedream-5-0` returns NOT FOUND. Only **5.0 Lite** is
  addressable, and that is what shipped. I did not ship an id I had not fetched.
- **Layers and annotation are NOT model features.** They are our own code in
  `draw-objects.ts` and `draw-render.ts` and arrive whichever model is chosen. A
  test now fails if any model's copy claims one.
- **Two WebFetch reads of OpenRouter's model list were mutually inconsistent and
  partly fabricated** (malformed ids, a provider that does not exist). Both were
  discarded; every id in the catalogue was then fetched from its own model page
  individually and cross-checked against `docs/43 §3`.
- **`openai/gpt-image-1` draws 10 per request and takes 16 references.** Both
  were blank in `docs/43`. This is NEW and it changes the product: a matching set
  is no longer Seedream's alone.
- **The `@sahoda/jobs` gate failure is not this lane's.** MEASURED: my commits
  touch **0 files** under `apps/jobs`; the last change to that area is
  `4525a3ab feat(publishing): [contract] keywords replace hashtags`, which
  `git merge-base --is-ancestor` confirms is already in `origin/wt-core`.
  INFERRED: it arrived here through the `f2cec6b0` merge.

## What the next session in THIS lane should pick up

1. **`@smoke` is still the single largest unknown, and it is now a settings
   problem with a measured shape rather than a guess.** Do not re-dispatch until
   somebody has confirmed the three names read back on the SECRETS tab of
   `development156/aircover`. See Gate for exactly what the runner saw. Do not
   un-skip a spec that skipped for want of a key, and do not inline one.
2. **Two red legs block `wt-core` taking this lane**, and neither is this
   lane's to fix: `@sahoda/jobs` is trunk's, and `@sahoda/db`'s live-guard is a
   `wt-db` decision about the newly-added ambient secrets. Both are written up
   under Gate below. Do not narrow either guard to get green.
3. **Make generation asynchronous.** The server action still waits on the model
   inside the request. A slow model is a timeout today.
4. **`image_tier` and `seed`** are null on every row. The column exists because
   somebody will want to reproduce a picture.
5. **Component tests** for `discard-generation`, `draw-canvas`, `draw-modal`.

## Gate

MEASURED 2026-09-01 on `wt-divas2` at `40c232e1`, **after** `lane-sync` took the
138 commits of `wt-core` this lane was behind. `--force` on every leg, so nothing
is a cache replay, and nothing was piped.

| Leg | Result |
| --- | --- |
| `turbo run typecheck lint test --force` | **24 of 27 tasks passed**; `@sahoda/jobs#test` FAILED, and two more were killed with it |
| `@sahoda/web` alone | **PASS** — 576 files passed / 3 skipped, 7592 tests passed / 13 skipped |
| `@sahoda/mesh` | PASS — 219 passed (27 files) |
| `@sahoda/shared` | PASS |
| `@sahoda/publishing` | PASS |
| `@sahoda/sites` | PASS |
| `@sahoda/billing` | PASS |
| `@sahoda/research` | PASS |
| `@sahoda/jobs` | **FAIL** — 1 failed / 408 passed (409) |
| `@sahoda/db` alone | **FAIL** — 1 failed / 836 passed / 207 skipped (1044). Passes on CI, see below |
| `prettier --check .` | PASS |
| Playwright `@smoke` | **UNRUN** — dispatched, refused at the guard in under a second |

**Note on reading the log.** Turbo reported `@sahoda/db` and `@sahoda/web` with
an `[ELIFECYCLE] Test failed` line when jobs died, and both were re-run alone for
a number worth quoting. Web is green; db is red for its own separate reason. A
grouped turbo log is not a per-package result.

### The two failures, and whose they are

**1 — `@sahoda/jobs`, and it is `wt-core`'s.**

```
FAIL src/publish/x-ration.test.ts > the X monthly ration, on the publish path
  > an UNREADABLE count refuses transiently — it neither spends nor gives up
AssertionError: expected { Object (code, classification, ...) } to match object
  { "classification": "transient",
-   "code": "X_MONTHLY_RATION_UNREADABLE",
+   "code": "PER_DAY_CAP_UNREADABLE" }
  src/publish/x-ration.test.ts:279:34
```

MEASURED: my commits touch **0** files under `apps/jobs`. MEASURED: it still
fails identically after taking the 138 newest `wt-core` commits, so it is not
something an older checkout of trunk had already fixed. INFERRED: it arrived
through `4525a3ab feat(publishing): [contract] keywords replace hashtags`, which
`git merge-base --is-ancestor` confirms is already in `origin/wt-core`.

**CONFIRMED ON A CLEAN RUNNER, which settles the attribution.** The gate ran on
CI for three states of this lane:

| Run | SHA | State of the lane | Result |
| --- | --- | --- | --- |
| 1170 | `bb117725` | all the Studio work, **before** taking `wt-core` | **success** |
| 1191 | `40c232e1` | the same work **after** `lane-sync` merged `wt-core` | failure |
| 1195 | `19ad847f` | this handoff on top | failure |

Same assertion, same file, same counts on the runner as in this sandbox: `1
failed | 408 passed (409)`, `Failed: @sahoda/jobs#test`, `24 successful, 27
total`. **This lane was green until it took trunk in, and the merge is the only
thing that changed.** MEASURED, not inferred.

**2 — `@sahoda/db`, and it is NEW TODAY because the secrets were added.**

```
FAIL tests/live-guard.test.ts > live-test guard
  > does not read the repo-root .env while the flag is absent
AssertionError: expected 'postgresql://postgres:…' to be ''
  tests/live-guard.test.ts:31:23
```

**The dangerous property is INTACT and this is not a live run.** MEASURED:
`SAHODA_ALLOW_LIVE_TESTS` is absent, so `LIVE` is false, so `loadEnv` never ran
and `hasLedgerEnv` and `hasRlsEnv` are both false. No suite touched production.

What actually changed is narrower than the test's name suggests. The guard was
written to assert that **no credential enters the process at all** while the flag
is off, and it checked that by reading `process.env.SUPABASE_DB_URL`. That was a
sound check while the only route in was the repo-root `.env`, which `loadEnv`
gates. It is no longer sound: `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are now **exported into the process ambiently** by the cloud environment, from
the secrets added this week. MEASURED: both are set in this shell; a repo-root
`.env` also exists.

So the assertion is false for a reason the code cannot control, and the guard is
doing exactly what a guard should. It went red the moment the ground moved.

**CONFIRMED by the same CI runs, which is the cleanest possible check on this
diagnosis.** `@sahoda/db` **passes on CI** — runs 1191 and 1195 name
`@sahoda/jobs#test` as the only failure out of 27 tasks. The runner has no
ambient `SUPABASE_DB_URL`, so the credential the guard objects to is not there
and the assertion holds. It fails here and passes there because of the
environment, exactly as diagnosed, and NOT because of anything in the diff.

**I did not change it.** It was written after a run that wrote to production on
2026-07-27 (`docs/audit/2026-07-27/04-risks-and-unknowns.md` R-01), and narrowing
it to keep a suite green is the precise move that incident was about. It belongs
to whoever owns `packages/db`, and the decision is theirs: either the ambient
export is itself the thing to remove, or the guard's second assertion narrows to
the claim it can still make (the FLAG closes the gate) while the "no credential
in the process" claim is retired as no longer true. **`packages/db` is also not
this lane's to edit** — the CLAUDE.md rule is that only `wt-db` touches it.

**One thing to fix regardless of which way that goes:** the failure output prints
the production database connection string, password included, into the test log.
Anywhere that suite runs red with the secret set, the credential lands in a CI
log. That is worth a `toBe('')` that reports a length rather than a value.

### The smoke job, dispatched at last, and what it measured

The GitHub connection returned partway through this session, so the dispatch that
was impossible earlier became possible. **Run 1194, id `33489860396`, on
`wt-divas2` at `40c232e1`, `ack_target=rloztdhzfliyvpvxsgjl`.** The smoke job
installed, reached step 6 `Refuse without the keys the suite needs`, and exited
1 at `09:00:03`, the same second it started. `Install Chromium` and `Run the
smoke suite` were skipped. **No test has executed.**

The guard prints both namespaces it checks, and this is the whole finding:

```
env:
  CLERK_PUBLISHABLE:
  CLERK_SECRET:
  SUPABASE_URL:
  VAR_CLERK_PUBLISHABLE:
  VAR_CLERK_SECRET:
  VAR_SUPABASE_URL:
##[error]Not readable as repository secrets: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY NEXT_PUBLIC_SUPABASE_URL
```

MEASURED: all six are empty. The first three are `secrets.*`, the last three are
`vars.*`, so the guard has already ruled out the Variables tab — the values are
in **neither** namespace at repository scope.

**INFERRED, and it fits what was said in this session.** The environment secrets
were reported added first, and repository secrets reported second. This job
**declares no environment, by design**, so an environment secret cannot reach it
however correctly it is set. The reading that matches the evidence is that the
three names still live under Settings → Environments, or were added to a
different scope, rather than under Settings → Secrets and variables → Actions →
**Repository secrets**.

**One thing worth checking first.** MEASURED: the runner's workspace is
`/home/runner/work/aircover/aircover` and every job URL is
`github.com/development156/aircover/…`, while `git remote -v` here says
`development156/sahodalabs`. The repository's canonical name is **`aircover`**
and `sahodalabs` is a redirect from a rename. Both URLs land on one repository,
so this is probably not the cause — but the Settings page to confirm the three
names on is the `aircover` one, and if a second repository named `sahodalabs`
also exists, secrets added there would never reach these runs.

**Not worked around, and deliberately so.** No key inlined, no guard relaxed, no
spec un-skipped. The CLAUDE.md rule is that an absent required variable is a
settings problem to report, because a suite that ran nothing reports as passing,
which is how twenty-six billing tests never executed for months.

**Look at it:** the Studio is at
`https://sahodalabs-git-wt-divas2-development-4417s-projects.vercel.app/studio`.
That is the lane's preview and shows this branch's newest build. It is **not**
`https://app.sahodalabs.com`, which still carries the previous Studio, because
nothing here has been promoted.
