/**
 * How long a publish claim is honoured before its holder is presumed dead.
 *
 * Sized against the two things it sits between:
 *   · LONGER than any single publish can take. The publish-now route caps at 120s
 *     and the Instagram poll alone is 36s, so a live publisher must never have its
 *     row stolen mid-flight.
 *   · Rarely reached at all, because the normal transient path releases explicitly
 *     the moment the failure is classified. This number only governs the case
 *     where the process was killed and could not release anything.
 *
 * Ten minutes is comfortably clear of the first and, being the crash-only path,
 * costs nothing in the common case.
 *
 * ── WHY IT LIVES HERE AND NOT BESIDE THE CLAIM ───────────────────────────────
 * Two statements read this number and they must never disagree: `claimVariant`
 * (publish/store.ts) takes over a claim older than it, and `classifyCandidate`
 * (dispatch/classify.ts) hands such a variant to the claim in the first place. The
 * classifier is reachable from `@sahoda/jobs/sweeps`, which must stay free of the
 * publishing adapters (sweeps.test.ts walks the import graph), so the constant sits
 * in the dependency-free module and `runClaimedPublish` re-exports it.
 */
export const PUBLISH_LEASE_SECONDS = 600
