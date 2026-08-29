/**
 * A CUSTOMER'S OWN STARTING POINTS.
 *
 * ── THE RULING THIS FINALLY IMPLEMENTS ──────────────────────────────────────
 * Founder's ruling, 2026-08-28: customers save their own starting points now,
 * and Sahoda ships curated ones later. `studio_designs.is_template` was added
 * that day and until now NOTHING wrote it and no screen read it: the column
 * existed, the read function existed, and the feature did not.
 *
 * ── THE ONE THING A PERSON MUST BE TOLD BEFORE THEY PRESS ───────────────────
 * `readDesigns` splits on that boolean, so a design kept as a starting point
 * LEAVES "your designs" and appears under starting points instead. It is not
 * copied and nothing is duplicated. A person who is not told this presses the
 * button and watches their design vanish from the list they were looking at,
 * which reads as deletion. So the control says where it goes, before and after.
 *
 * ── AND STARTING FROM ONE IS A COPY, WHICH IS THE OPPOSITE ──────────────────
 * The template is not consumed and not modified. A new design is written with
 * the same words and the same pictures, and the two are independent from that
 * moment: editing the copy never touches the starting point. That asymmetry is
 * the whole feature, so both sentences name which of the two happened.
 *
 * Pure: no I/O, no clock, no database.
 */

/** Said after a design becomes a starting point, and after it stops being one. */
export const TEMPLATE_KEPT =
  'Kept as a starting point. It has moved out of your designs, and you can start a new design from it any time.'

export const TEMPLATE_RELEASED = 'Back in your designs. It is no longer a starting point.'

/** Said when a new design has been made from a starting point. */
export function describeStartedFrom(title: string): string {
  const name = title.trim()
  return name === ''
    ? 'Started a new design from your starting point. The original is untouched.'
    : `Started a new design from ${`“${name}”`}. The original is untouched.`
}

export const TEMPLATE_REFUSALS = {
  notFound: 'That design is not in this workspace.',
  unreadable: 'This design could not be opened, so nothing was changed.',
  flagFailed: 'This could not be saved just now. Nothing was changed.',
  copyFailed: 'A new design could not be started from this one. Nothing was changed.',
} as const

/**
 * What the starting-points shelf says when it holds nothing.
 *
 * Four states again, and the same rule as `emptiness.ts`: only ONE of them has
 * earned the sentence "you have none". A read that failed is not an empty
 * shelf, and telling somebody their saved starting points are gone is the
 * expensive way to be wrong.
 */
export type TemplateShelf =
  | { kind: 'no-workspace' }
  | { kind: 'unreadable'; message: string }
  | { kind: 'empty'; body: string }
  | { kind: 'has-templates'; unreadable: number }

export function templateShelf(read: {
  status: 'ok' | 'no-workspace' | 'unreadable'
  designs?: readonly unknown[]
  unreadable?: number
}): TemplateShelf {
  if (read.status === 'no-workspace') return { kind: 'no-workspace' }
  if (read.status === 'unreadable') {
    return {
      kind: 'unreadable',
      message:
        'Your starting points could not be read just now. Nothing was lost, and this is not a reading of how many you have.',
    }
  }
  const count = read.designs?.length ?? 0
  const unreadable = read.unreadable ?? 0
  if (count === 0 && unreadable === 0) {
    return {
      kind: 'empty',
      body: 'Open any design you like and keep it as a starting point. It appears here, and every new design from it begins with your words and pictures already in place.',
    }
  }
  return { kind: 'has-templates', unreadable }
}
