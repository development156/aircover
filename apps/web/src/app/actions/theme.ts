'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { ThemeTokensSchema } from '@sahoda/shared'

import { themeTokensFrom } from '@/lib/brand/brand-theme'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'

export type SaveThemeState = { ok: true } | { ok: false; message: string }

/**
 * Persist the Brand Skin extracted from the uploaded logo.
 *
 * `workspace_themes` is member-writable under RLS (t_insert checks
 * `workspace_id IN app.member_workspace_ids()`), so this needs no service-role
 * client and no RPC — identity is still the Clerk JWT and RLS still decides.
 *
 * Why this exists: the onboarding Theme step extracted a palette, re-coloured
 * the live preview and said "Theme applied", but nothing was ever written. The
 * workspace stayed on the default orange and every generated site preview
 * rendered in stock orange regardless of the logo. The palette was real; only
 * the persistence was missing.
 *
 * The previous active row is archived first so exactly one theme is active —
 * readers take `status = 'active'` and must never find two.
 */
export async function saveWorkspaceTheme(colors: string[]): Promise<SaveThemeState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save your theme.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace

    // The palette comes from client-side extraction, so it is untrusted input:
    // a degenerate or non-string list would derive a broken token set and
    // repaint the whole workspace.
    if (!Array.isArray(colors) || colors.length === 0) {
      return { ok: false, message: 'Upload a logo first — there is no palette to save yet.' }
    }
    if (!colors.every((color) => typeof color === 'string' && color.trim().length > 0)) {
      return { ok: false, message: 'That palette could not be read — re-upload your logo.' }
    }

    // Derive, then zod-parse before writing: `tokens` is a jsonb column with no
    // shape constraint, and a malformed theme would poison every later render.
    const tokens = ThemeTokensSchema.safeParse(themeTokensFrom(colors))
    if (!tokens.success) {
      return {
        ok: false,
        message: 'That palette could not be turned into a theme — try another logo.',
      }
    }

    const supabase = createServerSupabase()

    // `version` is NOT NULL with NO default and carries UNIQUE
    // (workspace_id, version) — omitting it fails the insert outright (found
    // the hard way: the first cut silently toasted "could not save" on every
    // Finish). Read the current max and take the next.
    //
    // SCOPED TO THIS WORKSPACE, which the first cut was not. Without the
    // `.eq`, this read the highest version across every workspace the caller
    // can see under RLS. That never broke the insert — UNIQUE is
    // (workspace_id, version) and a global max is always ≥ this workspace's,
    // so the value stayed unique — which is exactly why it survived: a
    // cross-workspace read on a workspace-scoped table with no visible
    // symptom. It is wrong on the terms this repo cares about (every read on
    // a workspace table is workspace-bound), and it would have handed a
    // member of two workspaces a second workspace's version number.
    const { data: latest, error: versionError } = await supabase
      .from('workspace_themes')
      .select('version')
      .eq('workspace_id', workspace.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (versionError) {
      return { ok: false, message: 'Could not save your theme. Try again.' }
    }
    const nextVersion = ((latest as { version?: number } | null)?.version ?? 0) + 1

    // Archive the current active row FIRST. If the insert then fails the
    // workspace falls back to the tokens.css defaults — visibly un-themed,
    // which is honest — rather than keeping two active rows and letting the
    // reader pick one arbitrarily.
    const { error: supersedeError } = await supabase
      .from('workspace_themes')
      .update({ status: 'archived' })
      .eq('workspace_id', workspace.id)
      .eq('status', 'active')
    if (supersedeError) {
      return { ok: false, message: 'Could not save your theme. Try again.' }
    }

    // A NULL ERROR ON AN UPDATE DOES NOT MEAN THE WRITE HAPPENED.
    //
    // With no matching UPDATE policy the row is simply not visible to update, so
    // PostgREST affects zero rows and returns no error at all — a denied write
    // and a successful one are indistinguishable from the response. (INSERT is
    // different: its WITH CHECK fails loudly. Proven on 2026-07-26 against the
    // ops_* tables, which carry SELECT policies only.)
    //
    // Trusting `supersedeError` alone here meant the insert below could add a
    // second `status: 'active'` row — precisely the "two active rows, reader
    // picks one arbitrarily" state the comment above says this ordering exists
    // to prevent. So the postcondition is asserted, not assumed.
    const { data: stillActive, error: verifyError } = await supabase
      .from('workspace_themes')
      .select('id')
      .eq('workspace_id', workspace.id)
      .eq('status', 'active')
      .limit(1)
    if (verifyError || (stillActive?.length ?? 0) > 0) {
      return { ok: false, message: 'Could not save your theme. Try again.' }
    }

    const { error } = await supabase.from('workspace_themes').insert({
      workspace_id: workspace.id,
      version: nextVersion,
      tokens: tokens.data,
      source: 'extracted',
      status: 'active',
      created_by: userId,
    })
    if (error) {
      // Never forward the postgres message — it can carry schema internals.
      return { ok: false, message: 'Could not save your theme. Try again.' }
    }

    // The theme paints the app shell and every site preview.
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not save your theme. Try again.' }
  }
}
