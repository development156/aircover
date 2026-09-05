import { withSentryConfig } from '@sentry/nextjs'
import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Pin the workspace root: git worktrees make Next see two lockfiles and
  // guess the main checkout — this keeps resolution inside THIS worktree.
  turbopack: { root: path.resolve(import.meta.dirname, '../..') },
  // Same pin for the webpack `next build` path: file tracing must treat the
  // MONOREPO root as the workspace so pnpm-symlinked @sahoda/* sources are
  // traced into Vercel's serverless output instead of inferred from whichever
  // lockfile Next finds first.
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  // The studio's bundled typefaces. NOTHING IMPORTS THESE FILES — they are read
  // by fontconfig at runtime from `process.cwd()/fonts`, so tracing cannot find
  // them on its own and without this line the folder is simply absent in
  // production while every check passes locally. `lib/studio/fonts.ts` carries
  // the measurements behind the whole arrangement.
  outputFileTracingIncludes: {
    '**': ['./public/fonts/**'],
  },
  // @sahoda/shared ships raw TS via package exports — webpack `next build`
  // needs it transpiled (Turbopack dev handles workspace packages natively).
  // Grow this list only when web actually imports another @sahoda package.
  transpilePackages: ['@sahoda/shared'],
  // Dead nav links become typecheck errors (Link hrefs are validated).
  typedRoutes: true,
  experimental: {
    // Media attach posts the file THROUGH a server action so the mime type,
    // byte length and pixel dimensions are read from the real bytes rather than
    // trusted from the browser — `validateMedia` checks all three, and against
    // client-supplied values it would be validating a claim, not a file.
    //
    // The ceiling is the PLATFORM's, not the Constraint Engine's. This was
    // '12mb', derived from Instagram's 8 MB plus multipart overhead. Vercel
    // answers 413 FUNCTION_PAYLOAD_TOO_LARGE at the edge for any function
    // request body over 4.5 MB, before Next runs, so the 12 was unreachable in
    // production and a 6 MB photo failed there while passing on every laptop.
    //
    // '4mb' is 4,194,304 binary bytes (Next parses this with the `bytes`
    // package), which sits under the 4.5 MB edge limit and leaves room above
    // MEDIA_UPLOAD_CAP_BYTES for the multipart envelope. Raising it past 4.5 MB
    // does nothing: the request never reaches this config. Larger media needs
    // the signed direct-to-storage upload plus a server-side re-read of the
    // stored bytes, which is the real answer and is not this line.
    // `lib/posts/media-constants.ts` holds the matching product cap and
    // `media-constants.test.ts` reads this file to keep the two in step.
    serverActions: { bodySizeLimit: '4mb' },
  },
  /**
   * THE HEADERS THAT WERE MEASURED ABSENT, 2026-08-23.
   *
   * Read off the wire on `next start` AND on https://app.sahodalabs.com — not
   * off this file, because the two disagree: Vercel adds
   * `Strict-Transport-Security: max-age=63072000` at the edge, so HSTS is
   * present in production and absent locally, and reading the config would have
   * reported a hole that is not there.
   *
   * What IS absent in both: `x-content-type-options`, `referrer-policy`, and any
   * CSP directive beyond `frame-ancestors`.
   *
   * ── WHY HERE AND NOT IN THE MIDDLEWARE ──────────────────────────────────────
   * The middleware sets `Content-Security-Policy` per path (`cspFor`) because
   * `/embed/*` needs a different `frame-ancestors` from everything else. These
   * three do not vary by path, and — MEASURED — a middleware header does not
   * survive every response: Clerk's `protect-rewrite` answers a signed-out
   * request to /home with a 404 carrying no CSP at all, because the rewrite
   * replaces our response. `headers()` applies to those too.
   *
   * ── AND WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────
   * `script-src`. A real script policy needs per-request nonces threaded through
   * Next's inline bootstrap, which is a project with a live breakage risk, not a
   * line in an audit. `object-src 'none'` and `base-uri 'self'` are the two
   * directives that carry real value with no such risk — `base-uri` is what stops
   * an injected `<base>` tag repointing every relative URL on the page — so they
   * go in and the rest is named as owed work.
   *
   * `form-action` is also absent on purpose: sign-in posts cross-origin to Clerk,
   * and `'self'` would break the login flow the same week nobody was watching.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // The full URL of an admin or wallet page is itself information; the
          // origin alone is all any third party needs.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]
  },
}

/**
 * Source-map upload is opt-in, and stays off unless all three credentials are
 * present.
 *
 * Without upload, every stack trace in Sentry is minified `chunk-8f2a.js:1:24601`
 * — technically an error report, practically unreadable. With it, we get real
 * file names and line numbers. So it is worth having, and worth NOT half-having.
 *
 * All three, not just the token: the plugin needs org and project to know where
 * to put the artifacts, and supplying a token without them fails deep inside the
 * upload step, late in the build, with a message about a missing organization
 * that reads like an auth problem. Checking up front turns that into a clean,
 * silent skip.
 *
 * Nothing is hardcoded here. An org or project slug baked into this file is a
 * config value that cannot differ between a fork, a preview deploy and prod, and
 * the first person who needs it to differ will hardcode a second one next to it.
 */
const isSourcemapUploadConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
)

export default withSentryConfig(nextConfig, {
  // Read from the environment, never defaulted. `undefined` is the correct value
  // on a laptop and in CI forks, and it is what keeps the flag above honest.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // THE HONEST SKIP.
  //
  // Disabling source maps is what makes an unconfigured build a NON-EVENT rather
  // than a failure. pnpm reports "Ignored build scripts: @sentry/cli", so the
  // CLI binary this plugin shells out to may not have been downloaded at all —
  // and a build that dies because it could not upload artifacts to a Sentry org
  // it was never given credentials for has failed at the one job (shipping the
  // app) that has nothing to do with observability. Reporting still works fully
  // when this is off; only the un-minifying of stack traces is lost.
  sourcemaps: { disable: !isSourcemapUploadConfigured },

  // Quiet in CI. The plugin is chatty on success and the output is noise in a
  // log people only read when something went wrong.
  silent: true,

  // Do not phone home with build metrics. We opted out of Next's telemetry too;
  // this keeps the two consistent rather than quietly re-enabling it.
  telemetry: false,

  // Strips Sentry's own debug logging out of the client bundle. Pure size win —
  // those logs only fire when `debug: true`, which we never set.
  //
  // This is the `webpack.treeshake` form, not the older top-level `disableLogger`:
  // that one is deprecated in 10.x and prints a DEPRECATION WARNING on every dev
  // boot. Note the treeshake options apply to the WEBPACK production build only —
  // `next dev --turbopack` ignores them, so the win shows up in `next build`, not
  // in dev bundle size.
  //
  // `treeshake.removeTracing` is deliberately NOT set even though
  // `tracesSampleRate` is 0 and it would strip more code: it would silently make
  // a future `tracesSampleRate` change a no-op, and a performance option that
  // reads as enabled while doing nothing is exactly the kind of quiet lie this
  // codebase avoids. Turn it on in the same commit that decides we will never
  // trace, not before.
  webpack: { treeshake: { removeDebugLogging: true } },
})
