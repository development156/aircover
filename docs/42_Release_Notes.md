# 42 · Release Notes — the wt-release cut

Written by the release session, 2026-08-24. Every number here was **measured** unless
the line says INFERRED or NOT RUN.

> **This branch has NOT been pushed.** The work sits on `wt-release`. The one
> irreversible step — fast-forwarding `wt-web` — is left for you, deliberately.
> See §7.

---

## 1 · What production is right now (the rollback record)

Captured **2026-08-23 21:04:30 UTC** by a read-only transaction against
`db.rloztdhzfliyvpvxsgjl.supabase.co:5432` (`begin read only`, never
`set default_transaction_read_only`, which the pooler hands to the next client).

| thing | value |
|---|---|
| `wt-web` SHA before | `c8faa3477790ac27f8471c3576b6bf16943bdf23` |
| `schema_migrations` rows | **69** |
| newest recorded migration | `20260823030000` |
| `workspaces` | 26 |
| `posts` | 131 |
| `credit_ledger` | 224 |
| `users_profile` | 25 |
| `plans` ids | `agency`, `free`, `growth`, `starter` |
| Vercel production deployment id | **NOT CAPTURED — see below** |

**The Vercel deployment id could not be read.** There is no `VERCEL_TOKEN` in any
env file, no `.vercel/project.json` link, the Vercel CLI is not installed, and the
Vercel MCP server is unauthenticated (it needs an OAuth flow through your browser).
Before you fast-forward, capture it yourself so you have something to roll back *to*:

```bash
npx vercel login          # then
npx vercel ls --prod      # the top row's deployment id is your rollback target
```

Or in the dashboard: Project → Deployments → filter Production → copy the id of the
current one, then use "Instant Rollback" on it.

### What a rollback would and would not undo

**Rolls back:** the application code. A Vercel instant rollback re-points production
at the previous build. `git` history is untouched because nothing is force-pushed —
`wt-web` only ever fast-forwards, so the old SHA `c8faa347` stays reachable forever.

**Does NOT roll back:** anything applied to the database. Applied migrations are
permanent. If you apply the three held migrations in §5 and then roll the code back,
production runs **old code against a new schema** — which is the more dangerous of
the two directions, because the plan migration changes rows that live
`bootstrap_workspace` reads on every signup. Roll code back first, and only then
decide about the schema.

**Also does not roll back:** rows written between deploy and rollback — new
workspaces, posts, ledger entries. The ledger is append-only by design.

---

## 2 · Which lanes are in this cut, and which are not

*(filled in below by the merge log)*

---

*(sections 3–8 appended as the release proceeds)*
