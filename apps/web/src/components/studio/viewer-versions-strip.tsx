import Link from 'next/link'
import type { Route } from 'next'

import type { ViewerVersions } from '@/lib/studio/viewer-read'

/**
 * EVERY VERSION OF THIS PICTURE, AND ONLY WHEN THERE GENUINELY ARE SOME.
 *
 * `versions` is null both when the workspace's deploy cannot record lineage at
 * all (the migration is unapplied) and when it can but this picture simply
 * has none — a press that was never remixed and was never remixed FROM. Both
 * are "nothing to group", and a strip of one tile would be a control that
 * shows a fact nobody asked: it is silent either way, never a lie of the
 * shape "here is a group" over a group of one.
 */
export function ViewerVersionsStrip({ versions }: { versions: ViewerVersions }) {
  if (versions === null) return null

  return (
    <div className="flex flex-col items-center gap-2 pb-6">
      <span className="type-eyebrow text-muted">
        Versions of this one · <span className="num">{versions.total}</span> total
      </span>
      <ul className="flex gap-2.5">
        {versions.entries.map((entry) => (
          <li key={entry.picture.imageId} className="relative">
            <Link
              href={`/studio/${entry.picture.imageId}` as Route}
              aria-label={
                entry.current
                  ? `${entry.picture.prompt}, the version you are looking at`
                  : entry.picture.prompt
              }
              aria-current={entry.current ? 'page' : undefined}
              className="surface-ring block size-[68px] overflow-hidden rounded-sm transition-micro hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a
                  short-lived signed URL from a private bucket cannot be
                  optimised by next/image without proxying the credential. */}
              <img
                src={entry.picture.stampedUrl ?? entry.picture.url}
                alt=""
                className="size-full object-cover object-top"
              />
            </Link>
            {entry.current ? (
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-[11px] shadow-[0_0_0_2px_var(--acc)]"
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
