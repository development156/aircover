import {
  SiteGenerateOutputSchema,
  type SiteGenerateOutput,
  type SitePage,
  type SiteSection,
} from '@sahoda/shared'

/**
 * Persisted site tree → the generator-output shape, so the preview re-enters
 * the SAME `normalizeDraft → renderBundle` pipeline the rows came from.
 * `@sahoda/sites` deliberately refuses hand-assembled `SiteDraft`s (that would
 * bypass the path/traversal/bounds guards), so rows go BACK to the untrusted
 * input shape and re-earn their way through. Returns null when the stored tree
 * no longer parses — an honest "can't preview" beats rendering around a guard.
 */
export function siteTreeToOutput(
  pages: SitePage[],
  sections: SiteSection[],
): SiteGenerateOutput | null {
  const byPage = new Map<string, SiteSection[]>()
  for (const section of sections) {
    const list = byPage.get(section.page_id) ?? []
    byPage.set(section.page_id, [...list, section])
  }

  const candidate = {
    pages: [...pages]
      .sort((a, b) => a.sort - b.sort)
      .map((page) => ({
        path: page.path,
        // '' is deliberately unusable: normalizeDraft falls back to the site name.
        title: page.title ?? '',
        ...(isSeo(page.seo) ? { seo: page.seo } : {}),
        sections: (byPage.get(page.id) ?? [])
          .sort((a, b) => a.sort - b.sort)
          .map((section) => ({ kind: section.kind, content: section.content })),
      })),
  }

  const parsed = SiteGenerateOutputSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function isSeo(value: unknown): value is { description: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'description' in value &&
    typeof (value as { description: unknown }).description === 'string'
  )
}
