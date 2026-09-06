import TurndownService from 'turndown'

/**
 * HTML → markdown, and same-origin link discovery.
 *
 * Turndown parses into a DOM tree (its bundled `@mixmark-io/domino`, pure JS —
 * no jsdom) and we remove nodes from that TREE. That distinction is the point:
 * a regex tag-stripper run over adversarial customer HTML is both a correctness
 * hazard and a DoS surface, which this codebase has already been bitten by once
 * (the redaction scrubber, 22s stall on unanchored patterns).
 */

/**
 * Removed before conversion. This is the poor cousin of a rendering vendor's
 * `onlyMainContent`, and deliberately a BLUNT one: Readability-style heuristics
 * want a long prose block and an SMB café homepage is nav + hero + hours, so
 * they routinely return nothing on exactly the sites tier 1 exists to read.
 * Dropping chrome and keeping everything else fails in the safer direction —
 * some nav text in the corpus costs a little noise; an empty extraction costs a
 * wrong `thin` verdict and a needless escalation to a paid tier.
 */
const DROP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'nav',
  'footer',
  'aside',
])

/**
 * Chrome that Wix, Shopify and WordPress put in plain `<div>`s, where the
 * semantic DROP list above cannot see it. Observed in the 2026-08-12 SMB run:
 * "top of page", "Skip to content", "Log in".
 *
 * DELIBERATELY ABSENT: `menu`, and bare `header`.
 *
 * A café's `<div class="menu">` is its menu — the single most brand-specific
 * thing on the page — and half of these themes class the hero as `.header`.
 * Matching either would strip exactly the copy tier 1 exists to read, and the
 * damage would show up as a LOWER word count that looks like a cleaner corpus.
 * Only compound, unambiguous chrome tokens are listed; the navigation cases are
 * `nav-menu` / `menu-toggle` / `mobile-menu`, never `menu` alone.
 */
const CHROME_TOKEN =
  /(^|[\s_-])(navbar|nav-menu|nav-link|menu-toggle|mobile-menu|offcanvas|breadcrumb|cookie|consent|gdpr|sidebar|widget-area|social-links|share-button|newsletter|subscribe|back-to-top|skip-link|skiplink|screen-?reader|sr-only|visually-hidden|site-header|site-footer|topbar|top-bar|announcement-bar)([\s_-]|$)/i

/** ARIA landmarks that say "this is chrome" in a theme-independent way. */
const CHROME_ROLE = /^(navigation|banner|contentinfo|search|menubar|toolbar)$/i

/** Chrome destinations. A link to a login form is not a sentence about a brand. */
const CHROME_HREF =
  /\/(customer_authentication|account\/login|my-account|wp-login|login|signin|sign-in|register|cart|checkout)\b/i

interface AttrNode {
  nodeName: string
  getAttribute?: (name: string) => string | null
  textContent?: string | null
}

function attr(node: AttrNode, name: string): string {
  return node.getAttribute?.(name) ?? ''
}

function isChrome(node: AttrNode): boolean {
  if (DROP.has(node.nodeName.toLowerCase())) return true
  if (attr(node, 'aria-hidden') === 'true') return true
  if (CHROME_ROLE.test(attr(node, 'role'))) return true
  const signature = `${attr(node, 'class')} ${attr(node, 'id')}`
  return CHROME_TOKEN.test(signature)
}

function isChromeLink(node: AttrNode): boolean {
  if (node.nodeName.toLowerCase() !== 'a') return false
  const href = attr(node, 'href')
  // `javascript:void(0)` is a control dressed as a link — it went straight into
  // the corpus on three of five real sites.
  if (/^javascript:/i.test(href)) return true
  if (CHROME_HREF.test(href)) return true
  return /^\s*skip to (main )?content\s*$/i.test(node.textContent ?? '')
}

function service(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  // A PREDICATE, not a tag-name array: turndown types `Filter` as
  // `keyof HTMLElementTagNameMap`, which excludes `svg` — and that mismatch is
  // invisible in this package (tsconfig `types: ["node"]`, no DOM lib) and only
  // surfaces where apps/web compiles it. A predicate is both correct and honest
  // about matching on the node's own name.
  td.remove((node) => isChrome(node as unknown as AttrNode))
  td.addRule('dropChromeLinks', {
    filter: (node) => isChromeLink(node as unknown as AttrNode),
    replacement: () => '',
  })
  // Images contribute an alt string at best and a wall of base64 at worst.
  td.addRule('dropImages', { filter: 'img', replacement: () => '' })
  return td
}

export interface ParsedPage {
  title: string
  markdown: string
  /** Absolute, same-origin, deduped, in document order. */
  links: string[]
}

/** `<title>` is read off the raw HTML — turndown drops `<head>` entirely. */
function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)
  if (!match) return ''
  return match[1]!
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

/**
 * Same-origin `href`s, absolutised against the page's own URL.
 *
 * Bounded on purpose: the match is capped in length and the result list is
 * capped in count, so a page with 50,000 anchors cannot turn link discovery
 * into the slow part of a signup.
 */
const MAX_LINKS = 300

export function extractLinks(html: string, pageUrl: string): string[] {
  let origin: string
  try {
    origin = new URL(pageUrl).origin
  } catch {
    return []
  }

  const seen = new Set<string>()
  const out: string[] = []
  const anchor = /<a\b[^>]{0,600}?href\s*=\s*["']([^"']{1,600})["']/gi

  for (const match of html.matchAll(anchor)) {
    if (out.length >= MAX_LINKS) break
    const href = match[1]!
    if (/^(#|javascript:|mailto:|tel:|data:)/i.test(href)) continue
    let absolute: URL
    try {
      absolute = new URL(href, pageUrl)
    } catch {
      continue
    }
    if (absolute.origin !== origin) continue
    absolute.hash = ''
    const key = absolute.toString().replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(absolute.toString())
  }

  return out
}

export function htmlToMarkdown(html: string): string {
  if (html.trim().length === 0) return ''
  try {
    return service()
      .turndown(html)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    // A parser failure is a page we cannot read, not a crash. The caller's
    // classifier will call it `js_only`/`thin` and fall back to asking.
    return ''
  }
}

export function parsePage(html: string, pageUrl: string): ParsedPage {
  return {
    title: extractTitle(html),
    markdown: htmlToMarkdown(html),
    links: extractLinks(html, pageUrl),
  }
}
