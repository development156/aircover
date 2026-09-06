import { formatStorageBytes, WORKSPACE_STORAGE_LIMIT_LABEL } from '@sahoda/shared'

import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import type { StorageUsage } from '@/lib/storage/usage'

/**
 * What this workspace is holding, against the 1 GB it may hold.
 *
 * ── A BAR IS A CLAIM, SO IT IS DRAWN ONLY WHEN THERE IS A MEASUREMENT ────────
 * Three of the four answers from `readStorageUsage` are not numbers, and none of
 * them draws a meter. An empty bar for a failed read tells somebody their library
 * is empty — a statement about THEIR files, made on no evidence. `YourDataPanel`
 * on this same page refuses a fake progress bar for the same reason, in its own
 * words: it "would be lying about something the person is watching".
 *
 * ── THE TRASH SENTENCE IS NOT A FOOTNOTE ─────────────────────────────────────
 * Trashing an asset writes `deleted_at` and removes no bytes. So a person who
 * "deleted" 400 MB and sees this number unmoved will read the meter as broken,
 * and they would be reasoning correctly from what the screen told them. The
 * hint says it before they can be surprised by it.
 */
export function StoragePanel({ usage }: { usage: StorageUsage }) {
  return (
    <SettingCard
      title="Storage"
      hint={`Every workspace can hold ${WORKSPACE_STORAGE_LIMIT_LABEL} of photos and documents. Files in the trash still take up space until they are deleted for good.`}
      data-guide="settings-storage"
    >
      <SettingRow label="Used" hint={panelHint(usage)}>
        {usage.kind === 'ok' ? (
          <span className="type-sm num text-ink">
            {formatStorageBytes(usage.state.usedBytes)} of {WORKSPACE_STORAGE_LIMIT_LABEL}
          </span>
        ) : (
          <span className="type-sm text-muted">{'—'}</span>
        )}
      </SettingRow>

      {usage.kind === 'ok' ? <Meter usage={usage} /> : null}
    </SettingCard>
  )
}

/**
 * The four sentences, and they are four because the claims are four.
 *
 * "We could not read this" and "you have used nothing" would be the same empty
 * bar and are opposite statements. `not_deployed` is separated from `read_failed`
 * because only one of them is something anybody can act on, and neither is the
 * customer's problem to solve.
 */
function panelHint(usage: StorageUsage): string {
  switch (usage.kind) {
    case 'ok':
      if (usage.state.full) {
        return 'This workspace is full. Delete some files for good to make room, including anything in the trash.'
      }
      if (usage.state.nearlyFull) {
        return `${formatStorageBytes(usage.state.remainingBytes)} left. Deleting files for good is what frees space.`
      }
      return `${formatStorageBytes(usage.state.remainingBytes)} left.`
    case 'no_workspace':
      return 'Create a workspace to store photos and documents.'
    case 'not_deployed':
      return 'Sahoda cannot show this figure yet. Nothing is wrong with your files, and uploading still works.'
    case 'read_failed':
      return 'Sahoda could not read how much space this workspace is using. This is not a reading of your library. Try again in a moment.'
  }
}

/**
 * The bar itself.
 *
 * `role="img"` with a label rather than a `progressbar` role: nothing here is in
 * progress. A screen reader gets the same sentence the sighted reader gets from
 * the figure above, so neither is told less than the other.
 *
 * The fill carries a `surface-ring` because `--surface-2` and `--surface` sit
 * 1.04:1 apart in dark and a track with no edge separates nothing (apps/web
 * CLAUDE.md). At zero the fill is not rendered at all — a sliver of colour would
 * read as "a little used" when the truth is none.
 */
function Meter({ usage }: { usage: Extract<StorageUsage, { kind: 'ok' }> }) {
  const percent = Math.round(usage.state.fraction * 100)
  // `bg-danger` / `bg-warn` / `bg-accent` — the solid tokens, not the `-bg` tints,
  // which are backgrounds for text and would leave the fill nearly invisible
  // against the track.
  const tone = usage.state.full ? 'bg-danger' : usage.state.nearlyFull ? 'bg-warn' : 'bg-accent'

  return (
    <div className="pb-3">
      <div
        role="img"
        aria-label={`${formatStorageBytes(usage.state.usedBytes)} of ${WORKSPACE_STORAGE_LIMIT_LABEL} used, ${percent}%`}
        className="surface-ring h-2 w-full overflow-hidden rounded-full bg-s2"
      >
        {percent > 0 ? (
          <div
            className={`h-full rounded-full transition-micro ${tone}`}
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        ) : null}
      </div>
      <p className="type-meta mt-1.5 num text-muted">{percent}% used</p>
    </div>
  )
}
