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

/**
 * Rename the active workspace.
 *
 * ── WHY THE NAME AND NOTHING ELSE ────────────────────────────────────────────
 * /settings displayed the workspace name as read-only text, so the label a
 * person sees in the switcher on every screen — usually derived from their
 * email at bootstrap, e.g. "sahoda+clerk_test's workspace" — could never be
 * changed from inside the app.
 *
 * The SLUG is deliberately not touched. Its own hint on that page says it is
 * "used in links and never reused": it is the pointer the active-workspace
 * cookie holds and the value shared URLs carry, so renaming it would silently
 * break every link anyone had already sent. A rename here is a display change
 * only, which is what people actually want when they rename a workspace.
 *
 * ── WHY THIS IS SAFE TO WRITE DIRECTLY ───────────────────────────────────────
 * `workspaces` is RLS-scoped to the caller's memberships, so the UPDATE can only
 * ever reach a row this user is entitled to, and `name` carries no authorisation
 * meaning anywhere — nothing branches on it. That is the whole reason the slug
 * stays out: it IS a pointer, and this is not.
 */
export async function renameWorkspace(
  workspaceId: string,
  name: string,
): Promise<{ ok: true; name: string } | { ok: false; message: string }> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to rename this workspace.' }

    const trimmed = name.trim()
    if (trimmed.length === 0) return { ok: false, message: 'Give the workspace a name.' }
    if (trimmed.length > 80) return { ok: false, message: 'Keep the name under 80 characters.' }

    const id = z.uuid().safeParse(workspaceId)
    if (!id.success) return { ok: false, message: 'That workspace could not be found.' }

    const supabase = createServerSupabase()
    // `.select()` is not decorative: PostgREST returns a null error for an
    // UPDATE that matched NO ROWS, so without reading a row back a rename that
    // RLS refused would report success. The returned row is the evidence.
    const { data, error } = await supabase
      .from('workspaces')
      .update({ name: trimmed })
      .eq('id', id.data)
      .select('name')
      .maybeSingle()

    if (error || !data) {
      return { ok: false, message: 'Could not rename this workspace — try again.' }
    }

    revalidatePath('/settings')
    revalidatePath('/', 'layout')
    return { ok: true, name: (data as { name: string }).name }
  } catch {
    return { ok: false, message: 'Could not rename this workspace — try again.' }
  }
}
