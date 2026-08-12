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
 *
 * ── THIS IS A DEBT REGISTER, NOT A SUPPRESSION LIST ──────────────────────────
 *
 * Two kinds of entry live here and they are not the same thing:
 *
 *   · `kind: 'legitimate'` — disabled or decorative. Correct as written. Permanent.
 *   · `kind: 'debt'`       — a REAL contrast defect, recorded so it stays visible
 *                            and scheduled. Every one must be fixed and deleted.
 *
 * Exact file paths only. No globs, no directory wildcards — a glob would let
 * future drift hide inside an entry that already exists.
 *
 * `debt-ratchet.test.ts` enforces that this register may only ever SHRINK.
 * Adding an entry fails the gate. That is the whole point: without the ratchet
 * this file decays into the dumping ground that produced the original 48 uses.
 */
export interface InkFaintException {
  /** How many `--ink-faint` applications this file is allowed to contain. */
  uses: number
  /** Why each one is disabled or decorative rather than content. */
  reason: string
  /** `legitimate` = correct and permanent. `debt` = a real defect, owed a fix. */
  kind: 'legitimate' | 'debt'
  /** ISO date this entry was added. */
  since: string
  /** Card that owns removing it. Required for `debt`, absent for `legitimate`. */
  card?: string
}

/**
 * The admin-console entries below are all `debt`, added 2026-07-28.
 *
 * They are not a new regression. `wt-admin` branched BEFORE the v3 readability
 * work landed on `wt-web` (Phase 1a, 8ea9155, which moved 43 content strings off
 * `--ink-faint`), and was never run against these guards. The trunk merge is the
 * first time the admin console has met them — so the merge did not break this,
 * it REVEALED that 16 admin files have been below the contrast floor since they
 * were written, in code that already builds to preview.
 *
 * Recorded rather than fixed on 2026-07-28 because the admin console is frozen
 * scope for the 30-day launch plan (docs/audit/2026-07-27/03-30-day-plan.md §7)
 * and rewriting 16 components inside a branch-reconciliation phase is the class
 * of improvisation that phase exists to prevent. SL-044 owns the fix, Week 1.
 */
export const INK_FAINT_EXCEPTIONS: Readonly<Record<string, InkFaintException>> = Object.freeze({
  // ── legitimate: disabled or decorative, permanent ──────────────────────────
  'src/components/onboarding/step-rail.tsx': {
    uses: 2,
    kind: 'legitimate',
    since: '2026-07-26',
    reason:
      'An "upcoming" step is not yet reachable — the label and its numbered dot are the disabled state of a control, not content the user acts on now.',
  },
  'src/components/posts/media-pane.tsx': {
    uses: 1,
    kind: 'legitimate',
    since: '2026-07-26',
    reason: 'aria-hidden empty-media glyph. Decorative — the copy beneath states the same thing.',
  },

  // ── debt: real contrast defects in the admin console. Owed a fix (SL-044). ──
  'src/app/admin/applications/page.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Page meta text at ~2.5:1. Content, not decoration — belongs on text-muted. Pre-dates the v3 readability guards; recorded, not accepted.',
  },
  'src/app/admin/credits/page.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Page meta text at ~2.5:1 on the credit-grant screen. Content, not decoration. Pre-dates the v3 readability guards.',
  },
  'src/app/admin/qa/page.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Page meta text at ~2.5:1. Content, not decoration — belongs on text-muted. Pre-dates the v3 readability guards.',
  },
  'src/app/admin/team/page.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Page meta text at ~2.5:1. Content, not decoration — belongs on text-muted. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/applications-view.tsx': {
    uses: 2,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Table header and row meta at ~2.5:1, read by an operator triaging applications. Content. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/board-view.tsx': {
    uses: 2,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Card eyebrow and count label at ~2.5:1. Both are read, neither is decorative. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/board.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Column meta text at ~2.5:1. Content, not decoration. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/changelog-rail.tsx': {
    uses: 2,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Entry eyebrow and timestamp at ~2.5:1. A timestamp an operator reads is content. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/changelog.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Entry meta text at ~2.5:1. Content, not decoration. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/credits-view.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Credit-request meta at ~2.5:1 on a money screen — the least acceptable place for text a reviewer must read. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/qa-console-view.tsx': {
    uses: 3,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Filter labels and run meta at ~2.5:1. All three are read by an operator. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/qa-run-row.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Run timestamp at ~2.5:1. Content, not decoration. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/strips.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Gate-strip label at ~2.5:1. It states whether a gate passed, so it is content. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/sub-nav.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Inactive nav item at ~2.5:1. An inactive tab is still actionable, so the WCAG disabled exemption does not apply. Pre-dates the v3 readability guards.',
  },
  'src/components/admin/team-view.tsx': {
    uses: 4,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Four uses — table headers plus role and seat meta, all read by an operator managing access. Pre-dates the v3 readability guards.',
  },
})
