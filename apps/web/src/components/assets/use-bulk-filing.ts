'use client'

import { useState, useTransition } from 'react'

import { fileAssets, unfileAssets } from '@/app/actions/asset-folder-items'
import type { AssetCard } from '@/lib/assets/view'

/**
 * FILING AND UNFILING, WITH UNDO INSTEAD OF A CONFIRM STEP.
 *
 * Both are reversible, so neither asks first: it acts, and offers the exact
 * inverse. The numbers are always the server action's real return
 * (`added` / `alreadyThere` / `removed`), never the size of the selection:
 * filing nine photos where two were already there reads "Filed 7. 2 were
 * already there.", not "Filed 9."
 *
 * ── WHY THIS RETURNS AN OUTCOME INSTEAD OF RAISING A TOAST ───────────────────
 * It used `sonner`. MEASURED: that import cost **33.1 kB** on this route and put
 * `/assets` 42.7 kB over its JavaScript budget, on the change whose whole purpose
 * was to make the screen simpler. The layout mounts a `Toaster`, which is why
 * this looked free and was not: Next splits the layout's chunk from the page's,
 * so importing `toast` in a page component pulls the library into the page graph.
 * Two builds, one variable: 855.5 kB with it, 822.4 kB without.
 *
 * So the outcome is returned as state and the bulk bar renders it. That is
 * lighter, and it is also better placed: the sentence appears in the control the
 * person just used rather than floating in a corner of the screen.
 *
 * ── AND IT DOES NOT AUTO-DISMISS ─────────────────────────────────────────────
 * The blueprint says an undo toast for about ten seconds. This keeps the message
 * until the next action or an explicit dismiss, deliberately: a timer that
 * removes an Undo button while somebody is reaching for it is worse than one
 * more line on screen, and the blueprint's own principle is "fail loudly, recover
 * quietly" — a failure that vanishes on its own is neither.
 */

/**
 * What just happened, and how to reverse it.
 *
 * `undo` is absent when there is nothing to reverse: a failure, or a file that
 * added nothing because every photo was already in that folder. Offering Undo
 * there would be a control that does nothing, which the delete gate's own notes
 * call out as worse than no control.
 */
export interface BulkOutcome {
  tone: 'ok' | 'error'
  message: string
  undo?: () => void
}

export interface BulkFiling {
  pending: boolean
  outcome: BulkOutcome | null
  fileInto: (folderId: string, folderName: string, ids: readonly string[]) => void
  removeFromFolder: (folderId: string, folderName: string, ids: readonly string[]) => void
  dismiss: () => void
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

export function useBulkFiling(cards: readonly AssetCard[], onDone: () => void): BulkFiling {
  const [pending, startBulk] = useTransition()
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)

  function fileInto(folderId: string, folderName: string, ids: readonly string[]) {
    // Computed BEFORE the call, from the cards already on screen: which of the
    // selected files were already in this folder. Undo must not remove those,
    // because it is putting things back, not repeating the selection in reverse.
    const alreadyThereIds = new Set(
      ids.filter((id) => cards.find((card) => card.id === id)?.folderIds?.includes(folderId)),
    )
    const newlyAdded = ids.filter((id) => !alreadyThereIds.has(id))

    setOutcome(null)
    startBulk(async () => {
      const result = await fileAssets(folderId, [...ids])
      if (!result.ok) {
        setOutcome({ tone: 'error', message: result.message })
        return
      }

      const suffix =
        result.alreadyThere > 0
          ? ` ${result.alreadyThere} ${plural(result.alreadyThere, 'was', 'were')} already there.`
          : ''
      const message = `Filed ${result.added} to ${folderName}.${suffix}`

      setOutcome({
        tone: 'ok',
        message,
        // No Undo when nothing was added: every photo was already filed here, so
        // there is nothing to put back and a button that removes them would be
        // doing the opposite of undoing.
        undo:
          result.added > 0
            ? () => {
                setOutcome(null)
                startBulk(async () => {
                  const undone = await unfileAssets(folderId, newlyAdded)
                  setOutcome(
                    undone.ok
                      ? {
                          tone: 'ok',
                          message: `Put back ${undone.removed} ${plural(undone.removed, 'photo', 'photos')}. Nothing was deleted.`,
                        }
                      : { tone: 'error', message: undone.message },
                  )
                })
              }
            : undefined,
      })
      onDone()
    })
  }

  function removeFromFolder(folderId: string, folderName: string, ids: readonly string[]) {
    setOutcome(null)
    startBulk(async () => {
      const result = await unfileAssets(folderId, [...ids])
      if (!result.ok) {
        setOutcome({ tone: 'error', message: result.message })
        return
      }

      setOutcome({
        tone: 'ok',
        // "Filing" is the word for the row that was removed, and the sentence
        // says outright that no photo was deleted. "Remove" next to a picture
        // reads as destructive, and on this path nothing destructive happens.
        message: `Took ${result.removed} out of ${folderName}. ${plural(result.removed, 'The photo is', 'The photos are')} still in your library.`,
        undo:
          result.removed > 0
            ? () => {
                setOutcome(null)
                startBulk(async () => {
                  const redone = await fileAssets(folderId, [...ids])
                  setOutcome(
                    redone.ok
                      ? { tone: 'ok', message: `Filed ${redone.added} back into ${folderName}.` }
                      : { tone: 'error', message: redone.message },
                  )
                })
              }
            : undefined,
      })
      onDone()
    })
  }

  return { pending, outcome, fileInto, removeFromFolder, dismiss: () => setOutcome(null) }
}
