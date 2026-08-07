// @sahoda/db — Supabase migrations, RLS policies, the credit-ledger function,
// seeds, and the anon-client RLS + ledger property tests. Owned exclusively by
// wt-db; only this package edits migrations.
//
// SQL lives under ./supabase/migrations; tests under ./tests. This module exists
// so the package typechecks and so consumers can import shared DB helpers later.
export const DB_PACKAGE = '@sahoda/db' as const
