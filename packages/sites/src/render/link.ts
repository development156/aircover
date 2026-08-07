import { escapeAttr, escapeHtml, safeUrl } from './escape'

/**
 * The ONLY module in packages/sites that emits an anchor.
 *
 * `safeUrl` returns a plain `string | null`, not a branded type, so a renderer that wrote
 * `` href="${safeUrl(x)}" `` itself would compile, read fine in review, and skip `escapeAttr`
 * entirely. Routing every link through one function makes that mistake unavailable rather
 * than merely tested-against — there is exactly one `href=` in the package, and it is here.
 *
 * A rejected URL drops the link but never the words: the label still renders, as escaped
 * text inside a span (design §5 rule 2 — no dead-or-dangerous link, no lost copy).
 *
 * `href` and `label` are `unknown` because both originate in model output; `escapeHtml`,
 * `escapeAttr` and `safeUrl` each coerce at that boundary rather than throwing mid-render.
 */
export const renderLink = (href: unknown, label: unknown, className: string): string => {
  const url = safeUrl(href)
  if (url === null) return `<span class="${escapeAttr(className)}">${escapeHtml(label)}</span>`
  return `<a class="${escapeAttr(className)}" href="${escapeAttr(url)}">${escapeHtml(label)}</a>`
}
