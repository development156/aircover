/**
 * WHERE ZERNIO SENDS THE BROWSER BACK TO, AND WHY IT IS NOT A CONSTANT.
 *
 * ── THE BUG ──────────────────────────────────────────────────────────────────
 * This was `${NEXT_PUBLIC_APP_URL}/api/oauth/zernio/return`, one value for every
 * deployment. `NEXT_PUBLIC_APP_URL` is set once on the Vercel project and is
 * therefore the PRODUCTION url on every preview build too. So a customer testing
 * a preview at
 *
 *   sahodalabs-git-claude-advisor-qvz5wn-....vercel.app
 *
 * pressed Connect, approved on the platform, and Zernio returned them to
 * `sahodalabs.vercel.app/connections` — a different deployment, usually a
 * different session, and never the branch they were testing. The connect looked
 * like it silently failed. It had not: it landed somewhere else.
 *
 * ── WHY NOT JUST READ THE REQUEST HOST ───────────────────────────────────────
 * Because the previous comment here was right to refuse it: this URL is handed to
 * a third party who will redirect a SIGNED-IN customer to it, and `Host` and
 * `X-Forwarded-Host` are attacker-influenceable. A poisoned host header would
 * make us ask Zernio to send our customer to an attacker's origin.
 *
 * ── SO IT COMES FROM THE PLATFORM, NOT FROM THE REQUEST ──────────────────────
 * Vercel sets `VERCEL_ENV`, `VERCEL_BRANCH_URL` and `VERCEL_URL` in the server
 * environment. They are written by the platform at deploy time and no request can
 * influence them, which is the property the header approach lacked. The rule:
 *
 *   production        NEXT_PUBLIC_APP_URL — the real domain, unchanged
 *   preview           the branch's own url
 *   anything else     NEXT_PUBLIC_APP_URL, or localhost in development
 *
 * ── BRANCH URL BEFORE DEPLOYMENT URL, AND THAT ORDER MATTERS ─────────────────
 * `VERCEL_URL` is unique per DEPLOYMENT and changes on every push.
 * `VERCEL_BRANCH_URL` is the stable alias for the branch. A customer who presses
 * Connect, and whose branch is redeployed while they are on the consent screen,
 * comes back to a host that still exists only if we gave Zernio the branch alias.
 * With the deployment url they land on a URL that may already be superseded.
 */

/** Only the fields this decision reads. Passed in, so it can be tested. */
export interface ReturnUrlEnv {
  /** `production` | `preview` | `development`, set by Vercel. */
  vercelEnv?: string | undefined
  /** The stable per-branch alias, e.g. `myapp-git-my-branch-team.vercel.app`. */
  vercelBranchUrl?: string | undefined
  /** The per-deployment alias. Changes on every push. */
  vercelUrl?: string | undefined
  /** The configured public origin. Production's answer, and the fallback. */
  appUrl?: string | undefined
}

/** The path is the same everywhere; only the origin is in question. */
export const ZERNIO_RETURN_PATH = '/api/oauth/zernio/return'

/**
 * Turn a bare Vercel host into an origin.
 *
 * `VERCEL_URL` and `VERCEL_BRANCH_URL` arrive WITHOUT a scheme — `example.vercel.app`,
 * not `https://example.vercel.app`. Handing that to Zernio as a `redirect_url` produces
 * a relative reference that resolves against zernio.com, which is how a fix like this
 * turns one wrong destination into a different wrong destination.
 *
 * Always `https`. Every Vercel alias serves TLS, and a plaintext origin here would
 * downgrade a redirect carrying a signed-in customer.
 */
function origin(host: string | undefined): string | null {
  const trimmed = host?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://')
  return `https://${trimmed}`
}

/**
 * The origin Zernio should return the browser to, or `null` when nothing in the
 * environment can answer.
 *
 * `null` rather than a relative path or an empty string. A caller that cannot name
 * an absolute origin must refuse to start the flow — sending a customer to a
 * consent screen whose return trip goes nowhere is worse than telling them the
 * environment is not configured, because the grant at the platform is real and we
 * cannot undo it.
 */
export function returnOrigin(env: ReturnUrlEnv): string | null {
  if (env.vercelEnv === 'preview') {
    // Branch alias first — see the header. Deployment url is the fallback for a
    // deployment that somehow has no branch (a bare `vercel deploy`).
    const preview = origin(env.vercelBranchUrl) ?? origin(env.vercelUrl)
    if (preview) return preview
  }
  return origin(env.appUrl)
}

/** The full return URL, or `null` when the origin cannot be determined. */
export function returnUrl(env: ReturnUrlEnv): string | null {
  const base = returnOrigin(env)
  return base === null ? null : `${base}${ZERNIO_RETURN_PATH}`
}
