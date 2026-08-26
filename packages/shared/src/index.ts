// @sahoda/shared — the single source of truth for types, zod schemas, and
// cross-package contracts. Nothing in apps/* or other packages/* redefines a
// shape that belongs here (CLAUDE.md non-negotiable).

export const SHARED_PACKAGE = '@sahoda/shared' as const

// Foundation
export * from './common'
export * from './enums'
export * from './errors'

// Database row schemas (+ insert/update derivatives)
export * from './db'

// Domain + cross-package contracts
export * from './brand/resolve'
export * from './brand/audiences'
export * from './brand/intake'
export * from './brand/field-meta'
export * from './theme/tokens'
export * from './guide/tour'
export * from './jobs/payloads'
// M10 Playbooks — the CURATED recipe catalogue. The customer picks and fills in;
// they never author. The `playbooks.recipe_key` CHECK constraint is the fence.
export * from './playbooks/recipes'
export * from './playbooks/festivals'
export * from './ledger/pricing'
export * from './ledger/entries'
export * from './billing/plans'
export * from './billing/currency'
export * from './billing/gst'
export * from './billing/lifecycle'
export * from './billing/withCredits'
// The refusal gate (doc 18 §8) — a CONDITION of publishing, not a preflight.
// The rules, the deterministic checks and the port; apps/jobs binds the I/O.
export * from './gate/rules'
export * from './gate/packs'
export * from './gate/resolve-ruleset'
export * from './gate/deterministic'
export * from './gate/verdict'
export * from './gate/brain-rules'
export * from './gate/port'
export * from './assets/delete-gate'
// The library's organisation: real nested folders a person makes, and smart
// folders that are a saved QUESTION re-asked on every render (never a stored
// membership that can drift from the rows it claims to describe).
export * from './assets/organize'
export * from './assets/folder-tree'
export * from './publishing/constraints'
export * from './publishing/adapter'
export * from './publishing/schedule'
export * from './mesh/runner'
export * from './mesh/tasks'
// Messaging reply windows — what a platform will let you say, and when. Policy
// only: nothing here sends, and `canSendFromSahoda` is the literal `false`.
export * from './inbox/send-window'

// Admin Ops — /admin surface + the Claude↔dashboard sync protocol (doc 13)
export * from './ops/state'
export * from './ops/qa-export'

export * from './radar/snapshot'
export * from './radar/diff'

// The Marketing Brain (docs/51, docs/53) — computed observations about how a
// brand is performing. Stored apart from the Brand Brain and never user-edited.
export * from './brain/observations'
