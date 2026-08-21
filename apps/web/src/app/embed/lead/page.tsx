import type { Metadata } from 'next'

import { LeadForm } from '@/components/embed/lead-form'

/**
 * `/embed/lead` — the public, frame-able contact form that feeds `leads`.
 *
 * Framed into whatever site a shop already has: `isFrameable` in
 * `lib/security/csp.ts` matches every `/embed/` path, so this needs no CSP
 * change, and the middleware's public list names it exactly.
 *
 * ── THE SLUG COMES FROM THE URL AND NAMES A SITE, NEVER A WORKSPACE ──────────
 * `?site=` is the `sites.slug` the shop owner pastes into their embed code. It
 * is a public identifier — it is the subdomain their site will live on — and it
 * is NOT a capability: `lead_submit` resolves the workspace from it inside the
 * database, so the worst a wrong slug can do is send an enquiry to a site that
 * does not exist, which the endpoint answers exactly as it answers an outage.
 *
 * There is deliberately NO check here that the slug names a real site. Doing it
 * would turn this page into a way to enumerate which Sahoda sites exist, which
 * is a fact about other people's businesses.
 */
export const metadata: Metadata = {
  title: 'Get in touch',
  // A form embedded in somebody's page has no business in search results.
  robots: { index: false, follow: false },
}

/** The shape `sites.slug` holds — the same one the submit schema enforces. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/

export default async function EmbedLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string | string[]; src?: string | string[] }>
}) {
  const params = await searchParams
  const rawSite = Array.isArray(params.site) ? params.site[0] : params.site
  const slug = typeof rawSite === 'string' && SLUG.test(rawSite.trim()) ? rawSite.trim() : null

  const rawSrc = Array.isArray(params.src) ? params.src[0] : params.src
  const source = typeof rawSrc === 'string' && rawSrc.trim() !== '' ? rawSrc.trim().slice(0, 200) : null

  // Read directly rather than through the env schema: Next inlines
  // NEXT_PUBLIC_* by literal text substitution at build time, and routing it
  // through a computed accessor makes the inliner miss it (see lib/env.ts).
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  return (
    <main className="mx-auto w-full max-w-[440px] p-4">
      <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">Get in touch</h1>
      <p className="mt-[2px] mb-4 text-[13px] text-muted">
        Leave your details and they will come back to you.
      </p>

      {slug === null ? (
        // The embed code is wrong, and saying so plainly is better than a form
        // that takes an enquiry nothing can deliver.
        <p role="alert" className="rounded-input bg-warn-bg px-3 py-2 text-[13px] text-warn">
          This form is missing the site it belongs to, so it cannot take enquiries yet.
        </p>
      ) : (
        <LeadForm siteSlug={slug} siteKey={siteKey} source={source} />
      )}
    </main>
  )
}
