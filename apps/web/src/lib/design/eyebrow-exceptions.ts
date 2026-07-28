/**
 * The only places in `apps/web` allowed to hand-roll an eyebrow.
 *
 * An eyebrow is `type-eyebrow` — `--t-eyebrow` + `--t-eyebrow-ls` + uppercase.
 * Spelling it out inline (`text-[11px] tracking-[0.06em] uppercase`) produces
 * something that LOOKS right today and cannot follow the token when it moves,
 * which is exactly what happened across the v3 swap.
 *
 * Same contract as `ink-faint-exceptions.ts`, for the same reason:
 *
 *   · exact file paths only — no globs, or future drift hides inside an entry
 *   · `uses` pinned per file, so a second hand-rolled eyebrow cannot ride along
 *   · `kind: 'debt'` means a real defect, recorded and owed a fix — not accepted
 *   · `debt-ratchet.test.ts` allows this register to SHRINK only
 *
 * Every entry here is debt. There is no legitimate reason to hand-roll an
 * eyebrow — if one ever appears, it belongs in the token, not in this file.
 *
 * All four are admin-console files from the `wt-admin` merge on 2026-07-28.
 * `wt-admin` branched before the v3 typography guards landed on `wt-web` and was
 * never run against them; the trunk merge is the first time these met. Recorded
 * rather than fixed because the admin console is frozen scope for the 30-day
 * launch plan. SL-044 owns the fix, Week 1.
 */
export interface EyebrowException {
  /** How many hand-rolled eyebrows this file is allowed to contain. */
  uses: number
  /** What the offending declaration is, and why it has not been fixed yet. */
  reason: string
  /** Always `debt` — a hand-rolled eyebrow is never correct. */
  kind: 'debt'
  /** ISO date this entry was added. */
  since: string
  /** Card that owns removing it. */
  card: string
}

export const EYEBROW_EXCEPTIONS: Readonly<Record<string, EyebrowException>> = Object.freeze({
  'app/admin/layout.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Environment badge spells out rounded-pill + font-mono + text-[11px] + tracking inline instead of type-eyebrow. Pre-dates the v3 typography guards.',
  },
  'components/admin/board-view.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Column-count label hand-rolls text-[11px] + tracking-[0.06em] + uppercase. Pre-dates the v3 typography guards.',
  },
  'components/admin/changelog-rail.tsx': {
    uses: 1,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Entry kind label hand-rolls text-[11px] + tracking-[0.06em] + uppercase. Pre-dates the v3 typography guards.',
  },
  'components/admin/qa-console-view.tsx': {
    uses: 2,
    kind: 'debt',
    since: '2026-07-28',
    card: 'SL-044',
    reason:
      'Two hand-rolled eyebrows — the filter-group label and the run-status heading — both spelling out text-[11px] + tracking-[0.06em] + uppercase. Pre-dates the v3 typography guards.',
  },
})
