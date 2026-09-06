import {
  DORMANT_STATES,
  brainMapLayout,
  mapAriaLabel,
  mapLevel,
  statesOf,
} from '@/lib/brand/brain-map'
import { readBrain } from '@/lib/brand/read-brain'

import { BrainMap } from './brain-map'
import { PopNumber } from './pop-number'

/**
 * The compact Brand Brain in the tab header, on every brain screen.
 *
 * The answers happen on Identity, Voice and the console, and the overview's big
 * picture is not on those screens. This is the one that watches: the layout
 * re-renders after every confirm (each write revalidates the layout), so the
 * node for the field just confirmed lights here, beside the tabs, wherever the
 * press happened. The read is the same cached `readBrain` the page uses.
 */
export async function BrainMapFrame() {
  const brain = await readBrain()
  if (brain.status === 'no-workspace' || brain.status === 'unreadable') return null

  const dormant = brain.status === 'no-brain'
  const states = dormant ? DORMANT_STATES : statesOf(brain.provenance)
  const level = mapLevel(states)

  return (
    <div
      data-guide="brain.map"
      className="flex items-center gap-3 max-narrow:w-full"
      aria-label="Brand Brain level"
    >
      <BrainMap
        variant="compact"
        layout={brainMapLayout()}
        level={level}
        ariaLabel={mapAriaLabel(level, dormant)}
        states={states}
        dormant={dormant}
        className="w-44 max-narrow:w-32"
      />
      <div className="min-w-0">
        <p className="type-eyebrow text-muted">Brain level</p>
        {dormant ? (
          <p className="type-h2 text-muted">Not built yet</p>
        ) : (
          <p className="type-h2 flex items-baseline gap-icon-gap text-ink">
            <PopNumber value={level.confirmed} />
            <span className="type-sm num text-muted">of {level.total}</span>
          </p>
        )}
        {!dormant && level.intake > 0 ? (
          <p className="type-meta text-muted">
            <span className="num">{level.intake}</span> from your answers
          </p>
        ) : null}
      </div>
    </div>
  )
}
