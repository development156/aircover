import type { SiteBundle } from '@sahoda/sites'

/**
 * A bundle page references its stylesheet depth-relatively (`styles.css`,
 * `../styles.css`) — HTTP- and file://-correct, but a sandboxed `srcdoc`
 * iframe has no base to resolve it against, so the layout sheet would silently
 * never load. For preview ONLY, the link tag is replaced with the sheet
 * inlined. The regex targets exactly the tag `renderDocument` emits; if the
 * emitter's shape ever changes the replace becomes a no-op and the preview
 * loses layout (colors survive — tokens are inlined in the head), which the
 * test against the REAL renderBundle output would catch.
 */
const STYLESHEET_LINK = /<link rel="stylesheet" href="(?:\.\.\/)*styles\.css">/

export interface PreviewPage {
  path: string
  title: string
  html: string
}

export function toPreviewPages(bundle: SiteBundle): PreviewPage[] {
  const sheet = bundle.files.find((file) => file.path === 'styles.css')?.content ?? ''
  return (
    bundle.files
      // `renderBundle` emits 'text/html; charset=utf-8' — match the media type,
      // not the full header value.
      .filter((file) => file.contentType.startsWith('text/html'))
      .map((file) => ({
        path: file.path,
        title: titleOf(file.content) ?? file.path,
        html: file.content.replace(STYLESHEET_LINK, () => `<style>${sheet}</style>`),
      }))
  )
}

function titleOf(html: string): string | null {
  const match = /<title>([^<]*)<\/title>/.exec(html)
  return match?.[1] ?? null
}
