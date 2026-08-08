# Staging project — plan (SL-043)

**Status:** open, top of the board. **Promoted 2026-07-30 by DIVAS**: blocking *now*, not
"when a customer exists". There already are **26 real workspaces and 17 real users** on the
database this plan is about.

---

## 1. The problem, three ways in

All three are the same root cause: there is exactly **one Supabase project**,
`rloztdhzfliyvpvxsgjl` (`sahodalabs`, ap-south-1), and it serves local development, CI,
Vercel previews and production simultaneously.

| # | Symptom | Evidence |
|---|---|---|
| a | Local tests reached the production database, and an operator could not stop them from the shell | R-01, `docs/audit/2026-07-27/04-risks-and-unknowns.md` |
| b | Every migration is a production migration, with no rehearsal | 23 applied migrations, none ever replayed onto an empty database |
| c | Every Vercel **preview** deployment reads and writes the live database | SL-049, verified via `vercel env ls` |

(c) is the sharpest. Each of the five Supabase variables exists as **one row scoped
`Preview, Production`** — a single shared value, no preview override — and there is no second
project a preview could point at. Meanwhile `docs/TEAM_ONBOARDING.md` tells non-technical
teammates that "visual checks happen on the Vercel preview URL", and `CLAUDE.md` repeats it for
cloud bug-fix sessions.

So a teammate clicking through a preview to check a fix can spend real credits, create real
posts, sites and themes, and mutate a paying customer's workspace. `credit_ledger` is
append-only, so those debits are **permanent**.

The irony worth recording: the R-01 guard now refuses to let an automated *test* touch this
database, while our own onboarding actively directs a *human* to it.

---

## 2. Cost — measured, not estimated

Queried against org `sahoda` (`ynxbouzhssxjaucognow`) on 2026-07-30:

| Option | Price |
|---|---|
| A second **project** | **$0 / month** |
| A persistent **branch** | $0.01344 / hour ≈ **$9.80 / month** if always on |

A standing staging project is both cheaper and simpler than branching. **Cost was never the
obstacle — nobody had checked.**

---

## 3. What has to move

1. **Create `sahoda-staging` in `ap-south-1`.** Same region deliberately: the direct database
   host is IPv6-only and the pooler is not, and that difference has already cost a day of
   debugging. Staging should reproduce production's network shape, not a friendlier one.
2. **Replay all 23 migrations** with `supabase db push` against the new ref. They live in
   `packages/db/supabase/migrations` and apply clean from empty — *that replay is the rehearsal
   we have never had*, and is worth doing for its own sake even before anything points at it.
3. **Recreate the `qa-artifacts` bucket** (migration 12 does this as part of the replay).
4. **Seed `ops_*` only** — owners from `ADMIN_BOOTSTRAP_EMAILS`, roadmap, tasks.
   **No customer data.** Copying real workspaces into staging would recreate the exposure in a
   new place with weaker access control.
5. **Split the Vercel variables.** Each of `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_DB_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_PROJECT_REF` is currently one
   row scoped `Preview, Production`. Each becomes two rows: **Preview → staging**,
   **Production → prod**. *This is the change that actually closes SL-049.*
6. **Point local `.env` at staging** so `packages/db` tests stop touching production.
7. **Clerk**: preview must use the Clerk **development** instance, or preview sign-ups create
   real users against the production instance and the split is only half done.
8. **Flip the R-01 guard's meaning.** It currently *aborts* when tests target production. After
   the split it should *assert* the target is staging — so a mis-scoped variable fails loudly
   instead of silently pointing somewhere new.

---

## 4. What breaks in the interim

The honest list. None of these are reasons not to do it; they are the work.

- **Preview URLs lose all real data.** Visual checks against "the 26 workspaces" stop working.
  Whoever reviews previews needs seeded fixtures, and **`docs/TEAM_ONBOARDING.md` must be
  rewritten in the same PR** — otherwise teammates will report the empty preview as a bug.
- **`/admin` on preview reads staging's `ops_*` tables**, so the board, changelog and QA console
  look *empty* there until seeded. Interacts with SL-048 (`OPS_INGEST_URL` absent from Vercel).
- **Migrations now apply twice** — staging first, then production. That is the entire point, but
  it is new discipline and **drift is the failure mode**. `migration_integrity.test.ts` should
  run against both.
- **Any test assuming pre-existing production rows breaks.** The `ops_*` suites create and clean
  up their own fixtures, so they are fine; the ledger suites need checking.
- **Two sets of credentials** to rotate and keep straight.

---

## 5. Done when

- A preview deployment **cannot** reach the production database — verified positively by reading
  a row on preview that exists *only* in staging, not merely by inspecting configuration.
- The full gate passes against staging with `SAHODA_ALLOW_LIVE_TESTS=1`.
- `docs/TEAM_ONBOARDING.md` tells the truth about what a preview URL is.

**SL-049 closes with this card.** Do not fix it separately — it is a symptom, and fixing the
symptom would leave the shared database in place.
