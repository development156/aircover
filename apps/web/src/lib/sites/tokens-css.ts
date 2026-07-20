import 'server-only'

import { TOKENS_CSS } from './tokens-css-inline'

/**
 * The raw bytes of `@sahoda/shared/tokens.css`, for injection into
 * `renderBundle`'s RenderContext (the package never touches the filesystem —
 * the caller supplies the baseline).
 *
 * This used to be `readFileSync(require.resolve('@sahoda/shared/tokens.css'))`.
 * That works in dev and FAILS in the deployed Vercel function — pnpm links
 * `node_modules/@sahoda/shared` as a symlink the serverless bundle does not
 * recreate, so `require.resolve` throws MODULE_NOT_FOUND. The throw escaped and
 * 500'd the whole /sites route the moment the first real site existed; made
 * fail-safe, it instead returned `''` and rendered the paid-for preview
 * completely unstyled. Both were observed live on 2026-07-20.
 *
 * The stylesheet is 1.7 KB of static design tokens, so it is inlined at build
 * time instead: no filesystem, no module resolution, no file-tracing config,
 * and identical behaviour under Turbopack (dev) and webpack (build).
 * `tokens-css-inline.test.ts` fails if the inline copy drifts from the file.
 */
export function sharedTokensCss(): string {
  return TOKENS_CSS
}
