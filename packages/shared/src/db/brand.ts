import { z } from 'zod'
import {
  BrandMemoryStatusSchema,
  BrandMemorySourceSchema,
  MemoryEventSourceSchema,
  MemoryEventStatusSchema,
} from '../enums'
import { JsonbSchema } from '../common'
import { BrandMemoryPayloadSchema } from '../brand/resolve'

/** Append-only versions; revert = a new version. Members read only — all writes server-side. */
export const BrandMemorySchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  version: z.int(),
  status: BrandMemoryStatusSchema,
  payload: BrandMemoryPayloadSchema,
  source: BrandMemorySourceSchema,
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type BrandMemory = z.infer<typeof BrandMemorySchema>

/**
 * Return envelope of `public.resolve_brand_memory(p_workspace_id, p_payload, p_source,
 * p_expected_version)` — the one client-reachable write into `brand_memory` (the table is
 * read-only under RLS). `version` always mirrors `brand_memory.version`; `replayed: true` is a
 * SUCCESS meaning the submitted payload was already the active brain, so no version was burned.
 *
 * `p_expected_version` is an optimistic (compare-and-set) precondition: OMIT it to skip the check
 * entirely (the Finish path does), pass `0` to assert "no active brain yet", or pass the version
 * you last read. It is evaluated BEFORE the replay branch, so a resubmit of the already-active
 * payload carrying a stale expected_version raises VERSION_CONFLICT rather than replaying —
 * precondition wins over idempotency. Rage-click safety comes from the 3-argument call shape.
 *
 * The SQL re-checks shape as defense-in-depth: the six sections must be objects,
 * `signature_phrases` / `core_values` / `sample_hooks` exactly 3, `banned_phrases` and `red_lines`
 * at most 40 entries, `signal_lock` a SignalLock, whole payload under 32 KB. An editor that lets a
 * user grow the two open lists must cap at 40 before Finish or the save fails INVALID_PAYLOAD.
 *
 * Errors arrive as a PostgREST message containing one of: AUTH_REQUIRED · INVALID_WORKSPACE ·
 * INVALID_SOURCE · INVALID_PAYLOAD · NOT_A_MEMBER · FORBIDDEN_ROLE · VERSION_CONFLICT.
 * VERSION_CONFLICT covers both a stale precondition (reload, then retry) and a concurrent writer
 * that skipped the advisory lock (retry immediately) — the message does not distinguish them.
 */
export const ResolveBrandMemoryResultSchema = z.object({
  brand_memory: BrandMemorySchema,
  version: z.int(),
  replayed: z.boolean(),
})
export type ResolveBrandMemoryResult = z.infer<typeof ResolveBrandMemoryResultSchema>

/** The Brand Brain writeback queue (memory_events). Members read only; accept/reject is a server action. */
export const MemoryEventSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  source: MemoryEventSourceSchema,
  diff: JsonbSchema,
  status: MemoryEventStatusSchema,
  evidence_refs: z.unknown(),
  applied_memory_version: z.int().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type MemoryEvent = z.infer<typeof MemoryEventSchema>
