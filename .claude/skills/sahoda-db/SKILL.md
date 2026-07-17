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
