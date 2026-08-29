import { ALL_KINDS } from '@/lib/connections/kinds'
import { cn } from '@/lib/utils'

/**
 * ONE GLYPH PER CATEGORY ROW, DRAWN RATHER THAN IMPORTED.
 *
 * ── WHY THIS IS NOT ELEVEN LUCIDE IMPORTS ────────────────────────────────────
 * It was, for about an hour, and the build refused it. MEASURED with
 * `pnpm --filter @sahoda/web build`: eleven `lucide-react` icons put
 * `/connections` at **693.0 kB against a 683.9 kB budget with 8 kB of slack**,
 * which is 1.1 kB past the ceiling; the same build with the glyphs removed and
 * nothing else changed reported `js-budget ok: 81 routes within budget`. So the
 * cost is the icons and the number is not a guess.
 *
 * This is the shared sprite the previous attempt said they would have to come
 * back as. One `<svg>` element, one set of attributes, and a path per category —
 * so eleven React components carrying eleven attribute maps become eleven path
 * strings inside one component that is itself in the bundle once.
 *
 * ── THE GLYPHS ARE ORIGINAL, AND DELIBERATELY PLAIN ──────────────────────────
 * Drawn on lucide's 24x24 grid at stroke 2 with round caps so they sit beside the
 * `Search` and `ChevronRight` this page already renders without looking like a
 * second icon set. They are outlines of the obvious noun and nothing more: this
 * is navigation chrome beside a label that already carries the whole claim, so a
 * clever glyph would be a glyph the reader has to decode.
 *
 * ── ALWAYS DECORATIVE ────────────────────────────────────────────────────────
 * `aria-hidden` is fixed here rather than passed in. The rail's rows already
 * carry an `aria-label` naming the category and its count, so a glyph a screen
 * reader announced would make every row say its category twice. There is no call
 * site where this should be anything other than silent, so there is no prop for
 * it.
 */

/**
 * What each category is drawn as. Keyed by the catalogue's own `kind` string,
 * plus `ALL_KINDS`.
 *
 * ── THIS IS A LOOKUP, NOT A LIST OF CATEGORIES ───────────────────────────────
 * `lib/connections/kinds.ts` exists because the category axis is DERIVED: the
 * facets, their order and their counts all fall out of the catalogue rows handed
 * in, so a sixteenth channel puts a sixteenth row on the screen with nobody's
 * involvement. A second hand-written list of categories would undo that in one
 * commit.
 *
 * This map cannot become that list, because `KindGlyph` answers for every string:
 * a category added tomorrow renders the fallback and a real count rather than a
 * gap where a drawing should be. `kind-glyph.test.tsx` then goes red and names
 * the kind, so a new category is a soft landing at runtime and a build failure at
 * review time. Those are the right two answers to the same event.
 */
const GLYPH: Readonly<Record<string, React.ReactNode>> = {
  // Four panes. "Everything, arranged" — the only row that is not a category.
  [ALL_KINDS]: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  // Two people: the feed is other people.
  'Social feed': (
    <path d="M9.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M3.5 19.5a6 6 0 0 1 12 0M16.5 5.2a3.2 3.2 0 0 1 0 6.4M17 14.2a5 5 0 0 1 3.5 5.3" />
  ),
  // A pin. Correct here and wrong as a missing-mark fallback in `channel-logo.tsx`:
  // there it stood in for a channel and read as a claim about it, here the
  // category IS a place.
  'Local listing': (
    <path d="M12 21c4-3.6 7-7.3 7-10.5a7 7 0 1 0-14 0C5 13.7 8 17.4 12 21M12 8.2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8" />
  ),
  // A screen with a lens flap. Long-form video.
  Video: <path d="M3.5 6.5h11v11h-11zM14.5 11l6-3.2v8.4l-6-3.2z" />,
  // A ribbon. Pinterest's own noun for the thing you save to.
  Boards: <path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z" />,
  // Waves off a point. A broadcast is one sender and no reply.
  Broadcast: (
    <path d="M12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
  ),
  // A clapperboard. Short video is film, not television.
  'Short video': <path d="M3.5 10.5h17v9h-17zM3.5 10.5 4.6 5l15.4-1.5 1 5.5z" />,
  // A speech bubble with a tail. One person writing to one person.
  Messaging: <path d="M4.5 4.5h15v10h-10l-5 4z" />,
  // A globe with a meridian. A community is a place you go, not a wire.
  Community: (
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M3.5 12h17M12 3.5a12 12 0 0 1 0 17 12 12 0 0 1 0-17" />
  ),
  // A hash. The channel prefix every team-chat product uses.
  'Team chat': <path d="M5 9.5h14M5 14.5h14M10.5 4.5 8.5 19.5M15.5 4.5l-2 15" />,
}

/**
 * The mark for a category nobody has drawn: a luggage tag.
 *
 * "Filed under something" is exactly the claim, and it is honest about being a
 * stand-in rather than pretending to describe the category — the row's label
 * beside it is doing that work already.
 */
const FALLBACK = <path d="M4 4h7.5l8.5 8.5-7.5 7.5L4 11.5zM7.8 7.8h.01" />

/** The ids this file draws. Exported for the coverage guard, not for rendering. */
export const DRAWN_KINDS: readonly string[] = Object.keys(GLYPH)

/** Is there a drawing for this id, or will it get the tag? For the guard. */
export function isDrawn(id: string): boolean {
  return id in GLYPH
}

export function KindGlyph({ id, className }: { id: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4 shrink-0', className)}
    >
      {GLYPH[id] ?? FALLBACK}
    </svg>
  )
}
