import type { PostOrigin } from '@sahoda/shared'

/** Every origin that means Sahoda acted. `manual` is the only one that does not. */
const SAHODA_ORIGINS: readonly PostOrigin[] = ['plan_week', 'playbook']

/**
 * The blade: Sahoda acted, rather than the user.
 *
 * ONE meaning, nothing else (UI_RULES_v3). It is not a logo, not a bullet, not a
 * decorative flourish — every appearance is a claim about who did something, so
 * it renders only where the data supports that claim.
 *
 * The only honest source is `posts.origin`. That column is post-level: it says
 * `planMyWeek` or a Playbook drafted the post. Nothing in the schema records who
 * published an individual channel, so this must never sit beside a publish claim
 * or on a variant row, where it would read as "Sahoda published this".
 *
 * ── `playbook` WAS ADDED TO `PostOrigin` AND HAD TO BE ADDED HERE TOO ────────
 * The check below was `origin !== 'plan_week'`, which is the shape that silently
 * drops a new member of an enum: extending `PostOriginSchema` alone would have
 * left every playbook-drafted post looking hand-written, and nothing would have
 * failed. The list is now explicit so the next member is a compile-time decision
 * rather than a silent omission.
 *
 * It carries an accessible name rather than `aria-hidden`, because it conveys
 * meaning a screen-reader user needs; the shape itself comes from `.blade` in
 * tokens.css and tints with the tenant brand automatically.
 */
export function AgencyBlade({ origin }: { origin: PostOrigin }) {
  if (!SAHODA_ORIGINS.includes(origin)) return null

  return <span className="blade" role="img" aria-label="Drafted by Sahoda" />
}
