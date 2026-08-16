import type { Metadata } from 'next'

import { BetaForm } from '@/components/embed/beta-form'

/**
 * `/embed/beta` — the public, frame-able early-access form (doc 13 §5).
 *
 * The only route in this application any origin may frame; middleware sets
 * `frame-ancestors *` here and `'none'` everywhere else. No app chrome, no rail,
 * no links away: it renders inside somebody else's landing page and should look
 * like part of it rather than like a visit to ours.
 *
 * `?src=` identifies which page converted. It is read here, on the server, and
 * passed down rather than being read from `window.location` — the value ends up
 * in the database, so it should come from the request the server actually saw.
 */
export const metadata: Metadata = {
  title: 'Request early access',
  // A form embedded in a partner page has no business in search results.
  robots: { index: false, follow: false },
}

export default async function EmbedBetaPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.src) ? params.src[0] : params.src
  const source = typeof raw === 'string' && raw.trim() !== '' ? raw.trim().slice(0, 200) : null

  // Read directly rather than through the env schema: Next inlines
  // NEXT_PUBLIC_* by literal text substitution at build time, and routing it
  // through a computed accessor makes the inliner miss it (see lib/env.ts).
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  return (
    <main className="mx-auto w-full max-w-[440px] p-4">
      {/* The kit's `.sl-page-title` / `.sl-page-sub`: 20px at 650 with -0.02em,
          then 13px muted. 650 rather than extrabold is the whole point of
          loading Inter on its variable axis — see layout.tsx. */}
      <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">Request early access</h1>
      <p className="mt-[2px] mb-4 text-[13px] text-muted">
        Tell us where to reach you and we&apos;ll be in touch.
      </p>

      <BetaForm siteKey={siteKey} source={source} />
    </main>
  )
}
