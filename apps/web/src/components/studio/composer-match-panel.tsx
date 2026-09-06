import { ReferenceUpload } from '@/components/studio/reference-upload'
import type { ModeRule } from '@/lib/studio/modes'
import type { LibraryRead } from '@/lib/studio/read'

/**
 * WHICH PICTURE, IF ANY, SAHODA MATCHES.
 *
 * Split out of `composer-panels.tsx` to keep that file under the house limit.
 * Left untouched by the drawer redesign: the legend's own sentence already
 * names exactly one fact (what picking a picture here will do, or that none
 * is required), the empty/unreadable/no-workspace states are status
 * sentences rather than settings reasoning, and nothing here was the "wordy
 * detailed options" the founder's ruling was about.
 */
export function ComposerMatchPanel({
  rule,
  library,
  picked,
  onToggleReference,
  onAddReference,
}: {
  rule: ModeRule
  library: LibraryRead
  picked: string[]
  onToggleReference: (assetId: string) => void
  onAddReference: (assetId: string) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2" data-guide="studio-references">
      <legend className="type-sm text-muted">
        {rule.maxReferences === 0
          ? 'Picking a picture here moves you to Match a picture.'
          : rule.minReferences > 0
            ? 'Which picture should Sahoda match?'
            : 'Anything Sahoda should match? (optional)'}
      </legend>

      <ReferenceUpload
        disabled={rule.maxReferences > 0 && picked.length >= rule.maxReferences}
        onAdded={onAddReference}
      />

      {library.status === 'unreadable' ? (
        <p role="status" className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
          Sahoda could not read your pictures just now. You can still add one from this device, or
          make one below.
        </p>
      ) : library.status === 'no-workspace' ? (
        <p role="status" className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
          There is no workspace to read pictures from, so there is nothing here to match.
        </p>
      ) : library.pictures.length === 0 ? (
        <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
          You have no pictures yet. Add one from this device, or make one below, and it appears here
          to match.
        </p>
      ) : (
        <ul className="grid grid-cols-6 gap-1.5">
          {library.pictures.map((picture) => {
            const at = picked.indexOf(picture.assetId)
            const on = at !== -1
            return (
              <li key={picture.assetId}>
                <button
                  type="button"
                  onClick={() => onToggleReference(picture.assetId)}
                  aria-pressed={on}
                  aria-label={
                    on
                      ? `${picture.title ?? 'A picture in your library'}, picked ${at + 1} of ${picked.length}`
                      : (picture.title ?? 'A picture in your library')
                  }
                  className={`surface-ring relative block w-full overflow-hidden rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    on ? 'ring-2 ring-accent' : ''
                  }`}
                >
                  {picture.url === null ? (
                    <span className="flex aspect-square items-center justify-center bg-s2 type-sm text-muted">
                      no preview
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- a
                    // short-lived signed URL from a private bucket cannot be
                    // optimised without proxying the credential.
                    <img
                      src={picture.url}
                      alt={picture.title ?? 'A picture in your library'}
                      className="aspect-square w-full object-cover object-top"
                    />
                  )}
                  {on ? (
                    <span className="absolute right-1 top-1 flex size-[18px] items-center justify-center rounded-full bg-primary type-sm text-primary-foreground">
                      <span className="num">{at + 1}</span>
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
