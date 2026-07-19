/**
 * Editor caps mirroring `public.resolve_brand_memory`'s payload guards. The RPC
 * rejects a brain whose open-ended lists exceed 40 entries (INVALID_PAYLOAD), and
 * mesh prepends the active brain to every model call — so an oversized brain is
 * not just a failed save, it bills tokens on every future action. The editors cap
 * at the same number so Finish can never fail on it.
 */
export const MAX_OPEN_LIST_ENTRIES = 40
