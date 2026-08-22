/**
 * Is a scheduled cron route actually REACHABLE on a deployment?
 *
 * Pure. No fetch. `probe-crons.mjs` does the I/O and hands results here, so the
 * judgement is testable without a deployment — the same split `probe-routes.mjs`
 * uses, and for the same reason.
 *
 * ── WHY "SCHEDULED" AND "REACHABLE" ARE DIFFERENT QUESTIONS ──────────────────
 * A cron path is written down in THREE places that cannot see each other:
 *
 *   1. the schedule            apps/web/vercel.json
 *   2. the Clerk exemption     apps/web/src/middleware.ts — isPublicRoute AND config.matcher
 *   3. the handler             apps/web/src/app/api/cron/<name>/route.ts
 *
 * `lib/cron/wiring.test.ts` requires all three to agree IN THE REPOSITORY. It
 * cannot tell you anything about the DEPLOYMENT, because the deployed branch is
 * not the branch you are standing on. MEASURED 2026-08-22: `origin/wt-web` — the
 * default branch, and the one Vercel builds — declares ONE cron and carries ONE
 * route file, while the integration branch declares three. Two of the three
 * "wired" jobs do not exist in production at all.
 *
 * So this asks the deployment, without a secret, and reads the status code.
 *
 * ── THE DISCRIMINATOR, AND WHY THE CONTROL IS NOT OPTIONAL ───────────────────
 * MEASURED against https://app.sahodalabs.com on 2026-08-22:
 *
 *   /api/cron/sweeps                  401  ← the route's own guard answered
 *   /api/cron/metrics                 307 → clerk.accounts.dev handshake
 *   /api/cron/loop                    307 → clerk.accounts.dev handshake
 *   /api/cron/definitely-not-a-route  307 → clerk.accounts.dev handshake
 *
 * The last line is the control and it is the whole reason this file exists in
 * this shape: a path that was never written answers IDENTICALLY to one that is
 * merely unexempt. A probe without the control would report "not exempt" for a
 * route that simply is not deployed, and somebody would spend an afternoon
 * editing middleware.ts.
 *
 * The requests must also carry DOCUMENT headers. Clerk redirects navigations and
 * answers 404 to everything else, so the same missing route reads 404 without
 * them — which on 31 July was read as production being DOWN. See probe-routes.mjs.
 */

/** A cron tick carries no browser headers, but Clerk's behaviour splits on them. */
export { DOCUMENT_HEADERS } from './probe-routes.mjs'

/** A path under /api/cron that has never existed, to calibrate the run. */
export const CONTROL_PATH = '/api/cron/__probe_control_never_exists'

/**
 * What one status means. `result` is { status, location, body } observed with
 * `redirect: 'manual'` and DOCUMENT headers, and NO cron secret.
 */
export function judgeCron(path, result, control) {
  const verdict = (ok, state, reason) => ({ ok, path, state, reason, status: result.status })

  if (result.error) {
    return verdict(false, 'unmeasured', `the probe itself failed: ${result.error}`)
  }

  // 200 without a secret is the worst outcome and is checked first, because it is
  // the only one that is a security finding rather than an availability one.
  if (result.status === 200) {
    return verdict(
      false,
      'unauthenticated',
      'answered 200 with NO cron secret — anyone on the internet can trigger this job',
    )
  }

  if (result.status === 401 || result.status === 403) {
    return verdict(
      true,
      'reachable',
      `the route's own guard answered ${result.status}; Clerk is not in front of it`,
    )
  }

  const redirected = result.status >= 300 && result.status < 400
  if (redirected) {
    // Only meaningful if the control did NOT redirect. If it did, a redirect says
    // nothing about whether this particular route exists.
    if (control.status >= 300 && control.status < 400) {
      return verdict(
        false,
        'shadowed',
        'Clerk answers before the route, so this cannot be distinguished from a path ' +
          'that was never written. Either way a Vercel cron tick is a redirect it does ' +
          'not follow, and the job never runs. Exempt it in middleware.ts — BOTH ' +
          'isPublicRoute and config.matcher.',
      )
    }
    return verdict(
      false,
      'not-exempt',
      `redirected to ${result.location || 'somewhere'}; Vercel cron does not follow redirects, ` +
        'so every tick reports success and does nothing',
    )
  }

  if (result.status === 404) {
    return verdict(
      false,
      'not-deployed',
      'exempt from Clerk but there is no handler — the schedule fires into a 404 ' +
        'and the dashboard shows a job that runs',
    )
  }

  if (result.status === 405) {
    return verdict(
      false,
      'wrong-method',
      'the route exists but refuses this method. Vercel cron issues GET.',
    )
  }

  return verdict(false, 'unexpected', `answered ${result.status}, which nothing here explains`)
}

/**
 * Did the run measure anything at all?
 *
 * If the control answers 401 or 200, a path that never existed is being treated
 * as a live route and every verdict below is meaningless. Reported as a PROBE
 * failure rather than folded into the results — "we could not measure" and "we
 * measured a failure" are different claims.
 */
export function judgeControl(control) {
  if (control.error) return { ok: false, reason: `control request failed: ${control.error}` }
  if (control.status === 401 || control.status === 200) {
    return {
      ok: false,
      reason:
        `a path that has never existed answered ${control.status}. Something is matching ` +
        'everything under /api/cron, so no verdict in this run can be trusted.',
    }
  }
  return {
    ok: true,
    reason: `a never-written path answers ${control.status} — discriminator sound`,
  }
}

export function summariseCrons(verdicts) {
  const failed = verdicts.filter((v) => !v.ok)
  return {
    ok: failed.length === 0,
    passed: verdicts.length - failed.length,
    total: verdicts.length,
    failed,
  }
}
