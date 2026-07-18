# DB + Auth setup (fresh Supabase project)

The database is a **cloud** Supabase project (no local Docker). Migrations live in
`supabase/migrations/`; apply with `pnpm db:push` (permission: **ask**). The ledger + RLS test
suites (`tests/`) run against the live project and **skip** when the env below is absent.

## Required `.env` (repo root — never commit real values)

| Key                             | Used by                        | Where to find it                                                  |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | app + tests (supabase-js)      | Project Settings → API → Project URL                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app + tests                    | Project Settings → API → anon key                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | server/jobs + test fixtures    | Project Settings → API → service_role key                         |
| `SUPABASE_PROJECT_REF`          | CLI + MCP                      | the 20-char ref in the project URL                                |
| `SUPABASE_DB_URL`               | ledger tests (direct `pg`)     | Database → Connection string → **URI** (includes the DB password) |
| `SUPABASE_JWT_SECRET`           | RLS tests (mint tenant tokens) | Project Settings → API → JWT Settings → JWT Secret                |

Notes:

- The RLS suite mints HS256 tokens with `SUPABASE_JWT_SECRET` (sub + `role: authenticated`) — it
  needs the project's legacy JWT secret. If a project is asymmetric-keys-only, swap the suite to
  real test users instead.
- Supabase's **direct** DB endpoint presents a private CA chain. Set `SUPABASE_DB_CA_CERT` to the
  CA file to enforce full TLS verification in `pg`; otherwise the test helper keeps the connection
  encrypted but skips chain verification **for the Supabase host only** (test code, first-party
  host — never production).

## Clerk ↔ Supabase third-party auth (2 dashboard steps)

RLS reads the Clerk subject via `auth.jwt() ->> 'sub'` and requires a `role: authenticated`
claim. Wire Clerk as a third-party provider so Supabase trusts Clerk-issued JWTs:

1. **Clerk dashboard** → enable the Supabase integration (Configure → **Integrations** →
   Supabase → Activate). This adds the `"role": "authenticated"` claim to session tokens and
   exposes your **Clerk domain / Frontend API URL** (e.g. `https://<app>.clerk.accounts.dev`, or
   your production Clerk domain). Copy that domain.
   - _Older Clerk UIs:_ Sessions → **Customize session token** → add `{ "role": "authenticated" }`.

2. **Supabase dashboard** → **Authentication → Sign In / Providers → Third-Party Auth** → **Add
   provider → Clerk** → paste the Clerk domain from step 1 → **Save**. Supabase now validates
   Clerk JWTs against Clerk's JWKS.

**Smoke:** the `tests/rls.test.ts` positive control ("member A reads own-tenant posts") passing
proves the DB correctly authorizes a `role: authenticated` JWT end-to-end. The Clerk-issued-token
path is exercised once `apps/web` has a login (wt-web) — sign in, then confirm `auth.jwt()` is
non-null for the signed-in user and a `workspaces` read returns only their rows.
