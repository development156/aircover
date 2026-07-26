/**
 * The only places in `apps/web` allowed to paint with `--ink-faint`.
 *
 * UI_RULES_v3: `--ink-faint` is DISABLED + DECORATIVE ONLY. It is #a8a29e on a
 * white surface — about 2.5:1, well under the 4.5:1 floor — so any text a user
 * has to READ must use `--ink-mute` (5.4:1) instead. That covers empty-state
 * copy, status text, eyebrow labels, table headers, placeholders and hints.
 *
 * Two things stay legitimate at this contrast:
 *   - a genuinely DISABLED control or a step not yet reachable, which WCAG
 *     exempts because it is not currently actionable, and
 *   - a purely DECORATIVE glyph carrying `aria-hidden`, which conveys nothing a
 *     screen reader or a sighted user needs to decode.
 *
 * `uses` is the exact count `ink-faint.test.ts` expects in that file. Pinning the
 * count — not just the filename — is deliberate: an allowlist keyed on filename
 * alone would let a new piece of unreadable body copy slip into an already-listed
 * file for free, which is precisely how the 48 uses accumulated in the first place.
 */
export interface InkFaintException {
  /** How many `--ink-faint` applications this file is allowed to contain. */
  uses: number
  /** Why each one is disabled or decorative rather than content. */
  reason: string
}

export const INK_FAINT_EXCEPTIONS: Readonly<Record<string, InkFaintException>> = Object.freeze({
  'src/components/onboarding/step-rail.tsx': {
    uses: 2,
    reason:
      'An "upcoming" step is not yet reachable — the label and its numbered dot are the disabled state of a control, not content the user acts on now.',
  },
  'src/components/onboarding/logo-drop.tsx': {
    uses: 1,
    reason: 'aria-hidden upload glyph. Decorative — the adjacent label carries the meaning.',
  },
  'src/components/posts/media-pane.tsx': {
    uses: 1,
    reason: 'aria-hidden empty-media glyph. Decorative — the copy beneath states the same thing.',
  },
})
