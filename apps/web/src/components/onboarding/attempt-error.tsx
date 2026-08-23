/**
 * A failed resolve attempt, and the one way it is shown.
 *
 * There are two places a resolve can fail — Generate on the Spark step and
 * Regenerate on the Refine step — and they are the same charge for the same work,
 * so they say the same thing. This lived only in Spark; Refine degraded its
 * failures to a bare toast, which dropped both numbers and left the user of a
 * 50-credit action guessing whether they had just paid for it.
 *
 * `insufficient` is the only branch that claims nothing was charged, and that is
 * deliberate: the balance check refuses BEFORE the hold is taken, so there is
 * provably no entry. A generic failure can land either side of the reserve —
 * `withCredits` releases the hold when the callback throws, but the UI cannot see
 * which happened, so it does not make the claim.
 */
export type AttemptError =
  | { kind: 'insufficient'; message: string; required: number; available: number }
  | { kind: 'error'; message: string }

export interface AttemptErrorNoticeProps {
  error: AttemptError
}

export function AttemptErrorNotice({ error }: AttemptErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
    >
      {error.kind === 'insufficient' ? (
        <p>
          Not enough credits to resolve your Brand Brain. This needs{' '}
          <span className="tabular-nums">{error.required}</span>, you have{' '}
          <span className="tabular-nums">{error.available}</span>. Nothing was charged.
        </p>
      ) : (
        <p>{error.message}</p>
      )}
    </div>
  )
}
