# LEARNINGS — SAHODA LABS

2026-07-18 · Day 0 — repo config laid down.
2026-07-18 · pricing.config.json — source doc §9 ships malformed JSON (`rollover_cap_x` was trapped inside the `currency_note` string, so the trailing `: 2` broke parsing). Fixed in-repo by closing the string after `agency 15000` and promoting `rollover_cap_x` to a real numeric key (2); all pricing numbers unchanged. TODO: fix doc §9 upstream too.
2026-07-18 · Phase A frozen — monorepo + packages/shared contracts + packages/db (27 tables, RLS, atomic apply_ledger_entry, seeds) applied to the fresh cloud project; 21 shared + 16 live ledger/RLS tests green. Toolchain is current-gen: Zod 4 (use `.prefault({})`, not `.default({})`, for pre-parse object defaults), TS 7, Vitest 4.
2026-07-18 · Gotchas — (1) a jsonb-expression uniqueness needs a `create unique index`, NOT an inline table `unique(...)` (syntax error 42601). (2) Supabase direct DB endpoint presents a private CA chain → `pg` needs the Supabase CA (`SUPABASE_DB_CA_CERT`) or relaxed chain-verification for that host in tests. (3) supabase-js throws `PGRST125` if `SUPABASE_URL` carries a path — normalize to `new URL(url).origin`.
