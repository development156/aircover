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
 * Removed before conversion. This is the poor cousin of Firecrawl's
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
  td.remove((node) => DROP.has(node.nodeName.toLowerCase()))
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
