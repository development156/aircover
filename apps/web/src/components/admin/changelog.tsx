import { ChangelogRail } from '@/components/admin/changelog-rail'
import { readChangelog } from '@/lib/ops/read'

/** D2 · Changelog, server half — reads, then hands entries to the client rail. */
export async function Changelog() {
  const entries = await readChangelog()

  if (entries.status !== 'ok') {
    return (
      <section
        aria-labelledby="changelog-heading"
        className="rounded-card border border-line bg-bg p-4 shadow-card"
      >
        <h2 id="changelog-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Changelog
        </h2>
        <p className="mt-2 text-[13px] text-muted">
          We couldn&apos;t read the changelog just now. The entries are safe — this is our read
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
