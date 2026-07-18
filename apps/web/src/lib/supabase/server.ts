import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

/**
 * Per-request, RLS-scoped Supabase client. The Clerk session JWT rides every
 * call via the third-party integration (no JWT template — Clerk injects
 * role: authenticated into the default session token).
 *
 * - Signed out → getToken() is null → plain anon → RLS denies. Correct.
 * - Never call supabase.auth.* — those throw when accessToken is set.
 * - Construct per request: auth() is request-scoped and the client is a
 *   thin fetch wrapper.
 * - No service-role client in apps/web — RLS is the security boundary.
 */
export function createServerSupabase(): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => (await auth()).getToken(),
    auth: { persistSession: false },
  })
}
