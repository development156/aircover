# packages/shared

**Source of truth.** Every type, zod schema, enum, and cross-package contract lives here.
Adding a type = adding its zod schema + exporting the `z.infer` type. Apps and other packages
import from `@sahoda/shared` — they never redefine a shape that belongs here.

- Breaking change ⇒ prefix the PR title with `[contract]`.
- `pricing.config.json` (repo root) is read-only from code; only `creditCost()` reads it.
- `tokens.css` is the canonical token set (Design System §2), mirrored into the
  `workspace_themes` default row. No raw hex in app code.
- Zod 4 idioms: `z.uuid()`, `z.email()`, `z.url()`, `z.iso.datetime()`, `z.enum([...])`,
  `z.record(keyType, valueType)` (two args), `z.array(x).length(n)` for fixed-length tuples.

Module map: `enums` · `errors` · `db/*` (one row schema per table) · `brand/resolve` ·
`ledger/{entries,pricing}` · `publishing/{adapter,constraints}` · `mesh/{tasks,runner}` ·
`billing/{plans,withCredits}` · `guide/tour` · `theme/tokens` · `jobs/payloads`.
