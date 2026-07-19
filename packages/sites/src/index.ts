/**
 * Public surface of @sahoda/sites. Explicit named re-exports only — no `export *`.
 *
 * NOT exported, deliberately:
 *   - the internal `coerce` helper in render/escape.ts: callers must pick a context-correct
 *     escaper, never a bare stringifier.
 *   - the module-level limit and character-class constants: they are implementation detail,
 *     and exporting them invites a caller to re-implement the check instead of calling it.
 */
export { escapeHtml, escapeAttr, safeUrl, stripControl } from './render/escape'

export const SITES_PACKAGE = '@sahoda/sites' as const
