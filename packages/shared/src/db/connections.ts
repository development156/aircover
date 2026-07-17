import { z } from 'zod'
import { ConnectionPlatformSchema, ConnectionStatusSchema } from '../enums'
import { JsonbSchema } from '../common'

/**
 * OAuth connections. The public row carries NO token material — tokens live in
 * `connection_secrets` (service-only, no shared schema). `external_account.id` is
 * the platform-native full resource identifier (GBP: `accounts/{a}/locations/{l}`).
 */
export const ConnectionSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  platform: ConnectionPlatformSchema,
  status: ConnectionStatusSchema,
  external_account: JsonbSchema,
  scopes: z.array(z.string()).nullable(),
  expires_at: z.string().nullable(),
  last_checked_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Connection = z.infer<typeof ConnectionSchema>
