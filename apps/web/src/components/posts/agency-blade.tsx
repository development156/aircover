import type { PostOrigin } from '@sahoda/shared'

/**
 * The blade: Sahoda acted, rather than the user.
 *
 * ONE meaning, nothing else (UI_RULES_v3). It is not a logo, not a bullet, not a
 * decorative flourish — every appearance is a claim about who did something, so
 * it renders only where the data supports that claim.
 *
 * The only honest source is `posts.origin`. That column is post-level: it says
 * `planMyWeek` drafted the post. Nothing in the schema records who published an
 * individual channel, so this must never sit beside a publish claim or on a
 * variant row, where it would read as "Sahoda published this".
 *
 * It carries an accessible name rather than `aria-hidden`, because it conveys
 * meaning a screen-reader user needs; the shape itself comes from `.blade` in
 * tokens.css and tints with the tenant brand automatically.
 */
export function AgencyBlade({ origin }: { origin: PostOrigin }) {
  if (origin !== 'plan_week') return null

  return <span className="blade" role="img" aria-label="Drafted by Sahoda" />
}
