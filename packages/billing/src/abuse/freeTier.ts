/**
 * Free-tier abuse controls.
 *
 * ── WHAT IS ACTUALLY WORTH DEFENDING ─────────────────────────────────────────
 * Not the AI bill. The 2026-08-17 pricing work measured where the marginal cost of a
 * workspace goes, and it is not the models: **per-connected-account platform cost is about
 * 89% of it — roughly 27× the AI spend.** So the thing a free account can cost us is a
 * CONNECTED ACCOUNT, and the number of free workspaces one person can hold is the lever
 * that matters. Credit grants are not: the free grant is 100 credits, once, and
 * `signupGrantKey` already makes it idempotent per workspace, so it cannot be farmed by
 * retrying a request.
 *
 * ── EVERY CONTROL HERE IS A COUNT OF SOMETHING REAL ──────────────────────────
 * There is no risk score, no reputation number and no heuristic blend. Two reasons:
 *
 *   1. A score is a number about the customer that no query reproduces. Showing one would
 *      be inventing a fact about a person's business, which this product does not do.
 *   2. A refusal a customer cannot act on is indistinguishable from a broken app. "You
 *      already have a free workspace" can be acted on. "Your signup looks risky" cannot.
 *
 * So each rule counts an existing row, and the refusal names exactly the rule that was hit.
 *
 * ── AND ONE RESIDUAL, STATED RATHER THAN PAPERED OVER ────────────────────────
 * Deleting a workspace cascades away its ledger, so a user who deletes and re-creates gets
 * a second 100-credit signup grant. Detecting that needs a record that OUTLIVES the
 * workspace, which does not exist today. It is left undefended and written down here
 * rather than covered by a check that cannot see it — the ceiling is 100 credits per
 * cycle, well under the connected-account cost this module is actually aimed at.
 */

/**
 * How many workspaces one person may hold on the free plan.
 *
 * One. A free workspace carries the plan's two channel slots, and channels are the cost.
 * Two free workspaces is two free plans, which is simply the free plan doubled — and the
 * multi-workspace case the catalog is built for (an agency running several clients) is
 * what `seats` and the Agency plan exist to sell.
 */
export const FREE_WORKSPACES_PER_USER = 1

/** Which rule refused, or `null` when nothing did. */
export type AbuseRule = 'free_workspace_cap' | 'disposable_email'

export interface AbuseDecision {
  allowed: boolean
  /** The rule that refused. Null when allowed — there is no "allowed but suspicious". */
  rule: AbuseRule | null
  /**
   * What the person is told. Names the rule and the way out, and never mentions risk,
   * scoring or suspicion. Null when allowed, so a caller cannot render a reassurance.
   */
  message: string | null
}

const ALLOWED: AbuseDecision = { allowed: true, rule: null, message: null }

export interface FreeWorkspaceInput {
  /**
   * Workspaces this Clerk user has created that are on the free plan — COUNTED, in the
   * same read that is about to create the next one. This function does not count and has
   * no fallback: a caller that cannot count must refuse to answer rather than pass a zero,
   * because a zero here silently disables the control.
   */
  existingFreeWorkspaces: number
  /**
   * Whether the user holds any workspace on a paid plan. A paying customer is not subject
   * to the free cap at all — the cap exists to stop the free plan being multiplied, not to
   * stop somebody who pays from having more than one workspace.
   */
  hasPaidWorkspace: boolean
  /** The email domain, lowercased, when one is known. */
  emailDomain?: string
  /**
   * Disposable-email domains to refuse. INJECTED, and empty by default, deliberately.
   *
   * A short hard-coded list is worse than none: it blocks the four domains somebody
   * remembered while reading as a solved problem, so nobody builds the real thing. With no
   * list supplied this control does nothing and says so, which is honest.
   */
  disposableDomains?: ReadonlySet<string>
}

export function evaluateFreeWorkspace(input: FreeWorkspaceInput): AbuseDecision {
  if (!Number.isInteger(input.existingFreeWorkspaces) || input.existingFreeWorkspaces < 0) {
    throw new Error(
      `existingFreeWorkspaces must be a counted non-negative integer (got ${input.existingFreeWorkspaces})`,
    )
  }

  const domain = input.emailDomain?.trim().toLowerCase()
  if (domain && input.disposableDomains?.has(domain)) {
    return {
      allowed: false,
      rule: 'disposable_email',
      message:
        'Sahoda cannot create a workspace for a temporary email address. ' +
        'Sign up with an address you can receive mail at, and everything else works the same.',
    }
  }

  // A paying customer is outside this control entirely.
  if (input.hasPaidWorkspace) return ALLOWED

  if (input.existingFreeWorkspaces >= FREE_WORKSPACES_PER_USER) {
    return {
      allowed: false,
      rule: 'free_workspace_cap',
      message:
        `The free plan covers one workspace, and you already have ` +
        `${input.existingFreeWorkspaces}. Any paid plan lets you run more — ` +
        `and nothing about the workspace you have changes either way.`,
    }
  }

  return ALLOWED
}
