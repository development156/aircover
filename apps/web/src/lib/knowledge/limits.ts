/**
 * Limits both halves of the app need to agree on.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM `read-source.ts` ───────────────────
 * `MAX_UPLOAD_BYTES` lived there, and `read-source.ts` opens with
 * `import 'server-only'` — correctly, since it fetches URLs and parses PDFs.
 * `add-document.tsx` is a `'use client'` component and needs the number to tell
 * the owner the cap before they pick a file.
 *
 * Importing it across that line did not fail a typecheck, a lint or any of 3,705
 * unit tests. It 500'd EVERY ROUTE IN THE APP, and the only thing that found it
 * was loading a page:
 *
 *     x You're importing a component that needs "server-only".
 *       ./src/lib/knowledge/read-source.ts
 *       ./src/components/knowledge/add-document.tsx
 *
 * A constant has no server in it, so it belongs where both sides can reach it.
 * `client-imports-server-only.test.ts` is the guard that stops the next one.
 */

/**
 * The largest file the library accepts, before anything is parsed.
 *
 * The same 2 MB `packages/research` applies to a fetched page
 * (`DEFAULT_MAX_BYTES`), for the same reason: an uncapped read is a way to
 * exhaust this server's memory, and a document larger than this is not a menu.
 */
export const MAX_UPLOAD_BYTES = 2_000_000
