import { ImageIcon } from 'lucide-react'
import Link from 'next/link'

import { CardEmpty } from '@/components/empty-state'
import {
  describeBuiltFrom,
  describeCount,
  describeFormat,
  describePicture,
  describeStatus,
  describeStranded,
} from '@/lib/studio/card-copy'
import type { GenerationsRead } from '@/lib/studio/read'

/**
 * WHAT THIS WORKSPACE HAS MADE, AND WHAT EACH PICTURE WAS BUILT FROM.
 *
 * ── THE PICTURE IS THE POINT ────────────────────────────────────────────────
 * Somebody spends credits here. Showing them a line of text afterwards and
 * asking them to go and find the file is not a delivered feature, it is a
 * receipt. So the picture is on this screen, at a size you can judge it at, with
 * a link to the library beside it.
 *
 * ── THE PROVENANCE IS ON THE SCREEN, NOT ONLY IN THE DATABASE ───────────────
 * A person must be able to ask "why does this look like this" and get an answer.
 * Every card says what conditioned it and how sure Sahoda was, in the product's
 * own two words: confirmed and guessed.
 *
 * ── FOUR NOTHINGS, KEPT APART ───────────────────────────────────────────────
 * No workspace, a failed read, nothing made yet, and a list. Only the third has
 * "make your first picture" as a remedy, and offering it to somebody whose read
 * just failed would be an instruction that cannot work.
 */
export function RecentGenerations({ read }: { read: GenerationsRead }) {
  // Read ONCE for the whole list, so two cards a millisecond apart cannot
  // disagree about whether the same age has passed.
  const now = Date.now()

  if (read.status === 'no-workspace') return null

  if (read.status === 'unreadable') {
    return (
      <section aria-labelledby="studio-recent" className="flex flex-col gap-3">
        <h2 id="studio-recent" className="type-h2">
          What you have made
        </h2>
        <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
          Sahoda could not read your pictures just now. They are not lost, and nothing was charged.
          This is a problem at our end rather than yours.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="studio-recent" className="flex flex-col gap-3">
      <h2 id="studio-recent" className="type-h2">
        What you have made
      </h2>

      {read.cards.length === 0 ? (
        <CardEmpty
          lead={<ImageIcon className="size-[18px]" aria-hidden />}
          body="Nothing yet. Describe a picture above and Sahoda will draw it."
        />
      ) : (
        <ul className="grid gap-3 wide:grid-cols-3 max-wide:grid-cols-1">
          {read.cards.map(({ generation, pictures }) => {
            // Counted from the rows themselves, never from the request. A card
            // that reported what was ASKED for as what arrived would be a figure
            // no query produced, which is the defect this product names by name.
            const arrived = pictures.filter((one) => one.assetId !== null).length
            const howMany = describeCount({ made: arrived, asked: generation.requested_count })
            // The row is written BEFORE the model is called so a Back press does
            // not lose the request. The cost is a row left running when the
            // process died, and nothing else settles it.
            const stranded = describeStranded({
              status: generation.status,
              startedAt: generation.started_at,
              createdAt: generation.created_at,
              now,
            })
            return (
              <li
                key={generation.id}
                className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-3"
              >
                {pictures.map((picture) => {
                  const said = describePicture({
                    status: generation.status,
                    hasAsset: picture.assetId !== null,
                    hasUrl: picture.url !== null,
                  })
                  return (
                    <div key={picture.imageId} className="flex flex-col gap-1">
                      {picture.url === null ? null : (
                        // eslint-disable-next-line @next/next/no-img-element -- a
                        // short-lived signed URL from a private bucket cannot be
                        // optimised by next/image without proxying the credential.
                        <img
                          src={picture.url}
                          alt={generation.prompt_given}
                          width={picture.width ?? undefined}
                          height={picture.height ?? undefined}
                          className="surface-ring w-full rounded-card bg-s2"
                        />
                      )}
                      {said === null ? null : <span className="type-sm text-muted">{said}</span>}
                    </div>
                  )
                })}

                <span className="type-body font-[550]">{generation.prompt_given}</span>

                <span className="type-sm text-muted">
                  {describeStatus(generation.status)}
                  {generation.format_id === null ? null : ` · ${generation.format_id}`}
                </span>

                <span className="type-sm text-muted">
                  {describeBuiltFrom(generation.brand_signals)}
                </span>

                {howMany === null ? null : <span className="type-sm text-muted">{howMany}</span>}

                {generation.status !== 'ready' ? null : (
                  <Link
                    href="/assets"
                    className="type-sm text-muted underline transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    Open your library
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {read.unreadable === 0 ? null : (
        <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
          <span className="num">{read.unreadable}</span> of your requests could not be read. They
          are not lost, and nothing about them was changed.
        </p>
      )}
    </section>
  )
}
