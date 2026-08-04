const MAX_SLUG_LENGTH = 48
const FALLBACK_SLUG = 'workspace'

function trimDashes(value: string): string {
  return value.replace(/^-+|-+$/g, '')
}

export function slugify(name: string): string {
  const slug = trimDashes(
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
  )
  return trimDashes(slug.slice(0, MAX_SLUG_LENGTH)) || FALLBACK_SLUG
}

// Attempt 0 → base slug; attempt n → `-{n+1}` suffix, shortening the base so
// the total stays within the cap (slug uniquification per FSD §M1).
export function withSuffix(slug: string, attempt: number): string {
  if (attempt === 0) return slug
  const suffix = `-${attempt + 1}`
  return trimDashes(slug.slice(0, MAX_SLUG_LENGTH - suffix.length)) + suffix
}
