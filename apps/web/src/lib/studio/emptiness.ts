import type { DesignListRead } from './read'

/**
 * TELLING "YOU HAVE NO DESIGNS" APART FROM "WE COULD NOT READ THEM".
 *
 * ── WHY THIS EXISTS, AND WHY IT IS A MODULE RATHER THAN THREE INLINE STRINGS ─
 * `lib/inbox/emptiness.ts` is the precedent, and its reason applies here
 * exactly: a list that comes back empty has several genuinely different
 * meanings, and rendering one sentence for all of them makes Sahoda lie in the
 * direction of a claim about the CUSTOMER'S OWN WORK.
 *
 * "You have no designs yet" is the worst of them to get wrong. A person who has
 * made forty and is told they have none does not conclude there was a network
 * problem; they conclude their work is gone. The read failing and the gallery
 * being empty must never share a sentence.
 *
 * ── FOUR STATES, AND ONLY ONE EARNS "NONE YET" ─────────────────────────────
 *   no-workspace   designs live in a workspace and this account is not in one
 *   unreadable     we asked and could not get an answer
 *   partial        we got an answer and some rows would not open
 *   empty          we asked, every row came back, and there were none
 *
 * ── THE TESTS ASSERT THE CLAIM, NOT THE WORDING ────────────────────────────
 * `studio-emptiness.test.ts` checks that the failure sentence never contains
 * "no designs" and that the empty one never suggests reloading. Rewrite any
 * sentence here freely; the guarantee is what is pinned.
 */

export type StudioEmptiness =
  | { kind: 'no-workspace'; title: string; body: string }
  | { kind: 'unreadable'; message: string }
  | { kind: 'empty'; title: string; body: string }
  | { kind: 'has-designs'; unreadable: number }

/**
 * What the gallery should say about a read.
 *
 * ── A PARTIAL READ IS NOT AN EMPTY ONE, EVEN WHEN NOTHING PARSED ────────────
 * A workspace whose only three designs all failed to parse gets `has-designs`
 * with `unreadable: 3`, NOT `empty`. The rows exist. Saying "no designs yet"
 * there would be the same lie as saying it after a failed read, arrived at by a
 * different route, and it is the one a `designs.length === 0` check makes by
 * accident.
 */
export function studioEmptiness(read: DesignListRead): StudioEmptiness {
  if (read.status === 'no-workspace') {
    return {
      kind: 'no-workspace',
      title: 'No workspace yet',
      body: 'Designs belong to a workspace, and this account is not in one. Create a workspace and Studio opens with it.',
    }
  }

  if (read.status === 'unreadable') {
    return {
      kind: 'unreadable',
      message:
        'Your designs could not be read just now. Nothing was lost. Reload the page, and if it keeps happening the problem is at our end rather than yours.',
    }
  }

  if (read.designs.length === 0 && read.unreadable === 0) {
    return {
      kind: 'empty',
      title: 'No designs yet',
      body: 'Pick a layout above and Studio opens it with your brand already applied. Exports are free.',
    }
  }

  return { kind: 'has-designs', unreadable: read.unreadable }
}

/**
 * The note above a gallery holding rows that would not open.
 *
 * Null in the ordinary case. It says nothing was deleted, because that is the
 * conclusion a person otherwise reaches, and it is wrong: the row is there and
 * this application could not parse it.
 */
export function describeUnreadableDesigns(count: number): string | null {
  if (count <= 0) return null
  return count === 1
    ? '1 design could not be opened and is not shown here. Nothing was deleted.'
    : `${count} designs could not be opened and are not shown here. Nothing was deleted.`
}
