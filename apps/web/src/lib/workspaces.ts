import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'

import { createServerSupabase } from '@/lib/supabase/server'

// The active-workspace pointer is a UI convenience, NOT an authorization grant:
// RLS decides what each request may read, so an unknown/stale slug simply falls
// back to the first membership (see resolveActiveWorkspace).
export const ACTIVE_WORKSPACE_COOKIE = 'sahoda_ws'

/** View-model projection of `workspaces` — the switcher needs only these three. */
export interface WorkspaceOption {
  id: string
  name: string
  slug: string
}

/**
 * Why this read is a two-way answer and the active one a three-way.
 *
 * ── THE BUG THIS ENDS ────────────────────────────────────────────────────────
 * `listWorkspaces` used to return `[]` for BOTH "this account has no workspace"
 * and "the read failed", and `getActiveWorkspace` collapsed both into `null`.
 * Every screen that branches on that null therefore asserts "you have no
 * workspace yet" the moment a query hiccups — to a user who has one. That is the
 * same one-null-two-meanings defect the wallet, /home and /connections each had
 * to fix downstream, except this one is UPSTREAM OF ALL OF THEM: it makes the
 * fixes themselves false. The switcher goes further and renders "Create
 * workspace" over a workspace that exists.
 *
 * (Pressing it is not destructive — `bootstrap_workspace` carries an owner
 * replay guard and returns the existing row — but "you have no workspace" is
 * still a claim about the account that nothing here measured.)
 *
 * `unreadable` is NOT `none`, and only one of them is fixed by reloading.
 */
export type WorkspacesRead =
  { status: 'ok'; workspaces: WorkspaceOption[] } | { status: 'unreadable' }

/**
 * Workspaces the signed-in user can see, RLS-scoped via the Clerk session JWT.
 * `{ status: 'ok', workspaces: [] }` is a real answer — the account has none yet
 * and bootstrap is the remedy. `unreadable` means the question did not get an
 * answer, and nothing may be claimed about the account from it.
 */
export async function readWorkspaces(): Promise<WorkspacesRead> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, name, slug')
      .order('created_at', { ascending: true })

    if (error || !data) {
      if (error) console.error('[workspaces] read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    return { status: 'ok', workspaces: data as WorkspaceOption[] }
  } catch (error) {
    console.error('[workspaces] read threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
}

/**
 * The lossy view, kept deliberately and used only where the loss is CORRECT.
 *
 * A mutation refuses on both arms — "no workspace" and "could not tell" are the
 * same instruction to a write path, which is to not write — so collapsing them
 * there costs nothing. A RENDERED SENTENCE is the opposite: it has to choose
 * between two different claims and two different remedies, and it must use
 * `readActiveWorkspace` instead.
 */
export async function listWorkspaces(): Promise<WorkspaceOption[]> {
  const read = await readWorkspaces()
  return read.status === 'ok' ? read.workspaces : []
}

export async function getActiveWorkspaceSlug(): Promise<string | null> {
  const store = await cookies()
  return store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
}

/**
 * Resolve which workspace is active: the cookie choice when it is still a
 * membership, otherwise the first. Returns null only when there are none.
 */
export function resolveActiveWorkspace(
  workspaces: readonly WorkspaceOption[],
  activeSlug: string | null,
): WorkspaceOption | null {
  const [first] = workspaces
  if (!first) return null
  const chosen = activeSlug ? workspaces.find((w) => w.slug === activeSlug) : undefined
  return chosen ?? first
}

/**
 * The three things that can be true of "which workspace am I in", each with its
 * own remedy:
 *
 *  - `ok`         — this one. Nothing to say.
 *  - `none`       — the account has no workspace yet. Create one; reloading cannot help.
 *  - `unreadable` — we could not find out. Reload; creating one would be acting on
 *                   a fact nobody established.
 */
export type ActiveWorkspaceRead =
  { status: 'ok'; workspace: WorkspaceOption } | { status: 'none' } | { status: 'unreadable' }

/** The active workspace for the current request, with the reason when there is none. */
export async function readActiveWorkspace(): Promise<ActiveWorkspaceRead> {
  const [read, activeSlug] = await Promise.all([readWorkspaces(), getActiveWorkspaceSlug()])
  if (read.status === 'unreadable') return { status: 'unreadable' }
  const workspace = resolveActiveWorkspace(read.workspaces, activeSlug)
  return workspace === null ? { status: 'none' } : { status: 'ok', workspace }
}

/** The active workspace for the current request (RLS-scoped list + cookie pointer). */
export async function getActiveWorkspace(): Promise<WorkspaceOption | null> {
  const read = await readActiveWorkspace()
  return read.status === 'ok' ? read.workspace : null
}

/**
 * The request-scoped active-workspace read every other reader should use.
 *
 * Memoised with React `cache`, so the eight modules that used to keep their own
 * private `activeWorkspaceId` memo now share ONE lookup per request instead of
 * issuing eight — and, more to the point, they share one ANSWER. A private memo
 * per module is how two panels on the same screen end up disagreeing about
 * whether a workspace exists.
 */
export const activeWorkspaceRead = cache(readActiveWorkspace)

/**
 * ── WHAT A WRITE PATH SHOULD REFUSE WITH ─────────────────────────────────────
 * Run 23 classified the write actions as CORRECT on the grounds that a mutation
 * refuses on both arms, so collapsing them costs it nothing. That is true of the
 * DECISION and false of the SENTENCE. Every one of them refuses with
 *
 *     "Create a workspace first."
 *
 * and on the unreadable arm that is a remedy the customer cannot carry out —
 * they already have a workspace, and making a second one would not help. It is
 * the same defect the pages were cleared of, surviving in the toast.
 *
 * One helper rather than twenty-three branches, because the point of splitting
 * the reader was to stop each caller deciding this for itself.
 */
export const WRITE_NO_WORKSPACE = 'Create a workspace first.'
export const WRITE_WORKSPACE_UNREADABLE = 'Couldn’t check your workspace just now. Try again.'

export type WriteWorkspace =
  { ok: true; workspace: WorkspaceOption } | { ok: false; message: string }

/** The workspace to write into, or the sentence to refuse with. Never both. */
export async function workspaceForWrite(): Promise<WriteWorkspace> {
  const read = await readActiveWorkspace()
  if (read.status === 'ok') return { ok: true, workspace: read.workspace }
  return {
    ok: false,
    message: read.status === 'none' ? WRITE_NO_WORKSPACE : WRITE_WORKSPACE_UNREADABLE,
  }
}
