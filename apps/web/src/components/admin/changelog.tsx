import { ChangelogRail } from '@/components/admin/changelog-rail'
import { readChangelog } from '@/lib/ops/read'

/** D2 · Changelog, server half — reads, then hands entries to the client rail. */
export async function Changelog() {
  const entries = await readChangelog()

  if (entries.status !== 'ok') {
    return (
      // The region around this supplies the card and the heading.
      <section aria-label="Changelog entries">
        <p className="text-[13px] text-muted">
          We couldn&apos;t read the changelog just now. The entries are safe. This is our read
          failing. Reload to try again.
        </p>
        {entries.eventId ? (
          <p className="mt-2 font-mono text-[11px] text-faint">Reference {entries.eventId}</p>
        ) : null}
      </section>
    )
  }

  return <ChangelogRail entries={entries.data} />
}
