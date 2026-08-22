import type { ObservedFigure, RadarChange, Snapshot } from './types'

/**
 * THE GATE EVERY RADAR FIGURE PASSES THROUGH.
 *
 * ── THIS IS NOT A TEST HELPER. IT RUNS IN PRODUCTION. ────────────────────────
 * The obvious way to satisfy "no figure without a snapshot behind it" is a test
 * that scans the rendered output. That test is worth having and it exists
 * (`components/radar/figure-provenance.test.tsx`), but on its own it is a guard
 * that shares the blind spot of the code it guards: it can only fail on data a
 * fixture happens to contain. A live workspace with a malformed row would render
 * the number and the suite would still be green.
 *
 * So the check is here, on the render path. `resolveFigure` returns `null` for a
 * figure whose evidence does not resolve, and `<Observed>` RENDERS NOTHING AT
 * ALL for a null — no number, and no absence mark either.
 *
 * NOT AN ABSENCE MARK, and the distinction is this screen's own thesis turned on
 * itself. `.is-unreadable` means "we asked and the answer did not come back",
 * which is a statement about the COMPETITOR'S PAGE. A figure citing a snapshot
 * that is not in evidence says nothing about their page; it says Radar's own
 * record is malformed. Drawing the scan-failed mark for it would tell a customer
 * their competitor's site was down when the truth is that we have a bug — the
 * exact collapse of two distinct facts that the whole screen exists to prevent.
 *
 * tokens.css's absence vocabulary already rules on this case: "if the quantity
 * does not exist, DELETE THE SLOT. There is no class for it, on purpose." A
 * figure with no provenance is not a quantity this product knows, so the slot
 * goes. `auditChange` is where it becomes visible — to engineers, in a test, by
 * name — which is the audience for a malformed row.
 *
 * REFUSING IS NOT THROWING, deliberately. A thrown error in a server component
 * takes the whole screen down, which turns one bad row into "Radar is broken"
 * and pushes a future maintainer towards catching it somewhere that would
 * swallow the distinction. Rendering the absence keeps the rest of the change
 * readable and states the truth about the one figure.
 */

/**
 * A standalone run of digits, matching `roadmap-honesty.spec.ts`'s FIGURE regex.
 *
 * Deliberately the SAME expression as the e2e guard rather than a second one.
 * Two regexes for "what counts as a number on screen" would disagree eventually,
 * and the disagreement would appear as a screen passing one guard and failing
 * the other with no way to tell which was right.
 */
export const FIGURE = /(?<![\w—–-])\d[\d,]*(?![\w—–-])/

/** Whether prose carries a number. Used to keep figures out of free text. */
export function hasDigit(text: string): boolean {
  return FIGURE.test(text)
}

/**
 * The number, or null when its evidence does not resolve.
 *
 * The check is that the figure's `snapshotId` appears in the evidence of the
 * change that is rendering it — NOT that the id is non-empty, and NOT that a
 * snapshot with that id exists somewhere in the workspace. Both weaker forms
 * pass for a figure copied from one competitor onto another's card, which is the
 * failure that matters: a real snapshot, cited for a claim it does not support.
 */
export function resolveFigure(
  figure: ObservedFigure,
  evidence: readonly Snapshot[],
): { value: number; observedAt: string } | null {
  const snapshot = evidence.find((s) => s.id === figure.snapshotId)
  if (!snapshot) return null
  return { value: figure.value, observedAt: snapshot.observedAt }
}

/**
 * Every way a single change can be dishonest, named.
 *
 * Returned as a list rather than a boolean so a failure says WHICH rule broke.
 * A guard that reports "this change is invalid" sends the next person to read
 * the whole record; one that reports "figure 'Listed price' cites snapshot
 * snap-9, which is not in this change's evidence" sends them to the line.
 */
export function auditChange(change: RadarChange): readonly string[] {
  const problems: string[] = []
  const ids = new Set(change.evidence.map((s) => s.id))

  if (change.evidence.length === 0 && change.observation.figures.length > 0) {
    problems.push(`${change.id}: carries figures but rests on no snapshot at all`)
  }

  for (const figure of change.observation.figures) {
    if (!ids.has(figure.snapshotId)) {
      problems.push(
        `${change.id}: figure "${figure.label}" cites snapshot ${figure.snapshotId}, ` +
          `which is not in this change's evidence`,
      )
    }
  }

  // A snapshot belongs to ONE competitor. Evidence borrowed from another is a
  // real reading supporting a claim it was never about.
  for (const snapshot of change.evidence) {
    if (snapshot.competitorId !== change.competitorId) {
      problems.push(
        `${change.id}: rests on snapshot ${snapshot.id}, which was taken of a ` +
          `different competitor (${snapshot.competitorId})`,
      )
    }
  }

  if (hasDigit(change.observation.summary)) {
    problems.push(
      `${change.id}: the observation summary spells a number inside prose — ` +
        `"${change.observation.summary}". Every figure belongs in \`figures\`, where ` +
        `it carries a snapshot.`,
    )
  }

  // THE INFERENCE MAY NOT CARRY A FIGURE. A hatched claim with a number in it is
  // the exact hybrid this whole screen exists to prevent: it reads with the
  // authority of a measurement and rests on a judgement.
  if (change.reading && hasDigit(change.reading.text)) {
    problems.push(
      `${change.id}: the reading states a number — "${change.reading.text}". An ` +
        `inference is not a measurement and may not print one.`,
    )
  }

  return problems
}
