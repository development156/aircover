import { BRAIN_FIELDS, BRAIN_SECTIONS, RING_DENOMINATOR, type BrainSectionKey } from './fields'
import { stateOf, type FieldState, type Provenance } from './provenance'

/**
 * The Brand Brain as a picture: fifteen fields around a core, one cluster per
 * section, lit as a person confirms them.
 *
 * ── WHY A MAP AND NOT A BAR ──────────────────────────────────────────────────
 * The split bar says how MUCH is settled. It cannot say WHICH parts, and it
 * cannot show a single answer landing. The map does both: a node per field,
 * solid once a person stood behind it, dashed while it is Sahoda's; and an
 * edge into the core that lights when its node does. The number in the core
 * is the ring's own count, so the picture and the figure cannot disagree.
 *
 * Pure geometry, no DOM: the component draws whatever this returns, and the
 * tests can assert every node sits inside the frame without a browser.
 */
export const MAP_W = 320
export const MAP_H = 200

export interface MapPoint {
  x: number
  y: number
}

export interface MapHub extends MapPoint {
  section: BrainSectionKey
  title: string
}

export interface MapNode extends MapPoint {
  path: string
  label: string
  section: BrainSectionKey
}

export interface BrainMapLayout {
  width: number
  height: number
  core: MapPoint
  hubs: readonly MapHub[]
  nodes: readonly MapNode[]
}

const CORE: MapPoint = { x: MAP_W / 2, y: MAP_H / 2 }
/** The five section hubs sit on an inner ellipse; their fields on an outer one. */
const HUB_RX = 92
const HUB_RY = 52
const NODE_RX = 142
const NODE_RY = 86
/** Angular gap between sibling fields of one section, in degrees. */
const NODE_SPREAD = 15

function onEllipse(deg: number, rx: number, ry: number): MapPoint {
  const rad = (deg * Math.PI) / 180
  return { x: round(CORE.x + rx * Math.cos(rad)), y: round(CORE.y + ry * Math.sin(rad)) }
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

/** Deterministic: the same brain always draws the same picture. */
export function brainMapLayout(): BrainMapLayout {
  const step = 360 / BRAIN_SECTIONS.length
  const hubs: MapHub[] = BRAIN_SECTIONS.map((section, index) => ({
    section: section.key,
    title: section.title,
    ...onEllipse(-90 + index * step, HUB_RX, HUB_RY),
  }))

  const nodes: MapNode[] = []
  for (const [index, hub] of hubs.entries()) {
    const fields = BRAIN_FIELDS.filter((field) => field.section === hub.section)
    const base = -90 + index * step
    for (const [i, field] of fields.entries()) {
      const offset = (i - (fields.length - 1) / 2) * NODE_SPREAD
      nodes.push({
        path: field.path,
        label: field.label,
        section: hub.section,
        ...onEllipse(base + offset, NODE_RX, NODE_RY),
      })
    }
  }

  return { width: MAP_W, height: MAP_H, core: CORE, hubs, nodes }
}

export type MapStates = Readonly<Record<string, FieldState>>

/** One state per registered field, so a client component gets a plain object rather than a Map. */
export function statesOf(provenance: Provenance): MapStates {
  return Object.fromEntries(
    BRAIN_FIELDS.map((field) => [field.path, stateOf(provenance, field.path)]),
  )
}

/** Every field a guess: what the map shows before any brain exists. */
export const DORMANT_STATES: MapStates = Object.fromEntries(
  BRAIN_FIELDS.map((field) => [field.path, 'guessed' as const]),
)

export interface MapLevel {
  confirmed: number
  intake: number
  guessed: number
  total: number
}

export function mapLevel(states: MapStates): MapLevel {
  let confirmed = 0
  let intake = 0
  for (const field of BRAIN_FIELDS) {
    const state = states[field.path] ?? 'guessed'
    if (state === 'confirmed') confirmed += 1
    else if (state === 'intake') intake += 1
  }
  return {
    confirmed,
    intake,
    guessed: RING_DENOMINATOR - confirmed - intake,
    total: RING_DENOMINATOR,
  }
}

/** The spoken version of the picture. Numbers, never an arc. */
export function mapAriaLabel(level: MapLevel, dormant = false): string {
  if (dormant) return 'Brand Brain map: not built yet.'
  const parts = [`${level.confirmed} of ${level.total} fields confirmed`]
  if (level.intake > 0) parts.push(`${level.intake} from your answers`)
  parts.push(`${level.guessed} still Sahoda's guess`)
  return `Brand Brain map: ${parts.join(', ')}.`
}
