'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth, currentUser } from '@clerk/nextjs/server'
import { z } from 'zod'

import { slugify } from '@/lib/slug'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  bootstrapWithRetry,
  deriveWorkspaceName,
  mapBootstrapError,
  type BootstrapResult,
  type CreateWorkspaceState,
  type RpcEnvelope,
} from '@/lib/workspace-bootstrap'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspaces'

// NOTE: a `'use server'` module may only export async functions. Do NOT re-export
// the CreateWorkspaceState type from here — Turbopack (dev) mis-compiles a
// `export type { … }` re-export into a runtime reference (ReferenceError at module
// load), 500-ing every route that imports this action. Consumers import the type
// from '@/lib/workspace-bootstrap'. (tsc + webpack `next build` erase it, so this
// only surfaces under `next dev --turbopack`.)

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// Matches the output of lib/slug.ts `slugify` — a boundary check, even though
// the pointer is not an authz grant (RLS is). Defense in depth, zod at the edge.
const SlugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

function firstEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null
}

/**
 * Create the caller's workspace via the `bootstrap_workspace` SECURITY DEFINER
 * RPC — the one client-reachable write into the identity tables. It atomically
 * creates the workspace, owner membership, profile, and the free-plan signup
 * grant. Identity comes from the session JWT inside the function; the name/slug
 * and profile fields we pass are validated there too. On success we point the
 * active-workspace cookie at the new slug and let the shell re-render.
 *
 * `replayed:true` (the user already owned a workspace) is a success, not an
 * error — the RPC is idempotent per user.
 */
export async function createWorkspace(
  _prev: CreateWorkspaceState | null,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const { userId } = await auth()
  if (!userId) return { ok: false, code: 'ERROR', message: 'Sign in to create a workspace.' }

  const user = await currentUser()
  const provided = formData.get('name')
  const name = deriveWorkspaceName(typeof provided === 'string' ? provided : null, {
    firstName: user?.firstName,
    username: user?.username,
    email: firstEmail(user),
  })

  const email = firstEmail(user)
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.username || null

  const supabase = createServerSupabase()
  const { data, error } = await bootstrapWithRetry(
    async (slug): Promise<RpcEnvelope<BootstrapResult>> => {
      const res = await supabase.rpc('bootstrap_workspace', {
        p_name: name,
        p_slug: slug,
        p_email: email,
        p_display_name: displayName,
        p_avatar_url: user?.imageUrl ?? null,
      })
      return { data: (res.data as BootstrapResult | null) ?? null, error: res.error }
    },
    slugify(name),
  )

  if (error || !data) return mapBootstrapError(error)

  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, data.workspace.slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  })
  // New workspace (or an owner replay) → straight into onboarding to resolve the
  // Brand Brain. redirect() throws NEXT_REDIRECT, so this never falls through; the
  // fresh navigation re-reads the cookie, so no revalidatePath is needed here.
  redirect('/onboarding')
}

/** Point the UI at a workspace the user belongs to. Cookie only; RLS still rules. */
export async function setActiveWorkspace(formData: FormData): Promise<void> {
  const slug = SlugSchema.parse(formData.get('slug'))
  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  })
  revalidatePath('/', 'layout')
}
