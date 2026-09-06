'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * PLAIN DATA ONLY, and that is a budget decision. The first cut imported the
 * field registry, the provenance module and through it `@sahoda/shared`; the
 * js-budget guard refused the build (+8.2 kB on the brain layout). The server
 * computes the geometry, the counts and the spoken label from
 * `lib/brand/brain-map.ts`; this file draws and pulses, nothing else.
 */
export type MapFieldState = 'confirmed' | 'guessed' | 'intake'
export type MapStates = Readonly<Record<string, MapFieldState>>
export interface MapPoint {
  x: number
  y: number
}
export interface MapHubData extends MapPoint {
  section: string
  title: string
}
export interface MapNodeData extends MapPoint {
  path: string
  label: string
  section: string
}
export interface MapLayoutData {
  width: number
  height: number
  core: MapPoint
  hubs: readonly MapHubData[]
  nodes: readonly MapNodeData[]
}
export interface MapLevelData {
  confirmed: number
  total: number
}

import { JUST_CHANGED_MS } from './use-just-changed'

export interface BrainMapProps {
  layout: MapLayoutData
  level: MapLevelData
  /** The spoken version: numbers, never an arc. Computed on the server. */
  ariaLabel: string
  states: MapStates
  /** `wide` is the overview's picture; `compact` sits in the tab header on every brain screen. */
  variant?: 'wide' | 'compact'
  /** True before any brain exists: the frame is drawn, nothing is lit, and nothing can pulse. */
  dormant?: boolean
  className?: string
}

const CORE_R = 22
const CORE_C = 2 * Math.PI * CORE_R

/**
 * The Brand Brain, lighting up one answer at a time.
 *
 * ── WHAT LIGHTS, AND WHY IT IS THE CERTAINTY SYSTEM'S OWN VOCABULARY ────────
 * A confirmed field is a solid brand node: `.is-real`, "it happened". A guess
 * is a dashed ring with no fill: `.is-proposed`. A field seeded from a setup
 * answer is the dashed ring over the brand wash — proposed wording, the
 * person's own substance. No fifth treatment, and hue carries nothing alone:
 * fill and edge do.
 *
 * ── WHEN IT MOVES ────────────────────────────────────────────────────────────
 * Only when a node changes state under it. The screens re-render from the
 * server after every write, so the new provenance arrives as props; the
 * previous props are kept in a ref and the difference is what pulses. A page
 * arriving never pulses, and a node that was already lit never re-lights.
 * Everything animated is transform or opacity, nothing longer than
 * `--dur-slow`, and the global reduced-motion block collapses it all.
 */
export function BrainMap({
  layout,
  level,
  ariaLabel,
  states,
  variant = 'wide',
  dormant = false,
  className,
}: BrainMapProps) {
  const LAYOUT = layout
  const previous = useRef<MapStates | null>(null)
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const before = previous.current
    previous.current = states
    if (!before) return
    const next = new Set<string>()
    for (const [path, state] of Object.entries(states)) {
      if (state === 'confirmed' && before[path] !== 'confirmed') next.add(path)
    }
    if (next.size === 0) return
    setLit(next)
    const timer = setTimeout(() => setLit(new Set()), JUST_CHANGED_MS)
    return () => clearTimeout(timer)
  }, [states])

  const compact = variant === 'compact'
  const nodeR = compact ? 8 : 7
  const hubR = 3
  const corePulse = lit.size > 0
  const arc = CORE_C * (1 - level.confirmed / level.total)

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={ariaLabel}
      data-brain-map={variant}
      data-dormant={dormant ? 'true' : undefined}
      className={cn('block h-auto w-full overflow-visible', className)}
    >
      {/* Hub → core. Lit in proportion to how much of the section is settled. */}
      {LAYOUT.hubs.map((hub) => {
        const fields = LAYOUT.nodes.filter((n) => n.section === hub.section)
        const settled = fields.filter((n) => states[n.path] === 'confirmed').length
        const share = fields.length === 0 ? 0 : settled / fields.length
        return (
          <line
            key={hub.section}
            x1={hub.x}
            y1={hub.y}
            x2={LAYOUT.core.x}
            y2={LAYOUT.core.y}
            strokeWidth={compact ? 2 : 1.5}
            strokeOpacity={share > 0 ? 0.35 + 0.65 * share : 1}
            className={cn('brain-edge', share > 0 ? 'stroke-primary' : 'stroke-line')}
          />
        )
      })}

      {/* Node → hub. Lit when the node is. */}
      {LAYOUT.nodes.map((node) => {
        const hub = LAYOUT.hubs.find((h) => h.section === node.section)!
        const state: MapFieldState = states[node.path] ?? 'guessed'
        return (
          <line
            key={`e-${node.path}`}
            x1={node.x}
            y1={node.y}
            x2={hub.x}
            y2={hub.y}
            strokeWidth={compact ? 1.5 : 1}
            className={cn(
              'brain-edge',
              state === 'confirmed' ? 'stroke-primary' : 'stroke-line',
              state === 'intake' && 'stroke-primary [stroke-opacity:0.45]',
            )}
          />
        )
      })}

      {LAYOUT.hubs.map((hub) => (
        <circle key={`h-${hub.section}`} cx={hub.x} cy={hub.y} r={hubR} className="fill-line-firm">
          <title>{hub.title}</title>
        </circle>
      ))}

      {LAYOUT.nodes.map((node) => {
        const state: MapFieldState = states[node.path] ?? 'guessed'
        const justLit = lit.has(node.path)
        return (
          <g key={node.path} data-node={node.path} data-state={state}>
            {justLit ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeR}
                className="brain-halo fill-primary"
                aria-hidden
              />
            ) : null}
            <circle
              cx={node.x}
              cy={node.y}
              r={nodeR}
              strokeWidth={compact ? 2 : 1.5}
              data-lit={justLit ? 'true' : undefined}
              className={cn(
                'brain-node',
                state === 'confirmed' && 'fill-primary stroke-primary',
                state === 'intake' && 'fill-brand-wash stroke-primary [stroke-dasharray:3_2]',
                state === 'guessed' && 'fill-surface stroke-line-firm [stroke-dasharray:3_2]',
              )}
            >
              <title>
                {node.label}
                {state === 'confirmed'
                  ? ': confirmed'
                  : state === 'intake'
                    ? ': from your answer'
                    : ': still a guess'}
              </title>
            </circle>
          </g>
        )
      })}

      {/* The core: the ring's own count, as an arc and as a numeral. */}
      <g data-core data-lit={corePulse ? 'true' : undefined} className="brain-core">
        <circle
          cx={LAYOUT.core.x}
          cy={LAYOUT.core.y}
          r={CORE_R}
          className="fill-surface stroke-line"
          strokeWidth={3}
        />
        {!dormant ? (
          <circle
            cx={LAYOUT.core.x}
            cy={LAYOUT.core.y}
            r={CORE_R}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={CORE_C}
            strokeDashoffset={arc}
            transform={`rotate(-90 ${LAYOUT.core.x} ${LAYOUT.core.y})`}
            className="stroke-primary transition-panel"
          />
        ) : null}
        <text
          x={LAYOUT.core.x}
          y={LAYOUT.core.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={compact ? 15 : 17}
          className="num fill-ink font-bold"
          aria-hidden
        >
          {dormant ? '·' : level.confirmed}
        </text>
      </g>
    </svg>
  )
}
