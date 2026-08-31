import * as Sentry from '@sentry/nextjs'

/**
 * Next.js instrumentation hook — the server-side entry point for observability.
 *
 * LOCATION IS LOAD-BEARING. Next resolves this file from
 * `path.join(pagesDir || appDir, '..')` (next/dist/build/index.js), which for a
 * src-directory project is `src/`, NOT the package root. A copy at the package
 * root is not an error and not a warning — it is simply never scanned, and the
 * only symptom is that no server error ever reaches Sentry. `src/middleware.ts`
 * sits in this same directory for the same reason, and is the working proof.
 */

/**
 * Runs once per runtime at server start, before any request is handled.
 *
 * The imports are dynamic and guarded rather than static and unconditional
 * because the two config modules are not interchangeable: the node one drags in
 * OpenTelemetry and node-only integrations that do not exist under the edge
 * runtime, so a static import of both would break the edge bundle at build time.
 * `register()` is invoked once in each runtime, and each call loads only its own.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // The studio's typefaces, and the timing is the whole reason this line is
    // HERE rather than inside the exporter. MEASURED: fontconfig reads its
    // configuration once, on first use, so `FONTCONFIG_FILE` set after anything
    // has rasterised is ignored (243.12936 before and after, same string).
    // `register()` runs at server start, before any request. `fonts.ts` carries
    // the full account and never throws.
    const { registerStudioFonts } = await import('./lib/studio/fonts')
    registerStudioFonts()
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * The hook Next calls for every error thrown in a Server Component, route
 * handler, server action or middleware.
 *
 * This export is what makes server-side reporting work at all. React Server
 * Components do not surface their errors to any client-side boundary — by the
 * time `error.tsx` renders, the real stack has already been replaced with an
 * opaque `digest`. Without `onRequestError` the entire server half of the app is
 * unmonitored, and the error boundaries below would report nothing but "a digest
 * happened".
 *
 * Assigned directly rather than wrapped in a lambda: Sentry reads the argument
 * count of this export to decide which call signature Next is using, and an
 * arrow wrapper with the wrong arity silently changes how the event is routed.
 */
export const onRequestError = Sentry.captureRequestError
