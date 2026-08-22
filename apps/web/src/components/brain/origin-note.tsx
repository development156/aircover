import { brainOrigin, NO_PER_FIELD_EVIDENCE } from '@/lib/brand/brain-origin'
import { cn } from '@/lib/utils'

/**
 * Where this brain came from, and what Sahoda cannot tell you about it.
 *
 * Two claims, and the second is the reason this component exists rather than a
 * line of text in the page:
 *
 *   1. The BRAIN-level origin, read from `brand_memory.source` — a real stored
 *      column, not a derivation. `resolved`, `manual`, `system`, or nothing
 *      recorded.
 *   2. That there is no FIELD-level evidence, stated outright. A console that
 *      shows a guess and stays silent about where it came from invites the
 *      reader to assume there IS a source and that it simply is not shown.
 *      There is not one. `lib/brand/brain-origin.ts` explains why it cannot be
 *      manufactured.
 */
export function OriginNote({
  source,
  version,
  appliedFromLearning = false,
}: {
  source: string | null
  version: number
  /**
   * See `brain-origin.ts`. Without it a person who accepted a learning is told
   * their whole brand is a fabricated sample, because the accept RPC and the
   * model-unreachable fallback both store `source = 'system'`.
   */
  appliedFromLearning?: boolean
}) {
  const origin = brainOrigin(source, { appliedFromLearning })

  return (
    <section
      // A sample brain is the one state a person must not read past, so it gets
      // the assertive treatment and an alert role. The other three are context,
      // not a warning, and are announced as such.
      role={origin.isSample ? 'alert' : undefined}
      aria-labelledby="console-origin"
      className={cn(
        'rounded-card px-4 py-4',
        origin.isSample ? 'border border-danger bg-danger-bg' : 'surface-ring bg-surface',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id="console-origin"
          className={cn('type-h3', origin.isSample ? 'text-danger' : 'text-ink')}
        >
          {origin.label}
        </h2>
        <p className="type-sm text-muted">
          Version <span className="num">{version}</span>
        </p>
      </div>

      <p className={cn('mt-1 type-body', origin.isSample ? 'text-ink' : 'text-muted')}>
        {origin.line}
      </p>

      <p className="mt-2 type-sm text-muted">{NO_PER_FIELD_EVIDENCE}</p>
    </section>
  )
}
