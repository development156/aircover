# NEXT_PUBLIC_SENTRY_DSN — the browser half of Sentry

Status: MEASURED 2026-09-02, unset on the Vercel production project. Browser
error reporting on app.sahodalabs.com is off, and nothing on any screen or in
any log says so.

## What is broken

`sentry.server.config.ts` reads `SENTRY_DSN`, which is set, so server errors
arrive. `src/instrumentation-client.ts:25` reads a different name,
`NEXT_PUBLIC_SENTRY_DSN`, and `buildSentryOptions` sets `enabled: Boolean(dsn)`.
With no DSN the browser SDK initialises disabled: no hydration failure, no
composer crash, no React error boundary is ever reported.

The evidence, from the verifier's reproduction:

| Check                                                                  | Result                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| The production `main-app` chunk on app.sahodalabs.com                    | ships the literal token `NEXT_PUBLIC_SENTRY_DSN`, un-inlined |
| `NODE_ENV` in the same chunk                                             | inlined to `"production"`, so inlining itself works |
| Sentry events in `environment:production`, last 14 days                  | 87, every one `runtime.name=node`, zero from a browser |

## What has to happen, in order

1. **A person sets the variable on the Vercel project** — `NEXT_PUBLIC_SENTRY_DSN`
   (and `NEXT_PUBLIC_SENTRY_ENVIRONMENT`) for Production and Preview. This is the
   whole fix. Nothing in this repository can do it.
2. **Redeploy.** The value is a build-time text substitution, not a runtime read.
   Setting it without a new build changes nothing.
3. **Confirm on the deployed bundle**, not on the dashboard: fetch the page's
   `main-app` chunk and look for a real `https://…@…sentry.io/…` string. The
   literal token `NEXT_PUBLIC_SENTRY_DSN` still being there means it is still
   unset.

## What the code change in this commit does, and does not do

`turbo.json` now lists `NEXT_PUBLIC_SENTRY_DSN` and
`NEXT_PUBLIC_SENTRY_ENVIRONMENT` in `@sahoda/web#build`'s `env`, next to
`SENTRY_DSN`. That records the dependency and keeps the build cache honest when
the value changes.

**It does not turn browser reporting on.** A turbo dry run shows `NEXT_PUBLIC_*`
is already framework-inferred, so the allowlist was never what was blocking
this. The variable being absent from the Vercel project is.

## .env.example

`.env.example` lists `SENTRY_DSN` alone and `NEXT_PUBLIC_SENTRY_DSN` belongs
beside it. **This file is protected and a person has to make that edit** — the
`.env*` pattern is on the do-not-touch list, and `.gitignore` shadows
`.env.example` besides.

## Owed, and deliberately not done here

- `instrumentation-client.ts:30` reads `NEXT_PUBLIC_SENTRY_RELEASE`, which is set
  nowhere. `withSentryConfig` injects a release of its own, so that read should
  go rather than gain a fourth variable to configure.
- No guard exists for any of this. The check that would have caught it reads the
  DEPLOYED chunk for the un-inlined token, which needs a network the local suite
  does not have.
