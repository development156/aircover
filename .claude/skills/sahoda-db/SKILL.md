---
name: sahoda-db
description: Use when creating or changing ANY database table, migration, RLS policy, or Postgres function in packages/db. Covers the new-table checklist and migration rules.
---

New table checklist (all mandatory):

1. `workspace_id uuid not null references workspaces(id)` + index on it.
2. `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + membership policy:
   `USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))` (and WITH CHECK for writes).
3. created_at/updated_at defaults; updated_at trigger.
4. Add zod row schema to packages/shared and export types — never redefine in apps.
   Migration rules: `supabase migration new <verb_noun>`; NEVER edit an applied migration — create a new one; `supabase db push` requires human approval (permission "ask"). Ledger tables are append-only; balance mutates ONLY inside `apply_ledger_entry()`. Write an RLS test (anon client, cross-tenant read+write must fail) in the same PR.

**Amendment — platform-scope `ops_*` tables (doc 13 §3).** `ops_*` tables are **platform-scope** and are the _only_ sanctioned exception to "every table carries workspace_id." They MUST still: enable RLS, expose `SELECT` only via `is_ops_admin()` (security-definer fn checking `ops_admins` by the Clerk subject), take all writes through server actions / service-role, and ship an anon-client RLS test proving outsiders read nothing.

Practical notes from the migration that created them (`20260725102928_ops_platform_tables.sql`): the predicate is `app.is_ops_admin()` reading `auth.jwt() ->> 'sub'`, not `auth.uid()` — auth is Clerk, so `auth.uid()` is NULL on every request and a policy built on it denies everyone forever. The ops tables carry **no write policies at all**; every mutation goes through a `public.ops_*` SECURITY DEFINER function that re-checks `is_ops_admin()` plus the caller's role, and the RLS test asserts that even an active owner cannot INSERT directly. Do not add a workspace_id to these tables to "be consistent" — the exception is the design.
