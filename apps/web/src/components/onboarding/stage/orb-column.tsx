'use client'

import { forwardRef } from 'react'

export interface OrbColumnProps {
  /** The receipt under the orb: what was just absorbed, and how many are held. */
  caption: { label: string; count: number } | null
}

/**
 * The orb's column.
 *
 * The <canvas> is rendered here ONCE and is MOVED into the build screen rather
 * than a second one being mounted there. That is the point of the object: the
 * thing that collapses into a Brand Brain is literally the thing you grew, with
 * every particle it accumulated still on it. Two canvases would be two orbs, and
 * the second would start empty.
 *
 * Because the node is moved imperatively, React must never re-render its
 * children — hence the empty wrapper and the forwarded refs.
 */
export const OrbColumn = forwardRef<HTMLDivElement, OrbColumnProps>(function OrbColumn(
  { caption },
  ref,
) {
  return (
    <div className="orbwrap" id="orbwrap" ref={ref}>
      <div className={`orbcap ${caption ? 'on' : ''}`} id="orbcap">
        <i />
        <b id="orbcap-t">{caption?.label ?? 'Brand name'}</b>
        <span id="orbcap-n">
          {caption?.count ?? 0} {caption?.count === 1 ? 'signal' : 'signals'}
        </span>
      </div>
    </div>
  )
})
