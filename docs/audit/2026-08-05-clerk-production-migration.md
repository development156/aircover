# Clerk dev → production migration — design

**Status:** design only. Nothing was changed. No Clerk setting, no key, no row.
**Measured against production (`rloztdhzfliyvpvxsgjl`) on 2026-08-05.**

---

## 1. What we have today

Production runs a Clerk **development** instance:

- publishable key `pk_test_…`, decoding to `leading-hyena-7.clerk.accounts.dev`
- `apps/web/src/lib/supabase/server.ts` uses Clerk's **third-party integration**, not a
  JWT template: the default session token rides every Supabase call and Clerk injects
  `role: authenticated` into it.

That second point is the one that shapes everything below. There is no template in the
path, so there is **no place to rewrite the `sub` claim**. Whatever id Clerk mints is the
id Postgres sees.

### Identity coverage — all 17 users are recoverable

| Fact | Count |
|---|---|
| `workspace_members` rows | 18 |
| distinct `user_id`s (real people) | **17** |
| ids in Clerk's `user_…` shape | 17 / 17 |
| have a `users_profile` row | 18 / 18 |
| **have an email address** | **18 / 18** |
| have a display name | 15 / 18 |

Every single user has an email. Nobody is unrecoverable, and no identity has to be
guessed at or abandoned.

> Not yet known, and **step 0 below exists to find out**: how many sign in by OAuth
> versus password. It changes the user-facing experience, not the plan.

### Blast radius — 14 columns, 128 rows

Every table storing a Clerk subject, with live row counts:

| Column | Rows |
|---|---|
| `posts.created_by` | 49 |
| `workspace_members.user_id` | 18 |
| `users_profile.user_id` | 17 |
| `workspaces.created_by` | 17 |
| `brand_memory.created_by` | 10 |
| `workspace_themes.created_by` | 5 |
| `sites.created_by` | 5 |
| `ops_admins.user_id` | 5 |
| `connections.created_by` | 2 |
| `tour_progress.user_id` | 0 |
| `inbox_threads.assigned_to` | 0 |
| `inbox_messages.author_user_id` | 0 |
| `ops_beta_applications.clerk_user_id` | 0 |
| `ops_copy_watermarks.user_id` | 0 |
| **Total** | **128** |

128 rows is small enough to rewrite in one transaction. That is what makes the
straightforward plan viable and the clever plan unnecessary.

---

## 2. Can Clerk import users with their existing ids?

**No.** Clerk's Backend API `POST /v1/users` accepts `email_address`, `password`,
`first_name`, `last_name`, `external_id` and metadata — it does **not** accept `id`.
User ids are minted server-side and cannot be chosen.

What it does give us is **`external_id`**: a field we control, intended for exactly this.
Setting `external_id` to the OLD dev id makes every new user permanently carry a
verifiable pointer back to who they were, which is what turns the remap below from a
one-way write into something auditable and reversible.

**A second constraint, and it is the one users will feel:** Clerk does not export
password hashes. A password-based user cannot have their password carried across and
must go through a reset. An OAuth user is matched on email at first sign-in and notices
nothing. Step 0 tells us how many of each we have.

---

## 3. What breaks if ids change and nothing else does

Every RLS policy in the schema resolves identity through `auth.jwt() ->> 'sub'`, either
directly or via `app.member_workspace_ids()`. If the id changes and the rows do not:

- `workspace_members` matches nothing → **`app.member_workspace_ids()` returns empty**
- every workspace-scoped policy therefore denies
- the user signs in successfully and sees **an app with no workspaces, no posts, no
  connections, no wallet**

The critical part: this does **not** raise an error. It is a clean, quiet, total loss of
access that is indistinguishable from having been wiped — for all 17 users at once.

And `ops_admins` (5 rows) fails the same way, so `/admin` — the tool you would reach for
to investigate — locks out at the same moment. **Nobody would be able to log in and fix
it from inside the product.**

---

## 4. The plan

**Chosen approach: remap the database in one transaction.**

The alternative — an `app.current_user_id()` indirection resolving new ids to canonical
ones through a permanent mapping table — was considered and rejected. It avoids rewriting
rows, but it puts a lookup in front of *every one of the 63 policies*, forever, to solve a
problem that involves 128 rows exactly once. The complexity would outlive the migration by
years.

### Step 0 — inventory (read-only, no change)

Against the **dev** instance's Backend API, list all users and record for each: `id`,
primary email, and sign-in methods (OAuth providers vs password). Two outputs:

- the count of password-only users → the size of the "you'll need to reset" email
- a 17-row manifest that every later step is checked against

Stop here and read it. If any user has no email, the plan changes; today none do.

### Step 1 — build the production instance (no cutover)

Create the Clerk production instance and configure it to match: restricted mode (nobody
signs up without an invitation), the same OAuth providers — which need **new client
ids/secrets registered with Google/Meta against the production domain** — and DNS records
for `clerk.<domain>`. Nothing is swapped; the dev instance keeps serving.

### Step 2 — import users, carrying the old id in `external_id`

For each of the 17: `POST /v1/users` with the email, the name, and
`external_id = <dev user id>`. Record the new id.

The artifact is a 17-row map, `old_id → new_id`, which is checked against the step-0
manifest before anything is applied: **17 in, 17 out, no duplicates on either side.** A
mismatch stops the migration.

### Step 3 — rehearse on staging

Staging carries the same 34 migrations and the same schema. Apply the remap there against
synthetic ids and assert:

- the transaction touches exactly the expected row count per column (the table above)
- afterwards, a JWT bearing a NEW id resolves `app.member_workspace_ids()` to the same
  workspaces the OLD id did
- the anon RLS suite still passes

This is the step that proves the transaction before it meets real people.

### Step 4 — cutover

Short window, announced in advance. Sign-ins during it would create rows under new ids and
strand them, so the window must be closed rather than merely quiet.

1. Put the app into maintenance (or accept a few minutes of failed requests)
2. Back up the 9 non-empty tables
3. Run the remap as **one transaction**: every column updated from the map, then a
   verification `SELECT` inside the same transaction confirming zero remaining rows carry
   a dev-era id. Commit only if that returns zero
4. Swap `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in Vercel to the
   `pk_live_`/`sk_live_` pair
5. Repoint the Supabase third-party auth provider at the new Clerk domain — **this is easy
   to forget and fails closed**: the old issuer's tokens stop verifying and every request
   is denied
6. Redeploy
7. Sign in as one real user and confirm their workspace, posts and connections are there

### Step 5 — the people

- **OAuth users:** sign in normally; matched on email; notice nothing.
- **Password users:** must reset. Send this *before* the window, not after — "your
  password stopped working" arriving unexplained is how a customer concludes they have
  been hacked.
- Both groups keep everything they own, because the rows moved with them.

### Rollback

The map is persisted and the transaction is reversible by inverting it. Rolling back means:
restore the keys, run the inverse remap, repoint Supabase. Because `external_id` on the new
Clerk users still holds the dev id, the mapping can be rebuilt from Clerk alone even if the
local artifact is lost.

---

## 5. Recommendation on timing

Do it **before the next user joins**, not after. Every new signup adds rows across up to
14 columns, and the cost of this migration scales with exactly that. 17 users and 128 rows
is a comfortable afternoon; the same work at 200 users is a different kind of day.

The one thing that must not happen is a partial cutover — keys swapped, rows not remapped.
That is why step 3 rehearses on staging and step 4 commits on a verification query rather
than on hope.
