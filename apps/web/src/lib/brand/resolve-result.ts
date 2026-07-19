import type { BrandMemoryPayload } from '@sahoda/shared'

// Pure charge-policy mapper for the resolve action. The action performs the I/O
// (mesh call inside withCredits) and translates its two outcomes into these
// value types; this function decides the user-facing state. Kept pure so the
// money-sensitive rule — never charge for a fallback or an error — is unit-tested.

export type MeshResolveOutcome =
  | { kind: 'real'; brain: BrandMemoryPayload }
  | { kind: 'fallback'; brain: BrandMemoryPayload }
  | { kind: 'error'; message: string }

export type CreditsOutcome =
  | { ok: true; balanceAfter: number }
  | { ok: false; insufficient: true; required: number; available: number }
  | { ok: false; insufficient: false; message: string }

export type ResolveActionState =
  | { ok: true; kind: 'resolved'; brain: BrandMemoryPayload; balanceAfter: number }
  | { ok: true; kind: 'fallback'; brain: BrandMemoryPayload; message: string }
  | { ok: false; kind: 'insufficient'; message: string; required: number; available: number }
  | { ok: false; kind: 'error'; message: string }

const FALLBACK_MESSAGE =
  'Showing a sample Brand Brain — the model could not be reached, so you were not charged. Retry to resolve yours.'
const GENERIC_ERROR = 'Could not resolve your Brand Brain — try again.'

/**
 * A DEBIT (`credits.ok`) only ever happens when the wrapped fn returned, which the
 * action arranges to mean a *real* resolve. A fallback or error throws inside the
 * wrapper → the hold is RELEASED (no charge); an insufficient balance fails the
 * HOLD before the model even runs. Map each to an honest typed state.
 */
export function mapResolveOutcome(
  mesh: MeshResolveOutcome | null,
  credits: CreditsOutcome,
): ResolveActionState {
  if (credits.ok) {
    if (mesh && mesh.kind === 'real') {
      return { ok: true, kind: 'resolved', brain: mesh.brain, balanceAfter: credits.balanceAfter }
    }
    // A charge without a real brain is a bug — never present it as a resolve.
    return { ok: false, kind: 'error', message: GENERIC_ERROR }
  }

  if (credits.insufficient) {
    return {
      ok: false,
      kind: 'insufficient',
      message: 'Not enough credits to resolve your Brand Brain.',
      required: credits.required,
      available: credits.available,
    }
  }

  // Hold released — distinguish a served fallback (show it, uncharged) from a hard error.
  if (mesh && mesh.kind === 'fallback') {
    return { ok: true, kind: 'fallback', brain: mesh.brain, message: FALLBACK_MESSAGE }
  }
  return { ok: false, kind: 'error', message: GENERIC_ERROR }
}
