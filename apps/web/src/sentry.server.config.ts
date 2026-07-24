import * as Sentry from '@sentry/nextjs'

import { toSentryInitOptions } from '@/lib/observability/sentry-init-options'
import { buildSentryOptions } from '@/lib/observability/sentry-options'
import { secretValuesFrom } from '@/lib/observability/secret-values'

/**
 * Sentry for the Node.js runtime. Imported by `register()` in instrumentation.ts,
 * never at module scope from application code.
 *
 * The dynamic import is not ceremony: this module pulls in OpenTelemetry and the
 * SDK's node integrations, and importing it from the edge bundle would fail to
 * build. `register()` guards on NEXT_RUNTIME so each runtime only ever loads its
 * own file.
 *
 * Reads process.env directly rather than `@/lib/env`, deliberately. That module
 * is `server-only` and THROWS when any required var is missing — correct for a
 * request handler, wrong for the crash reporter, which is the one subsystem that
 * has to survive a broken environment. If the error reporter cannot start
 * without a valid config, it can never report the config being invalid.
 */
Sentry.init(
  toSentryInitOptions(
    buildSentryOptions({
      // Sentry's own convention: SENTRY_DSN is read at RUNTIME on the server, so
      // this deploys without a rebuild — unlike its NEXT_PUBLIC_ twin, which is
      // frozen into the client bundle at build time.
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      // Vercel injects the commit SHA. Left undefined elsewhere on purpose:
      // buildSentryOptions only forwards what it is given, and a made-up release
      // string mislabels every event from a build that genuinely did not know one.
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // The whole point of passing values rather than names: a leaked credential
      // usually arrives INSIDE a string — a Postgres connection error echoing its
      // URL, a fetch failure quoting the Authorization header it sent. No key-name
      // policy can see into a message body; an exact-value match can.
      secretValues: secretValuesFrom(process.env),
    }),
  ),
)
