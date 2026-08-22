import crypto from 'node:crypto'

import { env } from './env.mjs'

const b64u = (buf) => Buffer.from(buf).toString('base64url')

/**
 * Mint an HS256 token of the shape PostgREST expects.
 *
 * The app's real tokens are Clerk session JWTs verified against Clerk's JWKS
 * (see apps/web/src/lib/supabase/server.ts). What the POLICIES read is only
 * `auth.jwt()->>'sub'` and the `role` claim — see app.member_workspace_ids().
 * So a token that carries the same sub exercises exactly the same policy path.
 * Whether the project still accepts the legacy HS256 secret at all is proven
 * empirically by audit/p1/jwt-probe.mjs before anything depends on it.
 */
export function mintToken({ sub, role = 'authenticated', ttlSeconds = 900, extra = {} }) {
  const secret = env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('missing SUPABASE_JWT_SECRET')
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub,
    role,
    aud: 'authenticated',
    iss: `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
    iat: now,
    exp: now + ttlSeconds,
    ...extra,
  }
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url')
  return `${signingInput}.${sig}`
}
