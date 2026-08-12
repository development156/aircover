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
export * from './theme/tokens'
export * from './guide/tour'
export * from './jobs/payloads'
export * from './ledger/pricing'
export * from './ledger/entries'
export * from './billing/plans'
export * from './billing/withCredits'
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
