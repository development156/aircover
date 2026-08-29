import type { DesignDocument } from '@sahoda/shared'

/**
 * KEEPING WHAT SOMEBODY TYPED, WHICH UNTIL NOW WAS ONE MISPRESS FROM GONE.
 *
 * ── THE LOSS THIS EXISTS TO STOP ────────────────────────────────────────────
 * The editor holds the whole design in browser state: a title, and every word
 * of every slot of up to ten slides. Nothing wrote it down until somebody
 * pressed "Save design". Filling a three-slide carousel is a few minutes of
 * typing, and Back, a closed tab, or a phone taking the tab away ended all of
 * it with no warning and no trace.
 *
 * ── WHY THIS IS A SAVE AND NOT A WARNING ────────────────────────────────────
 * The obvious fix is to ask "you have unsaved changes, leave anyway?". It does
 * not work here, and `use-flush-on-leave.ts` carries the measurement: pressing
 * Back inside this app does not unmount the segment, does not fire `pagehide`
 * and does not fire `beforeunload`, because Next keeps the segment in its
 * router cache and swaps the view. A dialog that cannot be shown on the most
 * common way out is not a guard. Writing the work down happens on every route
 * out that exists, so there is nothing to warn about.
 *
 * `beforeunload` still earns its place for the one case it does cover, a closed
 * tab or a hard reload, where the flush may not finish. It is the second belt,
 * not the strategy.
 *
 * ── "EVERY ROUTE OUT" HAS FOUR MEMBERS, NOT THREE ───────────────────────────
 * `useFlushOnLeave` covers Back, a backgrounded tab and a real unload. It does
 * NOT cover a forward link: `popstate` fires on Back and Forward, not on the
 * `pushState` a Next `<Link>` performs. "All designs" at the top of the editor
 * is a forward link and is the commonest deliberate way off the screen, so the
 * hook adds a fourth listener for it. Three out of four would have been a claim
 * true in fewer cases than this header states.
 *
 * Pure: no I/O, no clock, no React.
 */

/**
 * How long a pause counts as "stopped typing".
 *
 * A design save is one row write, not a model call, so this can be short. It is
 * long enough that a sentence typed at speed is one write rather than forty.
 */
export const AUTOSAVE_DELAY_MS = 1200

/** Everything about a design that a save actually stores. */
export type DesignDraft = {
  title: string
  doc: DesignDocument
  /**
   * Carried in the draft because `saveDesign` WRITES it: the column defaults to
   * `false` when the field is absent, so a save that omits it takes a starting
   * point off the shelf. That was already true of the Save button and cost
   * nothing visible only because it happened once per press; on an autosave it
   * would happen every time somebody paused typing.
   */
  isTemplate: boolean
}

/**
 * The same value, with every object key in a fixed order.
 *
 * ── THIS IS NOT TIDINESS, IT IS THE WHOLE COMPARISON ────────────────────────
 * The saved side of the comparison comes back from Postgres, where the document
 * lives in a `jsonb` column. `jsonb` does not preserve key order: it stores keys
 * sorted, and hands them back sorted. The browser's object has them in the order
 * the editor wrote them. A plain `JSON.stringify` of the two therefore differs
 * for a document nobody touched, which would report dirty forever and turn an
 * autosave into a write every 1.2 seconds for as long as the tab is open.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      out[key] = canonical(source[key])
    }
    return out
  }
  return value
}

/**
 * Is there anything to write down?
 *
 * Compared against the last CONFIRMED save rather than tracked with a flag. A
 * flag set on every edit stays true after somebody types a letter and deletes
 * it, which spends a write on nothing; and it cannot tell a failed save from a
 * finished one.
 */
export function draftIsDirty(draft: DesignDraft, saved: DesignDraft): boolean {
  return canonicalKey(draft) !== canonicalKey(saved)
}

/**
 * One string that stands for the whole draft.
 *
 * Exported because the debounce needs a STABLE dependency. `draft` is a fresh
 * object on every render, so an effect that depends on it restarts its timer
 * whenever anything else in the editor changes: choosing a picture, switching
 * slide, a status message arriving. Depending on `dirty` alone is worse and not
 * obviously so, because it stays `true` for as long as somebody keeps typing,
 * so the effect would never re-run and the autosave would fire once and then
 * never again until a save happened to land. This value changes exactly when
 * the design does.
 *
 * `JSON.stringify` is also doing a second job here besides comparing: it DROPS
 * keys whose value is `undefined`. A key the browser set to undefined and a key
 * the database never returned are the same absence, and counting them as
 * different would be the same false-dirty as key order. An explicit skip in
 * `canonical` was written for this first and deleted once it was shown to
 * change no test in either direction.
 */
export function canonicalKey(draft: DesignDraft): string {
  // The title is TRIMMED, matching `TitleSchema` in `app/actions/studio.ts`
  // (`z.string().trim()`). This is not cosmetic and it is not optional: the
  // server stores the trimmed title, so a draft ending in a space can never
  // equal the row that comes back, and without this the editor would write the
  // same row every 1.2 seconds for as long as that space is there. Trimming
  // here rather than in the editor's state means nothing is yanked out from
  // under somebody who is mid-word.
  return JSON.stringify(canonical({ ...draft, title: draft.title.trim() }))
}

/** Where a save has got to. `at` is the moment the row came back, not the moment it was sent. */
export type SaveState =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; message: string }

/**
 * What to say about it, and NOTHING when there is nothing to say.
 *
 * ── THE FAILURE SENTENCE IS THE ONE THAT MATTERS ────────────────────────────
 * A save that failed leaves the words on screen and nowhere else. The remedy
 * people reach for by habit is a reload, and a reload here would destroy
 * exactly the work the message is about. So the sentence says to keep the tab
 * open and names the button that tries again, and it never says "try again
 * later" without saying what keeps the words alive in the meantime.
 *
 * The server's own refusal is carried through rather than replaced: it already
 * separates "this design is gone" from "we could not reach the database", and
 * flattening those into one house sentence would lose the distinction.
 */
export function describeSaveState(state: SaveState, dirty: boolean): string | null {
  if (state.kind === 'failed') {
    return `${state.message} Your words are still on this screen. Keep this tab open and press Save design to try again.`
  }
  if (state.kind === 'saving') return 'Saving…'
  // Typed since the last save and the write has not started yet. Said plainly,
  // because silence here reads as "saved" to somebody watching for a change.
  if (dirty) return 'Not saved yet'
  if (state.kind === 'saved') return 'Saved'
  // Nothing typed and nothing saved this visit: the design on screen is the
  // design in the database, and a status about it would be noise.
  return null
}
