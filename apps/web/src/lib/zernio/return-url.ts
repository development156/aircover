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
 * The two query parameters the return route is allowed to read.
 *
 * ── WHY QUERY PARAMETERS, ON THE ROUTE THAT IGNORES THEM ALL ─────────────────
 * Both of these rode in an httpOnly `SameSite=Lax` cookie. They kept not
 * arriving, and the journey explains why: our origin -> Zernio -> Google ->
 * Zernio -> our origin, four hops and two cross-site boundaries, through
 * browsers with bounce-tracking and partition mitigations of their own. `Lax`
 * should carry it and evidently did not, and a mechanism that "should" work is
 * not one to build a feature on.
 *
 * It cost two visible defects at once, because two different things depended on
 * that one cookie:
 *
 *   mode      the popup got a 303, so it loaded a second copy of /connections
 *             instead of closing. Reported three times.
 *   platform  create-scoping fell to its fail-closed branch, so a genuine
 *             connect wrote NO ROW AT ALL. Reported as "still not able to
 *             connect with many platforms".
 *
 * MEASURED from Zernio's own spec for `GET /v1/connect/{platform}`: "Result
 * params are appended with the URL API, so an existing query string is
 * preserved." So a parameter we put on the return URL comes back to us.
 *
 * ── AND THIS DOES NOT REOPEN THE RULE IT LOOKS LIKE IT BREAKS ────────────────
 * The return route ignores every query parameter because doc 13 §3 records that
 * a wrong `accountId` does not error: it publishes to somebody else's Instagram
 * and returns 200. That rule is about a value that NAMES A RESOURCE BELONGING TO
 * SOMEONE ELSE. Neither of these can.
 *
 * `mode` steers no write at all. It chooses between an HTML page saying "you can
 * close this window" and a 303 to /connections.
 *
 * `platform` does scope a create, and it is the harder call, so the argument is
 * spelt out rather than asserted. It is a channel NAME from a five-item
 * allowlist, not an id. It cannot reach another tenant: the accounts it scopes
 * come from `reconcileAccounts(client, { profileId, platform })`, where
 * `profileId` was read from our own table keyed by the workspace derived from
 * the Clerk session. It cannot admit an account over the plan limit; that gate
 * is downstream and unchanged. The MOST a forged value can do is record a
 * channel this workspace really has connected at Zernio — which is exactly what
 * this route did for all five platforms before create-scoping existed. So it
 * still only ever NARROWS, and a forged value narrows to a different subset of
 * the same set.
 *
 * The cookie is still set and still read FIRST. This is the fallback for the
 * trip it does not survive, not a replacement.
 */
export const RETURN_MODE_PARAM = 'mode'

/** See RETURN_MODE_PARAM. Validated against the shared allowlist on arrival. */
export const RETURN_PLATFORM_PARAM = 'platform'

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

/** What the customer pressed, as far as the return trip needs to know it. */
export interface ReturnIntent {
  /** Only `popup` is ever written; absence means redirect. */
  mode?: 'popup' | 'redirect' | undefined
  /** Our channel id, not Zernio's connect name. */
  platform?: string | undefined
}

/**
 * The full return URL, or `null` when the origin cannot be determined.
 *
 * The intent is carried in the URL as well as in a cookie, because the cookie did
 * not survive the trip. Zernio appends its own parameters to whatever we give it
 * and preserves an existing query string, so ours arrives alongside theirs.
 *
 * A missing, stripped or mangled value produces the OLD behaviour in both cases:
 * no `mode` means redirect, and no `platform` means the route falls back to the
 * cookie and then to refusing to create. That is the same direction every other
 * default in this flow fails in.
 */
export function returnUrl(env: ReturnUrlEnv, intent?: ReturnIntent): string | null {
  const base = returnOrigin(env)
  if (base === null) return null
  const url = new URL(`${base}${ZERNIO_RETURN_PATH}`)
  if (intent?.mode === 'popup') url.searchParams.set(RETURN_MODE_PARAM, 'popup')
  if (intent?.platform) url.searchParams.set(RETURN_PLATFORM_PARAM, intent.platform)
  return url.toString()
}
