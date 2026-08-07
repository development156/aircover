import { z } from 'zod'

/** A Clerk subject id (text, e.g. `user_2ab...`). NOT a uuid — all user_id columns are text. */
export const ClerkUserIdSchema = z.string().min(1)
export type ClerkUserId = z.infer<typeof ClerkUserIdSchema>

/** A uuid primary/foreign key. */
export const UuidSchema = z.uuid()

/** Postgres `timestamptz` as an ISO-8601 string, as returned by supabase-js. */
export const TimestamptzSchema = z.string()
export type Timestamptz = z.infer<typeof TimestamptzSchema>

/** Object-shaped jsonb column. */
export const JsonbSchema = z.record(z.string(), z.unknown())
export type Jsonb = z.infer<typeof JsonbSchema>

/** Opaque jsonb column whose shape is not modelled here (may be object, array, or scalar). */
export const JsonSchema = z.unknown()

/**
 * Postgres `numeric`/`decimal` as returned by PostgREST — a JSON string to
 * preserve precision (supabase-js does not coerce). Consumers call Number() when
 * they need arithmetic. (int8/bigint, by contrast, returns as a JSON number.)
 */
export const NumericSchema = z.union([z.number(), z.string()])
export type Numeric = z.infer<typeof NumericSchema>
