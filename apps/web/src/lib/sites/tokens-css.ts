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
 */
const require = createRequire(import.meta.url)

let cached: string | undefined

export function sharedTokensCss(): string {
  return (cached ??= readFileSync(require.resolve('@sahoda/shared/tokens.css'), 'utf8'))
}
