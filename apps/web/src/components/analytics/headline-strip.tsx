import { absenceSentence, changeSentence, type Headline } from '@/lib/analytics/headline'
import { cn } from '@/lib/utils'

/**
 * THE FOUR NUMBERS AT THE TOP. See `headline.ts` for why only two of them are
 * ever real readings and why the other two still render as cards rather than
 * disappearing.
 *
 * ── DIRECTION NEVER RESTS ON COLOUR ALONE ────────────────────────────────────
 * `changeSentence` already spells "Up"/"Down" in words. The colour on top of it
 * is a signal for a sighted reader who scans fast, not the only channel a
 * colour-blind or screen-reader user has.
 */
export function HeadlineStrip({
  headlines,
  windowLabel,
}: {
  headlines: readonly Headline[]
  windowLabel: string
}) {
  return (
    <div className="grid grid-cols-4 gap-grid max-wide:grid-cols-2">
      {headlines.map((headline) => (
        <HeadlineCard key={headline.id} headline={headline} windowLabel={windowLabel} />
      ))}
    </div>
  )
}

function HeadlineCard({ headline, windowLabel }: { headline: Headline; windowLabel: string }) {
  const change = changeSentence(headline.change, windowLabel)
  // `from-none` is a rise even though there is no percentage behind it, so it
  // gets the same treatment a measured rise does. Every other kind is a refusal
  // to compare, and a refusal is neutral.
  const direction =
    headline.change.kind === 'compared'
      ? headline.change.direction
      : headline.change.kind === 'from-none'
        ? ('up' as const)
        : null

  return (
    <div className="surface-ring rounded-card bg-surface p-5">
      <p className="type-eyebrow text-muted" title={headline.meaning}>
        {headline.label}
      </p>
      <p className="mt-3 min-h-[44px] type-hero-num text-ink">
        {headline.value !== null ? (
          <span className="tabular-nums">{headline.value.toLocaleString('en-IN')}</span>
        ) : (
          <span className="type-h3 text-muted">
            {absenceSentence(headline.absence ?? 'waiting')}
          </span>
        )}
      </p>
      <p className="mt-1 type-meta text-muted">{headline.caveat}</p>
      {/* ── COLOUR IS A SECOND SIGNAL, NEVER THE ONLY ONE ─────────────────
          `changeSentence` already writes the word "Up" or "Down", so a reader
          who cannot separate these two hues loses nothing. `--ok` and
          `--danger` are the design system's own pair and both are used
          elsewhere for exactly this; a direction left neutral would have been
          the one case where the colour said nothing at all. */}
      <p
        className={cn(
          'mt-1 type-meta',
          direction === 'down' ? 'text-danger' : direction === 'up' ? 'text-ok' : 'text-muted',
        )}
      >
        {change}
      </p>
    </div>
  )
}
