import 'server-only'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * THE TYPEFACE THE EXPORT IS DRAWN IN, MADE A FACT RATHER THAN A HOPE.
 *
 * ── THE PROBLEM THIS CLOSES ─────────────────────────────────────────────────
 * `TEMPLATE_FONT` has named Noto since the studio was built and nothing shipped
 * it, so the server drew every export in whatever font happened to be installed
 * where it was running, and said nothing. `raster.test.ts` carries the
 * measurement: an installed family and an INVENTED one produce indistinguishable
 * ink, because fontconfig substitutes silently. A customer's poster could be a
 * different typeface in production from the one they approved on screen, and no
 * check anywhere would see it.
 *
 * ── WHAT WAS MEASURED, AND WHY IT IS DONE THIS WAY ──────────────────────────
 * Measured 2026-08-29 in this repository, through the same sharp 0.35.3 /
 * libvips 8.18.3 the product already ships. Greyscale ink means, 600x120, one
 * line of text:
 *
 *   `@font-face` with the font embedded as a data URI    IGNORED.
 *       A serif and a monospace face, embedded, both rendered 243.12936 —
 *       byte-identical to naming a family that does not exist. So the font
 *       cannot travel inside the SVG, and the picture cannot carry its own
 *       typeface. That ruled out the approach that needed no deployment change.
 *
 *   A `.woff` / `.woff2` file in the font directory                UNUSABLE.
 *       fontconfig INDEXES them and reports the family, which is worse than
 *       not finding them: the font looks configured. Rendering "iiiiiiii" in
 *       it produced 255.00000 — a blank canvas, no ink at all. That is why
 *       this ships `.ttf` and why `@fontsource/*`, which publishes only woff,
 *       was removed again after being tried.
 *
 *   `FONTCONFIG_FILE` naming a config that lists this folder     HONOURED,
 *       and additive: `DejaVu Sans` still resolved to the system copy
 *       afterwards, so nothing is taken away by adding ours.
 *
 *   The same variable set AFTER the process has rasterised once   NO EFFECT.
 *       243.12936 before and 243.12936 after, for the same string. fontconfig
 *       reads its configuration once, on first use. THAT is why this runs from
 *       `instrumentation.ts`, which Next executes at server start before any
 *       request is handled, and not lazily inside the exporter.
 *
 * ── WHAT THIS DOES NOT GIVE YOU ─────────────────────────────────────────────
 * The renderer does per-character fallback across the whole set, so asking for
 * one family and getting another's glyphs for characters it lacks is normal and
 * correct. This makes the fonts PRESENT and their names resolvable. It does not,
 * and cannot, make the browser preview and the server export use the same
 * typeface: the browser resolves against the reader's machine. `svg.ts`'s header
 * carries that narrower claim and it is still the true one.
 */

/** The families bundled beside this app, by the name a template asks for. */
export const BUNDLED_FAMILIES = ['Noto Sans', 'Noto Sans Devanagari'] as const

/**
 * Where the `.ttf` files live at runtime.
 *
 * ── UNDER `public/`, AND THAT IS THE WHOLE TRICK ────────────────────────────
 * One copy of each file, doing two jobs. The server reads them from disk here,
 * and the BROWSER downloads the same bytes from `/fonts/...` through the
 * `@font-face` rules in `globals.css`. Both sides therefore answer to the same
 * family names, which is what lets the preview and the export be the SAME SVG
 * string rather than two strings that merely look alike.
 *
 * A second copy under a private folder would work for the server and would
 * drift from the served one the first time somebody updated a file.
 *
 * `process.cwd()` is the app root under `next start` and inside a serverless
 * function alike. The files reach the function because `next.config.ts` names
 * them in `outputFileTracingIncludes`: nothing imports them, so tracing cannot
 * find them on its own, and without that line this folder is simply absent in
 * production while every check here still passes locally.
 */
export function studioFontsDir(): string {
  return path.join(process.cwd(), 'public', 'fonts')
}

let applied: string | null = null

/**
 * Make the bundled fonts visible to the rasteriser.
 *
 * Idempotent, and it never throws: a studio export drawn in a substituted font
 * is a worse picture, and an export that fails because a font directory was
 * missing is no picture at all. The second is the worse outcome, so every
 * failure here is swallowed and the caller carries on.
 *
 * Returns the config path it applied, or null when it did nothing, so a test
 * can tell "it worked" from "it decided not to".
 */
export function registerStudioFonts(): string | null {
  if (applied !== null) return applied

  try {
    const fontsDir = studioFontsDir()
    if (!fs.existsSync(fontsDir)) return null

    // fontconfig needs somewhere to write its index. `/tmp` is the one writable
    // path in a serverless function, and `mkdtemp` keeps two instances of the
    // same function from sharing a half-written cache.
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sahoda-fc-'))
    const configPath = path.join(cacheDir, 'fonts.conf')

    // The system directory is listed AFTER ours and kept deliberately: this adds
    // typefaces, it does not replace the machine's. Naming a directory that does
    // not exist is not an error to fontconfig, so this is safe where there is no
    // /usr/share/fonts at all.
    fs.writeFileSync(
      configPath,
      '<?xml version="1.0"?>\n' +
        '<fontconfig>\n' +
        `  <dir>${fontsDir}</dir>\n` +
        '  <dir>/usr/share/fonts</dir>\n' +
        `  <cachedir>${cacheDir}</cachedir>\n` +
        '</fontconfig>\n',
      'utf8',
    )

    process.env.FONTCONFIG_FILE = configPath
    applied = configPath
    return configPath
  } catch {
    return null
  }
}
