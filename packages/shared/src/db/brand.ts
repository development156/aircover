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
