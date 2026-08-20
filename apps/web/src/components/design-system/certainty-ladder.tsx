import { StatusBadge } from '@/components/posts/status-badge'
import type { PostStatus } from '@sahoda/shared'

/**
 * The four certainty rungs, and the ten post statuses that ride on them.
 *
 * Rendered from the REAL `StatusBadge`, not from a swatch, so the page cannot
 * claim a treatment the app does not actually paint.
 */

const RUNGS: ReadonlyArray<{ cls: string; name: string; means: string; signature: string }> = [
  {
    cls: 'is-real',
    name: 'Real',
    means: 'It happened. A platform has it.',
    signature: 'solid fill, no edge',
  },
  {
    cls: 'is-committed',
    name: 'Committed',
    means: 'It will happen. Someone decided.',
    signature: 'tint + hairline edge',
  },
  {
    cls: 'is-proposed',
    name: 'Proposed',
    means: 'Sahoda suggests it. Nobody has agreed.',
    signature: 'dashed edge',
  },
  {
    cls: 'is-simulated',
    name: 'Simulated',
    means: 'Not real. A fixture, never a platform.',
    signature: 'diagonal hatch + a word',
  },
]

/** Every status, so a collision would be visible on this page rather than in production. */
const STATUSES: readonly PostStatus[] = [
  'idea',
  'draft',
  'review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'partial',
  'failed',
  'expired',
]

export function CertaintyLadder() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2 narrow:grid-cols-2 wide:grid-cols-4">
        {RUNGS.map((rung) => (
          <div key={rung.cls} className="rounded-card border border-line-soft p-3">
            <span
              className={`${rung.cls} inline-flex items-center rounded-pill px-2.5 py-[3px] text-[12px] leading-[18px] font-semibold`}
            >
              {rung.name}
            </span>
            <p className="type-sm mt-2 text-ink">{rung.means}</p>
            <p className="type-sm mt-0.5 text-muted">{rung.signature}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="type-eyebrow mb-2 text-muted">Every post status</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusBadge key={s} intent={s} outcome="none" />
          ))}
        </div>
        <p className="type-sm mt-3 max-w-[70ch] text-muted">
          Certainty sets the fill and the edge; the glyph says what happens next. Both are
          structural, which is why <strong className="font-semibold text-ink">Approved</strong>,{' '}
          <strong className="font-semibold text-ink">Scheduled</strong> and{' '}
          <strong className="font-semibold text-ink">Published</strong> stay apart even though all
          three sit on the same rung — evidence, not intent, is what earns{' '}
          <code className="rounded-sm bg-s2 px-1">.is-real</code>.
        </p>
      </div>
    </div>
  )
}
