import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync('packages/shared/tokens.css', 'utf8')
const esc = src.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const header = `/**
 * Byte-for-byte inline of \`packages/shared/tokens.css\` (Design Tokens v4.0).
 *
 * The /sites preview needs this stylesheet as a STRING to inject into
 * \`renderBundle\`'s RenderContext. It used to be read from disk at request time
 * via \`readFileSync(require.resolve('@sahoda/shared/tokens.css'))\`, which works
 * in dev and FAILS in the deployed Vercel function: pnpm links
 * \`node_modules/@sahoda/shared\` as a symlink that the serverless bundle does
 * not recreate, so \`require.resolve\` cannot find the package. That threw, and
 * the throw took the whole /sites route down with a 500 on the first real
 * generated site (2026-07-20).
 *
 * Inlining removes the failure class outright — no filesystem, no module
 * resolution, no tracing config — and works identically under Turbopack (dev)
 * and webpack (build).
 *
 * DO NOT hand-edit. \`tokens.css\` remains the single source of truth;
 * \`tokens-css-inline.test.ts\` reads it from disk and fails if this copy drifts.
 * Regenerate with scripts/gen-tokens-inline.mjs rather than patching by hand.
 */
export const TOKENS_CSS = \`${esc}\`
`
writeFileSync('apps/web/src/lib/sites/tokens-css-inline.ts', header)
console.log('regenerated, bytes:', src.length)
