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

/**
 * Return envelope of `public.upsert_connection(p_workspace_id, p_platform, p_external_account,
 * p_scopes, p_expires_at, p_access_token_enc, p_refresh_token_enc, p_token_type)` — the one
 * client-reachable write into `connections` (no INSERT policy) and `connection_secrets` (RLS on,
 * zero policies). It returns metadata ONLY; no token material ever crosses this boundary, by
 * design and by test.
 *
 * SEALED-SECRET CONTRACT (settled with wt-pub review finding #1). The function takes TWO sealed
 * blobs and treats each as opaque — it cannot do otherwise: both tokens are sealed in a single
 * AES-256-GCM ciphertext whose key lives only in the Node process, so no SQL can split an
 * envelope. Only `@sahoda/publishing` may look inside one.
 *   · Target shape: `packages/publishing` seals each token separately, so `accessTokenEnc` goes to
 *     `p_access_token_enc` and `refreshTokenEnc` (or null, when the platform issued none) to
 *     `p_refresh_token_enc`, and each column holds what its name says.
 *   · Fallback: a caller still holding ONE bundled `encryptedSecret` passes it as
 *     `p_access_token_enc` with `p_refresh_token_enc` omitted. That works, but `access_token_enc`
 *     then holds access AND refresh material and its name understates it.
 * Blobs are jsonb, not text: storing the envelope as an object lets a key-rotation job select on
 * `access_token_enc ->> 'key_version'` without decrypting. The mount JSON.parses the sealed string
 * once to hand it over — that is not opening the envelope (no field is read) and the port's
 * store-verbatim rule still holds.
 *
 * Secrets are written VERBATIM per grant, including a null refresh: the function never merges a
 * new access token with a previous authorization's refresh token, because a mismatched pair is a
 * connection that silently cannot refresh.
 *
 * Re-auth of the same (workspace, platform, `external_account.id`) REFRESHES in place — same
 * `connection_id`, scopes/expiry/account metadata replaced, `status` back to 'active' even from
 * 'revoked' or 'expired' — so a repeated OAuth callback is safe to replay and never duplicates a
 * row. `created_by` records who FIRST connected the account, not who last re-authed it.
 *
 * Role allowlist is deliberately narrower than `resolve_brand_memory`: only `owner` and `editor`
 * may bind a real external account that can post as the business. `approver` and `viewer` get
 * FORBIDDEN_ROLE. (Widening later is safe; narrowing later would break people.)
 *
 * Errors arrive as a PostgREST message containing one of: AUTH_REQUIRED · INVALID_WORKSPACE ·
 * INVALID_PLATFORM · INVALID_ACCOUNT · INVALID_SECRET · NOT_A_MEMBER · FORBIDDEN_ROLE.
 * NOT_A_MEMBER is returned for a non-existent workspace too — there is no existence oracle.
 * `p_platform` is `ConnectionPlatformSchema` (x | gbp | linkedin), NOT `Channel` (which also
 * includes instagram); anything else is INVALID_PLATFORM.
 */
export const UpsertConnectionResultSchema = z.object({
  connection_id: z.uuid(),
})
export type UpsertConnectionResult = z.infer<typeof UpsertConnectionResultSchema>
