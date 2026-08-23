'use server'

import { revalidatePath } from 'next/cache'

import { saveBrandMemory, type SaveBrandState } from '@/app/actions/brand-resolve'
import { BRAIN_FIELDS } from '@/lib/brand/fields'
import { readBrain } from '@/lib/brand/read-brain'
import { reportServerError } from '@/lib/observability/report'

/**
 * Confirm SEVERAL Brand Brain fields in one write — the Signal Resolution
 * Console's bulk accept.
 *
 * ── WHY THIS IS NOT A LOOP OVER `confirmBrainField` ──────────────────────────
 * `confirmBrainField` (actions/brand-field.ts) does a read-modify-write and one
 * `resolve_brand_memory` call per field. Calling it eight times to accept eight
 * guesses would write EIGHT versions of the brain for one user gesture, and
 * `brand_memory` is append-only — so a single press would bury the version a
 * person might want to look back at under seven identical payloads whose only
 * difference is the provenance map. It would also be non-atomic: a failure on
 * the fifth leaves four confirmed, three not, and a UI with no honest way to
 * say which.
 *
 * `saveBrandMemory` already takes `confirmPaths` as a SET — `nextFieldMeta`
 * stamps every path in it in one pass — so the whole gesture is one version and
 * one round trip. Nothing about the write path changes to support this; the
 * capability was already there and nothing had called it with more than one
 * path.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * It never changes a VALUE. Bulk accept means "these guesses are right as
 * written", so the payload it saves is the payload it read. A bulk path that
 * could also edit text would be a way to rewrite fourteen fields from one
 * button, and no screen could show what was about to happen.
 *
 * It never re-resolves and never charges. Same reason `confirmBrainField` does
 * not: a resolve is 50 credits and rewrites every field, including ones already
 * confirmed. There is deliberately no mesh import and no `withCredits` call in
 * this file.
 */
export type ResolveFieldsState =
  { ok: true; version: number; confirmed: number } | { ok: false; message: string }

const KNOWN = new Set(BRAIN_FIELDS.map((field) => field.path))

export async function confirmBrainFields(paths: readonly string[]): Promise<ResolveFieldsState> {
  try {
    /**
     * De-duplicated before anything counts them.
     *
     * The count in the success message is what the UI reports back to the user,
     * so a repeated path would inflate it — `Confirmed 4 fields` for three
     * fields is a claim about their own brain that no query would produce, and
     * `nextFieldMeta` iterates the registry rather than this list, so the extra
     * entry changes nothing about what is written. The set is also what makes a
     * duplicated checkbox id harmless rather than merely unlikely.
     */
    const requested = [...new Set(paths)]
    const unknown = requested.filter((path) => !KNOWN.has(path))
    if (unknown.length > 0) {
      // Includes the DERIVED paths on purpose: `alignment.*` is computed from
      // the other fields, so there is nothing there for a person to confirm.
      return { ok: false, message: 'Some of those fields cannot be confirmed.' }
    }
    if (requested.length === 0) return { ok: false, message: 'Pick at least one field first.' }

    const brain = await readBrain()
    if (brain.status === 'no-workspace') return { ok: false, message: 'Create a workspace first.' }
    if (brain.status === 'no-brain') {
      return { ok: false, message: 'Set up your Brand Brain before confirming anything in it.' }
    }
    if (brain.status === 'unreadable') {
      return { ok: false, message: 'Could not read your Brand Brain. Reload and try again.' }
    }

    /**
     * THE PAYLOAD IS PASSED THROUGH UNCHANGED. `saveBrandMemory` re-reads the
     * active brain itself to stamp provenance against it, so this hands back
     * exactly what it was given and the only thing that moves is `field_meta`.
     */
    const saved: SaveBrandState = await saveBrandMemory(brain.active, 'manual', requested)
    if (!saved.ok) return { ok: false, message: saved.message }

    // The ring lives in the app layout, so a page-scoped revalidate would leave
    // it reading the old count until a manual reload.
    revalidatePath('/', 'layout')
    revalidatePath('/brain')
    revalidatePath('/brain/resolve')
    return { ok: true, version: saved.version, confirmed: requested.length }
  } catch (error) {
    reportServerError(error, { action: 'confirmBrainFields' })
    return { ok: false, message: 'Could not confirm those fields. Try again.' }
  }
}
