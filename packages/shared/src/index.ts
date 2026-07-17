// @sahoda/shared — the single source of truth for types, zod schemas, and
// cross-package contracts. Nothing in apps/* or other packages/* may redefine a
// type that belongs here (CLAUDE.md non-negotiable).
//
// Phase-A checkpoint 2 replaces this placeholder with the real contract surface:
//   enums · errors · row schemas (26) · brand resolve contract · ledger + pricing
//   · publish adapter + constraint engine · model mesh · jobs · tours · themes.
export const SHARED_PACKAGE = '@sahoda/shared' as const
