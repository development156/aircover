import 'server-only'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

/**
 * The raw bytes of `@sahoda/shared/tokens.css`, for injection into
 * `renderBundle`'s RenderContext (the package never touches the filesystem —
 * the caller supplies the baseline). Resolved through the package's own
 * `exports` map so the path survives layout changes, and read once per
 * process. `next.config.ts` carries an `outputFileTracingIncludes` entry so
 * Vercel's function bundle ships the file.
 *
 * This is the ONLY runtime I/O on the /sites render path, and both of its
 * steps can fail in a bundled serverless function in ways they never do in dev
 * — `createRequire`/`require.resolve` depend on the emitted module's own
 * location and on the shared package.json being present, and `readFileSync`
 * depends on the traced file actually shipping. A failure here must therefore
 * degrade, not throw: an empty baseline renders a valid but unstyled document,
 * which is far better than no preview at all for a site the founder paid 100
 * credits to generate.
 *
 * The failure is logged with its real message so the cause is visible in the
 * function logs; `''` is cached like a success so one bad resolve does not
 * retry the same I/O on every render.
 */
const require = createRequire(import.meta.url)

let cached: string | undefined

export function sharedTokensCss(): string {
  if (cached !== undefined) return cached

  try {
    cached = readFileSync(require.resolve('@sahoda/shared/tokens.css'), 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[sites] tokens.css unavailable, rendering without the baseline: ${message}`)
    cached = ''
  }

  return cached
}
