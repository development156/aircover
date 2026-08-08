# packages/db

RLS pattern + new-table checklist = the **sahoda-db** skill, verbatim. **Never edit an applied
migration** — always create a new one (`pnpm db:new <verb_noun>`). `supabase db push` requires
human approval (permission: ask).

- The ledger function `app.apply_ledger_entry()` is sacred: the ONLY write path to
  `credit_ledger` / `credit_balances`. Property + concurrency tests in `./tests` (sahoda-ledger).
- Every table: `workspace_id` + FK + index, RLS enabled + policies in the same migration, zod
  row schema in `@sahoda/shared`, anon-client cross-tenant test in `./tests/rls`.
- Append-only tables get the cascade-aware block trigger. Child tables carry `workspace_id` and
  use composite FKs `(parent_id, workspace_id)` so a row can never attach across tenants.
- pgvector HNSW for `brand_embeddings` is post-Alpha (not in this schema).
- Dev DB = the linked Supabase cloud project (no local Docker). Ask before every `db push`.
