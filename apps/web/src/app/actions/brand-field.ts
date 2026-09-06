'use server'

import { revalidatePath } from 'next/cache'

import { saveBrandMemory, type SaveBrandState } from '@/app/actions/brand-resolve'
import { blankReason } from '@/lib/brand/blank'
import { BRAIN_FIELDS } from '@/lib/brand/fields'
import { MAX_OPEN_LIST_ENTRIES } from '@/lib/brand/limits'
import { leavesEqual, readLeaf, writeLeaf, type BrainLeaf } from '@/lib/brand/leaf'
import { readBrain } from '@/lib/brand/read-brain'
import { reportServerError } from '@/lib/observability/report'

export type ConfirmFieldState =
  { ok: true; version: number; unchanged: boolean } | { ok: false; message: string }

/**
 * Reject anything that is not a known, editable field carrying a value of the
 * right shape. The RPC re-checks the payload and `saveBrandMemory` zod-parses it,
 * so this is not the security boundary — it exists to turn a bad request into a
 * sentence the user can act on instead of "That Brand Brain is incomplete".
 */
function validate(path: string, value: BrainLeaf): string | null {
  const field = BRAIN_FIELDS.find((candidate) => candidate.path === path)
  // Unknown paths include the DERIVED ones on purpose: `alignment.*` is computed
  // from the other fields, so there is nothing there for a person to confirm.
  if (!field) return 'That field cannot be edited.'

  if (field.kind === 'list') {
    if (!Array.isArray(value)) return 'That field expects a list.'
    if (field.fixedLength && value.length !== 3) return 'This list holds exactly three entries.'
    if (!field.fixedLength && value.length > MAX_OPEN_LIST_ENTRIES) {
      return `Keep this list to ${MAX_OPEN_LIST_ENTRIES} entries or fewer.`
    }
    if (value.some((entry) => typeof entry !== 'string')) return 'That list expects text entries.'
    return blankReason(field, value)
  }

  if (typeof value !== 'string') return 'That field expects text.'
  // MEASURED 2026-09-06: three spaces were saved as the core promise and marked
  // confirmed. Shape checks alone let a blank through; see lib/brand/blank.ts.
  return blankReason(field, value)
}

/**
 * Confirm one field of the Brand Brain.
 *
 * Editing a field — or simply agreeing with it — is how it becomes confirmed, and
 * this is the whole write path for it: read the active brain, replace one leaf if
 * the text changed, and save as a `manual` version naming that path as confirmed.
 * `field_meta` records the confirmation against the path itself
 * (lib/brand/field-meta.ts), and the field's border goes from dashed to solid.
 *
 * IT NEVER RE-RESOLVES. A resolve is `brand_research` — 50 credits, a model call,
 * and a fresh payload for EVERY field, which would overwrite the fourteen answers
 * the user did not touch and demote each of them back to a guess. Charging fifty
 * credits to record one sentence, and losing prior confirmations in the process,
 * is the trap this action exists to avoid. There is deliberately no mesh import
 * and no `withCredits` call in this file; confirming a field is free.
 */
export async function confirmBrainField(
  path: string,
  value: BrainLeaf,
): Promise<ConfirmFieldState> {
  try {
    const invalid = validate(path, value)
    if (invalid) return { ok: false, message: invalid }

    // Read-modify-write on the ACTIVE version. `readBrain` resolves the workspace
    // and enforces RLS, so a caller cannot name someone else's brain.
    const brain = await readBrain()
    if (brain.status === 'no-workspace') return { ok: false, message: 'Create a workspace first.' }
    if (brain.status === 'no-brain') {
      return { ok: false, message: 'Set up your Brand Brain before editing it.' }
    }
    if (brain.status === 'unreadable') {
      return { ok: false, message: 'Could not read your Brand Brain. Reload and try again.' }
    }

    // Unchanged text on an ALREADY-confirmed field is the only true no-op left:
    // there is no new value and no new fact about who stands behind it, so a
    // write would burn a version to record nothing. Blur-without-typing is the
    // common case here, so this is the common path, not an edge case.
    //
    // Unchanged text on a GUESS is emphatically not a no-op — it is a person
    // saying "that one is right", which is the single most valuable thing they
    // can do on this page. Under version-diffing it was unrepresentable: an
    // identical payload records no change, so the diff had nothing to attribute
    // and the editor had to refuse the write. `field_meta` carries the
    // confirmation independently of the text, so agreeing now costs one tap
    // instead of retyping a sentence verbatim.
    const unchangedText = leavesEqual(readLeaf(brain.active, path), value)
    if (unchangedText && brain.meta?.[path]?.confirmed === true) {
      return { ok: true, version: brain.version, unchanged: true }
    }

    const next = unchangedText ? brain.active : writeLeaf(brain.active, path, value)
    const saved: SaveBrandState = await saveBrandMemory(next, 'manual', [path])
    if (!saved.ok) return { ok: false, message: saved.message }

    // The ring lives in the app layout, so a page-scoped revalidate would leave
    // it reading the old count until a manual reload — the same trap the credit
    // chip fell into.
    revalidatePath('/', 'layout')
    revalidatePath('/brain')
    return { ok: true, version: saved.version, unchanged: saved.replayed }
  } catch (error) {
    reportServerError(error, { action: 'confirmBrainField' })
    return { ok: false, message: 'Could not save that field. Try again.' }
  }
}
