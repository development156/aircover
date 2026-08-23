import { resolveFigure } from './evidence'
import type { RadarChange } from './types'

/**
 * A RADAR CHANGE, TURNED INTO SOMETHING A WRITER CAN WORK FROM.
 *
 * ── NO MODEL RUNS IN THIS FILE, WHICH IS WHY IT COSTS NOTHING ────────────────
 * The same reasoning as `lib/loop/reflect.ts`: the step that decides WHAT IS
 * TRUE about a competitor is arithmetic and string assembly, and only the step
 * that decides HOW TO SAY IT is a paid model call. Composing the brief here
 * means a customer is never charged for Radar restating what it already saw, and
 * means the brief cannot contain a figure that no snapshot supports — this
 * module has no way to obtain one.
 *
 * ── WHAT GOES IN, AND WHAT IS DELIBERATELY LEFT OUT ─────────────────────────
 * IN:  the observation, its resolvable figures, and the Brand Brain field the
 *      response is grounded in.
 * OUT: the reading. It is an INFERENCE, and a brief is the thing a model will
 *      expand into published copy — so a sentence that starts life hatched would
 *      arrive in a caption as an assertion, with the hatch stripped off by the
 *      one transformation that cannot carry it.
 *
 * That is the whole reason `reading` is not threaded through. An inference is
 * safe to show a person who can see it is an inference; it is not safe to hand
 * to a generator whose output no longer looks like one.
 */

/** The most a brief may say, so model text downstream stays bounded. */
export const BRIEF_TITLE_MAX = 120
export const BRIEF_BODY_MAX = 900

export interface RadarBrief {
  title: string
  body: string
}

/** Trim on a code-point boundary, matching how the Loop clamps its own briefs. */
function clamp(text: string, max: number): string {
  const points = [...text.trim()]
  return points.length <= max ? points.join('') : `${points.slice(0, max - 1).join('')}…`
}

/**
 * Compose the brief.
 *
 * The title names the COMPETITOR AND THE MOVE, never the response, because the
 * person scanning a draft list needs to know which observation it answers. The
 * body states what was seen, quotes only figures whose snapshots resolve, and
 * then hands the writer the brand's own position to answer from.
 */
export function briefFromChange(
  change: RadarChange,
  brandBasis: { field: string; value: string } | null,
): RadarBrief {
  const title = `Answer ${change.competitorName}: ${change.observation.summary}`

  const lines: string[] = [`What we saw, on a public page: ${change.observation.summary}`]

  // Only figures that resolve against this change's own evidence. An unresolved
  // one is dropped in silence HERE — `auditChange` is where a malformed record
  // gets named, and a brief is not the place to explain a data fault to a
  // shop owner.
  const observed = change.observation.figures
    .map((figure) => ({ figure, resolved: resolveFigure(figure, change.evidence) }))
    .filter(
      (
        entry,
      ): entry is { figure: typeof entry.figure; resolved: NonNullable<typeof entry.resolved> } =>
        entry.resolved !== null,
    )

  for (const { figure, resolved } of observed) {
    const unit = figure.unit && figure.unit !== '₹' ? ` ${figure.unit}` : ''
    const prefix = figure.unit === '₹' ? '₹' : ''
    lines.push(
      `${figure.label}: ${prefix}${resolved.value}${unit} (read on ${resolved.observedAt.slice(0, 10)}).`,
    )
  }

  if (brandBasis) {
    lines.push(
      `Answer from our own position, ${brandBasis.field}: "${brandBasis.value}". ` +
        `Say what we do, not what they do.`,
    )
  } else {
    // NO INVENTED POSITION. Without a brand fact there is nothing that makes
    // this different from any other tool's generic prompt, and the brief says so
    // rather than filling the gap with "highlight your strengths".
    lines.push(
      'There is no confirmed positioning in the Brand Brain to answer from yet, ' +
        'so keep this to what we do and can prove.',
    )
  }

  // NEVER MATCH, NEVER MENTION. A brief that leaks into a caption must not
  // instruct a model to name a competitor in public copy.
  lines.push('Do not name or refer to the other business in the copy.')

  return { title: clamp(title, BRIEF_TITLE_MAX), body: clamp(lines.join('\n'), BRIEF_BODY_MAX) }
}
