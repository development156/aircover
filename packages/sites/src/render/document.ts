/**
 * The document shell — the last escaping gate in this package.
 *
 * `page.title`, `page.seoDescription`, `ctx.siteName` and `ctx.canonicalOrigin` reach markup
 * ONLY here; none of them passes through a section renderer, so nothing downstream will catch
 * a miss. Every one of them is model-generated or caller-injected, and the finished document
 * ships to a customer's live domain, so an unescaped payload executes in the tenant's origin.
 *
 * ## The stylesheet href is depth-relative, not root-absolute
 *
 * `/styles.css` is HTTP-correct and file://-FATAL. The fixture deployer hands the founder
 * `file:///<outDir>/<slug>/index.html`, and a browser resolves a root-absolute href from that
 * document against the FILESYSTEM ROOT (`file:///styles.css`) — never the site directory. Every
 * layout rule (body margin, `.wrap`, `.section`, `.grid`, `.cta`, the `h1` clamp, the form
 * controls) lives in that sheet and every section wraps its content in `.section`/`.wrap`, so a
 * root-absolute href means the preview is unstyled full-bleed serif text with the CTA as a blue
 * underlined link. A relative href resolves correctly under BOTH file:// and http://, so it is
 * strictly better rather than a fixture-only accommodation.
 *
 * The depth comes from {@link pathToFile} — the SAME normalized path the bundle writes the file
 * at — so the href and the file's real location cannot drift apart. There is deliberately no
 * second notion of page depth in this module.
 *
 * ## Zero inline JavaScript
 *
 * The contact form is a plain HTML POST, which removes the entire inline-JS attack class. There
 * is no `<script>` in this file and no event-handler attribute anywhere in the output.
 */
import type { DraftPage } from '../normalize/draft'
import { UNTITLED_SITE } from '../normalize/draft'
import { pathToFile } from '../normalize/path'
import { themeCss } from '../theme/css'
// RenderContext lives in its own leaf module (Task 10) so that sections/*.ts never imports a
// type from this file while this file imports their values.
import type { RenderContext } from './context'
import { renderBody } from './body'
import { escapeAttr, escapeHtml, safeUrl } from './escape'

const LANG = 'en'
const VIEWPORT = 'width=device-width, initial-scale=1'
const TWITTER_CARD = 'summary_large_image'
const ROOT_PATH = '/'
const SEPARATOR = '/'
const STYLESHEET_FILE = 'styles.css'
const PARENT_SEGMENT = '../'

/** docs/07 Brand Kit:62 — generated sites use Outfit. Static markup, never model-supplied. */
const FONT_LINKS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap">',
].join('')

const DEFAULT_FONT = 'Outfit'

/**
 * Allowlist for a family name that may originate in a workspace theme row. No quote, semicolon,
 * brace, backslash or slash can survive it, so a theme value cannot close the declaration and
 * inject a rule into the sheet. A leading letter is required: the name is emitted quoted, so a
 * leading digit is not itself dangerous, but every real family starts with a letter and the
 * narrower rule costs nothing.
 */
const FONT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9 ]{0,39}$/

/**
 * Named after the family, and load-bearing rather than decorative: a fixture preview opens from
 * `file://` with no network, so the Google font never loads and this stack is what the founder
 * actually sees.
 */
const FONT_FALLBACKS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

/**
 * An origin a page can actually live at: an absolute `http:`/`https:` URL WITH an authority,
 * case-insensitive on the scheme. `safeUrl` alone is too permissive here — it also allows
 * `mailto:` and `tel:` (no page lives at either) and accepts a site-relative `/x` (which has no
 * origin at all). Same shape, and the same reasoning, as `ABSOLUTE_HTTP_ACTION` in `form.ts`.
 */
const ABSOLUTE_HTTP_ORIGIN = /^https?:\/\/[^/\\]/i

const TRAILING_SLASHES = /\/+$/

/** A `<style>` body may not contain a closing tag; the HTML parser would end the block there. */
const STYLE_CLOSER = /<\/style/i

/** Colours are tokens from packages/shared/tokens.css; lengths and weights are literals. */
const BASE_CSS = [
  '*,*::before,*::after{box-sizing:border-box}',
  'body{margin:0;font-family:var(--site-font-body);color:var(--ink);background:var(--bg);line-height:1.6;-webkit-text-size-adjust:100%}',
  'img,video{max-width:100%;height:auto}',
  '.wrap{width:100%;max-width:72rem;margin:0 auto;padding:0 1.25rem}',
  '.section{padding:clamp(2.5rem,6vw,5rem) 0}',
  'h1,h2,h3{font-family:var(--site-font-heading);line-height:1.15;margin:0 0 .5em}',
  'h1{font-size:clamp(2rem,5vw,3.5rem)}',
  'h2{font-size:clamp(1.5rem,3.5vw,2.25rem)}',
  'h3{font-size:1.125rem;margin-bottom:.35em}',
  'p{margin:0 0 1rem}',
  '.lede{font-size:clamp(1.05rem,2vw,1.25rem);color:var(--muted)}',
  '.grid{list-style:none;margin:0;padding:0;display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))}',
  '.cta{display:inline-block;padding:.75rem 1.5rem;border-radius:var(--r-pill);background:var(--p);color:var(--pfg);text-decoration:none;font-weight:600}',
  '.cta--inert{background:var(--t100);color:var(--ink)}',
  '.price{font-weight:600;color:var(--ink)}',
  '.faq{margin:0}',
  '.faq dt{font-weight:600;margin-top:1.25rem}',
  '.faq dd{margin:.25rem 0 0;color:var(--muted)}',
  'figure{margin:0}',
  'blockquote{margin:0 0 .75rem;font-size:1.05rem}',
  // The attribution separator is NOT here. `content:", "` on this selector put the comma on
  // every role span, including one with no author in front of it — ", Cafe owner". The decision
  // about whether a separator applies lives in `renderTestimonials`, which is the only code that
  // knows whether both halves are present, so the separator lives there too. This rule styles
  // the role and nothing more; adding a `::before` back would double the emitted separator.
  '.role{color:var(--muted)}',
  '.lead-form{display:grid;gap:1rem;max-width:32rem}',
  '.field{display:grid;gap:.35rem}',
  '.field span{font-weight:600;font-size:.9rem}',
  'input,textarea{font:inherit;width:100%;padding:.7rem .8rem;border:1px solid var(--line);border-radius:var(--r-input);background:var(--s1);color:inherit}',
  'button{font:inherit;border:0;cursor:pointer}',
  '.fine{font-size:.85rem;margin:0;color:var(--muted)}',
].join('')

/**
 * A family name that is safe to interpolate into the sheet, or `Outfit`. Takes `unknown`: the
 * theme row is untrusted at runtime whatever its declared type says.
 */
export const safeFontName = (raw: unknown): string => {
  if (typeof raw !== 'string') return DEFAULT_FONT
  const name = raw.trim()
  return FONT_NAME_PATTERN.test(name) ? name : DEFAULT_FONT
}

/**
 * `ctx.theme` is `ThemeTokens | null` (see `context.ts`), but this reads through `unknown`
 * rather than the declared type on purpose: the theme row is fed by a jsonb column, so a
 * declared type is not a runtime guarantee here. `safeFontName` re-checks every family name
 * against `FONT_NAME_PATTERN` regardless of what the type claims.
 */
const themeFontName = (ctx: RenderContext, key: 'fontHeading' | 'fontBody'): string => {
  const theme: unknown = ctx.theme
  if (theme === null || typeof theme !== 'object') return DEFAULT_FONT
  return safeFontName((theme as Record<string, unknown>)[key])
}

const fontRule = (ctx: RenderContext): string => {
  const heading = themeFontName(ctx, 'fontHeading')
  const body = themeFontName(ctx, 'fontBody')
  return `:root{--site-font-heading:'${heading}',${FONT_FALLBACKS};--site-font-body:'${body}',${FONT_FALLBACKS}}`
}

/**
 * The stylesheet href for a page, relative to that page's own directory. Derived from the
 * bundle file `pathToFile` will write, so it is impossible for the two to disagree.
 *
 * Throws on a path the bundle would not write. `normalizePath` has already run by the time a
 * `DraftPage` exists, so this is a programming error, and guessing a depth would ship a page
 * whose stylesheet 404s — silently, since a missing sheet renders as plain text rather than an
 * error.
 */
export const stylesheetHref = (path: string): string => {
  const depth = pathToFile(path).split(SEPARATOR).length - 1
  return `${PARENT_SEGMENT.repeat(depth)}${STYLESHEET_FILE}`
}

const pickTitle = (rawTitle: string, siteName: string): string => {
  const title = rawTitle.trim()
  if (title !== '') return title
  const fallback = siteName.trim()
  return fallback === '' ? UNTITLED_SITE : fallback
}

/** The canonical URL for a page, or `null` when no origin was injected or it is unusable. */
const pageUrl = (origin: string | null, path: string): string | null => {
  if (origin === null) return null
  const trimmed = origin.trim()
  if (!ABSOLUTE_HTTP_ORIGIN.test(trimmed)) return null
  const base = trimmed.replace(TRAILING_SLASHES, '')
  return safeUrl(path === ROOT_PATH ? `${base}/` : `${base}${path}`)
}

/**
 * tokens.css baseline + the derived brand vars. `themeCss`'s output is already structurally
 * incapable of closing the block — every value it emits is machine-built `oklch(L C H)` or a
 * fixed foreground literal — so in practice only the caller-injected `tokensCss` can carry a
 * `</style`. Both halves are trusted, non-model strings, and CSS cannot be HTML-escaped without
 * corrupting it, so instead of escaping, the CONCATENATION is checked and the one sequence that
 * would break out of the block is rejected outright. A caller injecting that has a bug; failing
 * loudly beats emitting a document whose head silently ends early.
 */
const headStyle = (ctx: RenderContext): string => {
  const css = `${ctx.tokensCss}${themeCss(ctx.theme)}`
  if (STYLE_CLOSER.test(css)) {
    throw new Error(
      'renderDocument: the injected tokensCss closes the <style> block; refusing to emit it. ' +
        "(themeCss's own output is machine-built and cannot close the block, so the sequence " +
        'came from tokensCss.)',
    )
  }
  return css
}

export const renderStylesheet = (ctx: RenderContext): string => `${fontRule(ctx)}${BASE_CSS}`

export const renderDocument = (page: DraftPage, ctx: RenderContext): string => {
  const title = pickTitle(page.title, ctx.siteName)
  const description =
    page.seoDescription === null || page.seoDescription.trim() === ''
      ? null
      : page.seoDescription.trim()
  const canonical = pageUrl(ctx.canonicalOrigin, page.path)
  const stylesheet = stylesheetHref(page.path)
  const style = headStyle(ctx)
  // Not a `map` over `renderSection`: `id="contact"` is unique per DOCUMENT, and this call is
  // that document's scope. See `body.ts` for why the allocation cannot live in the renderer.
  const body = renderBody(page.sections, ctx)

  return [
    '<!doctype html>',
    `<html lang="${LANG}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta name="viewport" content="${VIEWPORT}">`,
    `<title>${escapeHtml(title)}</title>`,
    description === null ? '' : `<meta name="description" content="${escapeAttr(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeAttr(ctx.siteName)}">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    description === null
      ? ''
      : `<meta property="og:description" content="${escapeAttr(description)}">`,
    canonical === null ? '' : `<meta property="og:url" content="${escapeAttr(canonical)}">`,
    canonical === null ? '' : `<link rel="canonical" href="${escapeAttr(canonical)}">`,
    `<meta name="twitter:card" content="${TWITTER_CARD}">`,
    FONT_LINKS,
    `<style>${style}</style>`,
    `<link rel="stylesheet" href="${escapeAttr(stylesheet)}">`,
    '</head>',
    '<body>',
    '<main>',
    body,
    '</main>',
    `<footer class="section"><div class="wrap"><p class="fine">&#169; ${escapeHtml(ctx.siteName)}</p></div></footer>`,
    '</body>',
    '</html>',
  ]
    .filter((line) => line !== '')
    .join('')
}
