'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { isLockedSite, nameOfPost, reasonForLock } from '@sahoda/shared'
import type { AssetUsageSite } from '@sahoda/shared'

/**
 * Where a file is used, named.
 *
 * ── THIS LIST IS THE DELETE GATE'S EVIDENCE ──────────────────────────────────
 * A refusal that says "this file is in use" and stops there leaves the person
 * with no way to act on it. So every post is named, by TITLE, and linked — the
 * remedy for "you cannot delete this" is "go to that post and take it off", and
 * the link is that remedy.
 *
 * An untitled post is described as untitled. It is never given its id: an id is
 * not a name, and a reader cannot recognise one.
 *
 * ── WHY THE LOCK IS A GLYPH AND A WORD, NOT A COLOUR ─────────────────────────
 * There is no red in this palette (docs/26 §1.6). A locked row is separated by a
 * padlock and by the reason spelled out, both of which survive greyscale, a
 * colour-blind reader and a photocopy.
 */
export function UsageList({ sites }: { sites: readonly AssetUsageSite[] }) {
  if (sites.length === 0) {
    return (
      <p className="rounded-input border border-line bg-s1 px-3 py-2.5 text-left text-[12.5px] text-muted">
        No post uses this file. Deleting it changes nothing else.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5 text-left">
      {sites.map((site) => {
        const locked = isLockedSite(site)
        return (
          <li key={site.postId}>
            <Link
              href={{ pathname: `/posts/${site.postId}` }}
              className="flex items-start gap-2 rounded-input border border-line bg-s1 px-3 py-2.5 transition-micro hover:bg-s2 max-narrow:min-h-[44px]"
            >
              {locked ? (
                <Lock
                  size={13}
                  strokeWidth={1.9}
                  className="mt-[3px] shrink-0 text-ink"
                  aria-hidden
                />
              ) : null}
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-[550] text-ink">
                  {nameOfPost(site)}
                </span>
                <span className="block text-[12px] text-muted">
                  {locked ? reasonForLock(site) : 'still being written'}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
