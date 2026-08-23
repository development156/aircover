import type { Workspace } from '@sahoda/shared'

import { withSuffix } from './slug'

// Pure, unit-tested core of the createWorkspace server action. The action itself
// (app/actions/workspace.ts) is thin I/O glue: identity from Clerk, the RPC call,
// the cookie write. Everything decidable lives here so it is testable without a
// live database or an auth session.

const MAX_NAME_LENGTH = 120
const DEFAULT_WORKSPACE_NAME = 'My workspace'
const DEFAULT_MAX_ATTEMPTS = 5

/** The bits of the signed-in Clerk user used to name a first workspace. */
export interface CreatorIdentity {
  firstName?: string | null
  username?: string | null
  email?: string | null
}

/** Shape returned by public.bootstrap_workspace ({ workspace, replayed }). */
export interface BootstrapResult {
  workspace: Workspace
  replayed: boolean
}

/** PostgREST-style { data, error } envelope, narrowed to what we read. */
export interface RpcEnvelope<T> {
  data: T | null
  error: { message?: string | null; code?: string | null } | null
}

/**
 * Failure-only by construction: `createWorkspace` redirects into onboarding on
 * success, so it never returns a success state. Modelling an `ok:true` arm would
 * advertise an outcome the action cannot produce.
 */
export type CreateWorkspaceState = {
  ok: false
  code: 'INVALID_NAME' | 'SLUG_TAKEN' | 'ERROR'
  message: string
}

/**
 * The DISPLAY name for a new workspace: whatever the creator provided, or a
 * neutral default.
 *
 * Identity is deliberately absent. At bootstrap the product has not been told
 * what the business is called — createWorkspace redirects into /onboarding
 * immediately afterwards — so any name built here is a guess, and building it
 * from the creator's email local part made that guess an identity leak. The
 * label rides the switcher on every screen (workspace-switcher.tsx:140,168),
 * shows at /settings, is sent to Zernio as the connected profile name
 * (packages/publishing/src/zernio/connect.ts:27), and — when onboarding's door
 * finds no site title — becomes the BRAND NAME handed to the resolver
 * (actions/onboarding-resolve.ts:189). "My workspace" claims nothing.
 */
export function deriveWorkspaceName(provided: string | null | undefined): string {
  const trimmed = (provided ?? '').trim()
  return trimmed ? trimmed.slice(0, MAX_NAME_LENGTH) : DEFAULT_WORKSPACE_NAME
}

/**
 * The seed `slugify` gets. This is the OLD deriveWorkspaceName verbatim, and it
 * must stay that way.
 *
 * `workspaces.slug` is globally unique (identity.sql:8) and bootstrapWithRetry
 * tries only DEFAULT_MAX_ATTEMPTS (5) suffixes, so the seed has to live in a
 * sparse namespace. Seeding from the display name would put every nameless
 * signup on "my-workspace" and hard-fail the 6th. Seeding from the bare
 * identity token ("trinity") rather than the possessive ("trinity-s-workspace")
 * would collapse first names into a dense namespace and hard-fail the 6th
 * "Divya". Keeping the possessive keeps slugify() byte-identical to today for
 * every input: no slug shape moves, no collision headroom is lost.
 *
 * The slug therefore still carries the creator's identity. That is unchanged
 * from today and deliberately out of scope: the slug is a POINTER (the
 * active-workspace cookie holds it; /settings calls it "never reused"), so
 * changing its shape is an owner ruling, not a bug fix.
 */
export function deriveSlugSeed(
  provided: string | null | undefined,
  identity: CreatorIdentity,
): string {
  const trimmed = (provided ?? '').trim()
  if (trimmed) return trimmed.slice(0, MAX_NAME_LENGTH)

  const who =
    identity.firstName?.trim() ||
    identity.username?.trim() ||
    identity.email?.split('@')[0]?.trim() ||
    ''
  if (who) return `${who}'s workspace`.slice(0, MAX_NAME_LENGTH)
  return DEFAULT_WORKSPACE_NAME
}

/**
 * Call the bootstrap RPC, retrying with a suffixed slug (`-2`, `-3`, …) when the
 * slug is taken — the FSD §M1 uniquification path. Any non-collision error (or a
 * success) returns immediately; SLUG_TAKEN persists after maxAttempts.
 */
export async function bootstrapWithRetry(
  call: (slug: string) => Promise<RpcEnvelope<BootstrapResult>>,
  baseSlug: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<RpcEnvelope<BootstrapResult>> {
  let last: RpcEnvelope<BootstrapResult> = { data: null, error: { message: 'SLUG_TAKEN' } }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await call(withSuffix(baseSlug, attempt))
    if (!last.error) return last
    if (!(last.error.message ?? '').includes('SLUG_TAKEN')) return last
  }
  return last
}

/**
 * Map a bootstrap RPC error to a typed, user-safe failure state. Only the known
 * sentinels (raised by the SECURITY DEFINER function) surface specific copy;
 * everything else — permission denials, missing plan config, raw SQL — collapses
 * to a generic message so no database internals reach the UI.
 */
export function mapBootstrapError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): CreateWorkspaceState {
  const message = error?.message ?? ''
  if (message.includes('SLUG_TAKEN')) {
    return { ok: false, code: 'SLUG_TAKEN', message: 'That name is taken — try a different one.' }
  }
  if (message.includes('INVALID_NAME')) {
    return { ok: false, code: 'INVALID_NAME', message: 'Enter a workspace name.' }
  }
  if (message.includes('INVALID_SLUG')) {
    return { ok: false, code: 'INVALID_NAME', message: 'Use letters or numbers in the name.' }
  }
  return { ok: false, code: 'ERROR', message: 'Could not create the workspace. Try again.' }
}
