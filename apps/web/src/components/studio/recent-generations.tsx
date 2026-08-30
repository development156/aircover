import { ImageIcon } from 'lucide-react'

import { CardEmpty } from '@/components/empty-state'
import { countCertainty } from '@sahoda/shared'
import type { GenerationsRead } from '@/lib/studio/read'

/**
 * WHAT THIS WORKSPACE HAS ASKED FOR, AND WHAT EACH ONE WAS BUILT FROM.
 *
 * ── THE PROVENANCE IS ON THE SCREEN, NOT ONLY IN THE DATABASE ───────────────
 * A person must be able to ask "why does this look like this" and get an answer.
 * So every request shows what conditioned it and how sure Sahoda was of each
 * part, in the product's own two words: confirmed and guessed.
 *
 * ── FOUR NOTHINGS, KEPT APART ───────────────────────────────────────────────
 * No workspace, a failed read, nothing made yet, and a list. Only the third has
 * "make your first picture" as a remedy, and offering it to somebody whose read
 * just failed would be an instruction that cannot work.
 */
export function RecentGenerations({ read }: { read: GenerationsRead }) {
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

      {read.generations.length === 0 ? (
        <CardEmpty
          lead={<ImageIcon className="size-[18px]" aria-hidden />}
          body="Nothing yet. Describe a picture above and Sahoda will draw it."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {read.generations.map((generation) => {
            const signals = generation.brand_signals
            const counted = signals === null ? null : countCertainty(signals)
            return (
              <li
                key={generation.id}
                className="surface-ring flex flex-col gap-1 rounded-card bg-surface px-3 py-2"
              >
                <span className="type-body font-[550]">{generation.prompt_given}</span>
                <span className="type-sm text-muted">
                  {generation.format_id ?? 'size not recorded'}
                  {' · '}
                  {generation.status === 'ready'
                    ? 'ready'
                    : generation.status === 'failed'
                      ? 'did not work, and nothing was charged'
                      : generation.status === 'cancelled'
                        ? 'stopped'
                        : 'still being drawn'}
                </span>
                {/* Null and empty are different claims and are said differently.
                    Null means conditioning never ran; empty means it ran and
                    used nothing, which is exactly right for Explore. */}
                <span className="type-sm text-muted">
                  {counted === null
                    ? 'Built from your words alone.'
                    : counted.confirmed + counted.inferred === 0
                      ? 'Built from your words alone, on purpose.'
                      : `Built from ${counted.confirmed} confirmed and ${counted.inferred} guessed thing${
                          counted.inferred === 1 ? '' : 's'
                        } about your brand.`}
                </span>
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
