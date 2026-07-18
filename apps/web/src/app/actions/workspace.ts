'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspaces'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// Matches the output of lib/slug.ts `slugify` — a boundary check, even though
// the pointer is not an authz grant (RLS is). Defense in depth, zod at the edge.
const SlugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export type CreateWorkspaceState =
  { ok: true; slug: string } | { ok: false; code: 'BOOTSTRAP_PENDING'; message: string }

/**
 * The real path calls the wt-db `bootstrap_workspace` SECURITY DEFINER RPC —
 * there are deliberately no INSERT policies on workspaces/workspace_members, so
 * a client cannot create tenancy rows directly. Until that migration merges we
 * return an honest typed error; we never fake a success the user could act on.
 */
export async function createWorkspace(
  _prev: CreateWorkspaceState | null,
  _formData: FormData,
): Promise<CreateWorkspaceState> {
  return {
    ok: false,
    code: 'BOOTSTRAP_PENDING',
    message: 'Creating a workspace opens with onboarding — the bootstrap step is landing now.',
  }
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
