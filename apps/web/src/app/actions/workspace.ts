'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth, currentUser } from '@clerk/nextjs/server'
import { z } from 'zod'

import { describeZoneRefusal, isKnownZone } from '@/lib/time/zone'

import { slugify } from '@/lib/slug'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  bootstrapWithRetry,
  deriveSlugSeed,
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
  const providedName = typeof provided === 'string' ? provided : null
  const identity = {
    firstName: user?.firstName,
    username: user?.username,
    email: firstEmail(user),
  }
  // The display name and the slug seed diverge on purpose: the name must not
  // carry the creator's identity, the slug must (see deriveSlugSeed).
  const name = deriveWorkspaceName(providedName)

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
    slugify(deriveSlugSeed(providedName, identity)),
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
/**
 * A zone name this runtime can actually resolve — THE SAME TEST THE READERS USE.
 *
 * ── THE WRITE GATE WAS WIDER THAN THE READ GATE ──────────────────────────────
 * This used to be a local `isRealTimezone`: a bare `new Intl.DateTimeFormat`
 * try/catch. `lib/time/zone.ts`'s `isKnownZone`, which every screen consults
 * before rendering a time, additionally refuses a leading `+`/`-` and anything
 * without a `/` (except `UTC`). So the two disagreed, and the save side was the
 * generous one.
 *
 * MEASURED on this Node: `IST`, `Japan`, `Singapore`, `Egypt`, `EST5EDT` and
 * `+05:30` were all ACCEPTED and stored, and `isKnownZone` rejects every one.
 * The customer saved, the field read the value back to them as saved, and every
 * screen went on rendering IST with nothing anywhere saying the setting had been
 * ignored. A setting that silently changes nothing is the defect this file's own
 * comment names two paragraphs down.
 *
 * Importing the reader's predicate rather than restating it is the point: two
 * copies of a rule are two rules, and these two had already drifted.
 *
 * The database trigger `workspaces_timezone_is_real` is a second, INDEPENDENT
 * check and is deliberately not described as equivalent: it refuses
 * `Asia/Kolkatta` and accepts `IST`, so it is wider than this. Narrowing it
 * needs a migration, which is wt-db's to write.
 */

/**
 * Record where this business is, or withdraw the answer.
 *
 * ── NULL IS A REAL ANSWER AND CLEARING MUST STAY POSSIBLE ────────────────────
 * `null` means nobody has told us, which is true of 32 of the 33 workspaces
 * that exist. Somebody who set the wrong zone has to be able to take it back to
 * "unknown" rather than being forced to leave a wrong answer standing.
 *
 * ── WHAT THIS DOES, AND WHAT IT STILL DOES NOT ───────────────────────────────
 * This block used to read "Nothing in the product reads this column yet", and
 * that stopped being true when `lib/time/zone.ts` landed and Posts began
 * resolving times through it. The copy on the settings screen was rewritten in
 * the same change; this comment was not, so the stale claim sat directly above
 * the action the change had just made meaningful.
 *
 * What is still true: the Planner is NOT fully on it. `PlannerUpcoming` has its
 * own hardcoded `Asia/Kolkata` formatter, and the week timeline places cards by
 * IST while labelling them in the workspace zone. Those are tracked separately;
 * the settings copy no longer promises them.
 */
export async function setWorkspaceTimezone(
  workspaceId: string,
  timezone: string | null,
): Promise<{ ok: true; timezone: string | null } | { ok: false; message: string }> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this setting.' }

    const id = z.uuid().safeParse(workspaceId)
    if (!id.success) return { ok: false, message: 'That workspace could not be found.' }

    const trimmed = timezone === null ? null : timezone.trim()
    const next = trimmed === null || trimmed.length === 0 ? null : trimmed
    if (next !== null && !isKnownZone(next)) {
      // Which of the three refusals it was. "Sahoda does not recognise IST" is
      // false — it is recognised and ambiguous, and those need different words.
      return { ok: false, message: describeZoneRefusal(next) }
    }

    const supabase = createServerSupabase()
    // `.select()` for the reason `renameWorkspace` gives: PostgREST returns a
    // null error for an UPDATE that matched no rows, so an update RLS refused
    // would otherwise report success. The returned row is the evidence.
    const { data, error } = await supabase
      .from('workspaces')
      .update({ timezone: next })
      .eq('id', id.data)
      .select('timezone')
      .maybeSingle()

    if (error) return { ok: false, message: 'Could not save the time zone. Try again.' }
    /**
     * NO ROW IS ITS OWN ANSWER, AND IT NEEDS ITS OWN SENTENCE.
     *
     * PostgREST reports a null error for an UPDATE that matched nothing, so
     * this arm is RLS having refused the write: the workspace is not this
     * caller's, or is not there. "Try again" is a remedy that cannot work for
     * that, and offering one is the defect `no-impossible-remedy` exists to
     * catch.
     *
     * Found by mutation. While both arms shared a sentence, deleting `!data`
     * left every test green: `data` was null, reading `.timezone` threw, and
     * the catch produced the same message. The guard was being enforced by an
     * exception nobody had noticed, and one `data?.timezone ?? null` later it
     * would have reported success on a refused write.
     */
    if (!data) return { ok: false, message: 'That workspace could not be found.' }

    revalidatePath('/settings')
    return { ok: true, timezone: (data as { timezone: string | null }).timezone }
  } catch {
    return { ok: false, message: 'Could not save the time zone. Try again.' }
  }
}

/**
 * Auto-detect: store the browser's own zone as the workspace's, but ONLY when
 * the workspace has none. Called on load from the client with
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`.
 *
 * ── WHY THIS IS NOT `setWorkspaceTimezone` ───────────────────────────────────
 * That one OVERWRITES, because a person opened Settings and chose. This runs
 * unbidden on every visit, so it must never move a chosen zone. `.is('timezone',
 * null)` makes "only if unset" a condition of the UPDATE itself rather than a
 * read-then-write two tabs could both pass — the write matches no row the moment
 * a zone exists.
 *
 * ── WHY STORING A DETECTED ZONE IS HONEST, WHERE A DEFAULT IS NOT ─────────────
 * `lib/time/zone.ts` refuses to write a DISPLAY fallback (IST/UTC) into the
 * column because that fabricates a claim about where somebody lives. A zone the
 * browser resolved is the reader's ACTUAL clock, not a fabrication — the same
 * signal a person would type in Settings, arriving without the typing. It is
 * validated by the same `isKnownZone` gate, so auto-detect can never store what
 * a person could not, and Settings still overrides it.
 *
 * No row is not a failure: it means the zone was already set (every visit after
 * the first) or RLS declined. Either way nothing changed and nothing is
 * revalidated. Only a zone that actually landed revalidates the screens that
 * render a scheduled time, so the display and the picker agree from that load.
 */
export async function autoDetectWorkspaceTimezone(
  workspaceId: string,
  detected: string,
): Promise<{ ok: true; timezone: string | null } | { ok: false; message: string }> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }

    const id = z.uuid().safeParse(workspaceId)
    if (!id.success) return { ok: false, message: 'That workspace could not be found.' }

    // The same gate Settings applies: an offset, an abbreviation, or a name Intl
    // cannot resolve is refused. Auto-detect must never write what a person could
    // not type.
    if (!isKnownZone(detected)) return { ok: false, message: 'Unrecognised time zone.' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('workspaces')
      .update({ timezone: detected })
      .eq('id', id.data)
      .is('timezone', null) // never moves a zone a person chose
      .select('timezone')
      .maybeSingle()

    if (error) return { ok: false, message: 'Could not save the time zone.' }
    // Already set, or RLS declined — a no-op, not a write we may claim.
    if (!data) return { ok: true, timezone: null }

    revalidatePath('/posts')
    revalidatePath('/planner')
    revalidatePath('/home')
    revalidatePath('/settings')
    return { ok: true, timezone: (data as { timezone: string | null }).timezone }
  } catch {
    return { ok: false, message: 'Could not save the time zone.' }
  }
}

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
      return { ok: false, message: 'Could not rename this workspace. Try again.' }
    }

    revalidatePath('/settings')
    revalidatePath('/', 'layout')
    return { ok: true, name: (data as { name: string }).name }
  } catch {
    return { ok: false, message: 'Could not rename this workspace. Try again.' }
  }
}
