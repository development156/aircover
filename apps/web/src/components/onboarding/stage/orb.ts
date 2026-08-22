/**
 * SAHODA LABS — THE BRAND BRAIN ORB
 *
 * Ported from `docs/ui-package/sahoda-labs/js/orb.js`. A canvas object, not an
 * image, with four jobs across the flow:
 *
 *   idle        floats, breathes, orbited by everything it has learned
 *   absorb      new particles fly in from outside and JOIN the orbit
 *   processing  named facets spiral in and collapse into the core
 *   dissolve    everything blows outward as the dashboard arrives
 *
 * The mechanic that matters is `absorb`. Particle count is not decorative — it
 * is the number of brand signals the user has actually given, so the orb
 * visibly gets denser and brighter as they teach it. That is the whole argument
 * of the onboarding, made in one object: what you tell it, it keeps.
 *
 * Canvas rather than SVG because this is generative: a few hundred depth-sorted
 * particles a frame would be a few hundred DOM nodes, and the browser would
 * spend its budget on layout instead of on drawing.
 *
 * ── THE ONE DEPARTURE FROM THE SOURCE ────────────────────────────────────────
 * The source paints '#FF6600', '#111111' and '#FFFFFF' as literals. Two reasons
 * that cannot survive here, and the second is the real one:
 *
 *   1. `scripts/design/design-lint.mjs` rule 1 is at ZERO and ungraced. A hex in
 *      a .ts file under apps/web/src fails the gate.
 *   2. More importantly the app has a DARK theme and a per-workspace Brand Skin,
 *      and a hard-coded '#FFFFFF' facet pill is a white card on a near-black
 *      page. The source's index.html has one theme's worth of chrome around it.
 *
 * So the palette is READ from the same custom properties the rest of the app
 * paints with, via a probe element — `getComputedStyle().color` normalises any
 * authored format to `rgb(r, g, b)`, which is the only parse that survives a
 * token being changed from a hex to a color-mix. It is re-read on theme change,
 * so the orb crosses the toggle with the page.
 */

const TAU = Math.PI * 2
/** Perspective depth — lower is more dramatic. */
const FOCAL = 620
/** Particle ceiling; past this it reads as noise rather than as density. */
const MAX_P = 150

export type OrbMode = 'idle' | 'processing' | 'dissolve'

interface Particle {
  /**
   * Orbit radius as a MULTIPLE of the core radius, so everything scales
   * together when the orb grows instead of the orbits drifting away from the
   * body. The ceiling matters: the widest orbit must still fit inside the
   * canvas at maximum energy, or particles clip against the edge instead of
   * going round the back. 2.35 x R(max) stays inside half of min(W, H).
   */
  r: number
  inc: number
  phase: number
  speed: number
  size: number
  /** Orange vs ink — a little grit in the field. */
  warm: boolean
  /** 0 → 1 arrival progress. */
  k: number
  fromX: number
  fromY: number
}

interface Facet {
  label: string
  a: number
  /** 1 = full orbit radius, 0 = absorbed into the core. */
  r: number
  absorbed: boolean
}

interface Rgb {
  r: number
  g: number
  b: number
}

interface Palette {
  /** --p, the brand orange. Drives the core, the aura and the warm particles. */
  brand: Rgb
  /** --ink. The cool particles and the facet label. */
  ink: Rgb
  /** --surface. The facet pill's ground. */
  surface: Rgb
}

const FALLBACK: Palette = {
  brand: { r: 255, g: 102, b: 0 },
  ink: { r: 17, g: 17, b: 17 },
  surface: { r: 255, g: 255, b: 255 },
}

/**
 * Resolve a custom property to channels.
 *
 * Reading the property text and parsing it ourselves would work today and break
 * the day a token becomes a `color-mix()` or an `oklch()`. Assigning it to
 * `color` and reading the computed value hands the parse to the engine, which
 * always answers in `rgb()`.
 */
function readPalette(host: HTMLElement): Palette {
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.opacity = '0'
  probe.style.pointerEvents = 'none'
  host.appendChild(probe)

  const channel = (token: string, fallback: Rgb): Rgb => {
    probe.style.color = ''
    probe.style.color = `var(${token})`
    const computed = getComputedStyle(probe).color
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(computed)
    if (!m) return fallback
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  }

  const palette: Palette = {
    brand: channel('--p', FALLBACK.brand),
    ink: channel('--ink', FALLBACK.ink),
    surface: channel('--surface', FALLBACK.surface),
  }
  probe.remove()
  return palette
}

const rgba = (c: Rgb, a: number): string => `rgba(${c.r},${c.g},${c.b},${a})`

/** Mix toward white — the source's #FFF0E1 / #FFB96E core stops, by ratio. */
function lift(c: Rgb, k: number): Rgb {
  return {
    r: Math.round(c.r + (255 - c.r) * k),
    g: Math.round(c.g + (255 - c.g) * k),
    b: Math.round(c.b + (255 - c.b) * k),
  }
}

/** Mix toward black — the source's #DC4600 / #A52800 terminator stops. */
function deepen(c: Rgb, k: number): Rgb {
  return { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) }
}

export interface OrbHandle {
  absorb(n?: number): void
  setEnergy(v: number): void
  setMode(m: OrbMode): void
  setFacets(list: string[]): void
  absorbFacet(i: number): void
  refreshPalette(): void
  resize(): void
  destroy(): void
}

export interface OrbOptions {
  reduced?: boolean
  energy?: number
}

export function mountOrb(canvas: HTMLCanvasElement, opts: OrbOptions = {}): OrbHandle {
  const cx2 = canvas.getContext('2d')
  if (!cx2) {
    // A context can genuinely be refused (a lost GPU, a hardened browser). The
    // orb is decoration over a flow that works without it, so this returns an
    // inert handle rather than throwing onboarding off the road.
    const noop = (): void => {}
    return {
      absorb: noop,
      setEnergy: noop,
      setMode: noop,
      setFacets: noop,
      absorbFacet: noop,
      refreshPalette: noop,
      resize: noop,
      destroy: noop,
    }
  }

  const reduced = Boolean(opts.reduced)
  let W = 0
  let H = 0
  let DPR = 1
  let raf = 0
  let t0 = 0
  let t = 0

  let mode: OrbMode = 'idle'
  let energy = opts.energy ?? 0.12
  /** Eased toward `energy` so growth is FELT rather than teleported to. */
  let shownEnergy = energy
  let parts: Particle[] = []
  let facets: Facet[] = []
  let dissolveAt = 0
  let palette = FALLBACK

  const rnd = (a: number, b: number): number => a + Math.random() * (b - a)
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
  const ease = (k: number): number => 1 - Math.pow(1 - k, 3)

  function makeParticle(incoming: boolean): Particle {
    const p: Particle = {
      r: rnd(1.3, 2.35),
      inc: rnd(-1.15, 1.15),
      phase: rnd(0, TAU),
      speed: rnd(0.07, 0.24) * (Math.random() < 0.5 ? 1 : -1),
      size: rnd(0.9, 2.3),
      warm: Math.random() < 0.72,
      k: 1,
      fromX: 0,
      fromY: 0,
    }
    if (incoming) {
      // Enter from a random point beyond the frame, then settle into orbit.
      const a = rnd(0, TAU)
      const d = Math.max(W, H) * rnd(0.55, 0.85)
      p.fromX = Math.cos(a) * d
      p.fromY = Math.sin(a) * d
      p.k = 0
    }
    return p
  }

  function resize(): void {
    const r = canvas.getBoundingClientRect()
    // Cap at 2: 3x costs 2.2x fill for no visible gain.
    DPR = Math.min(window.devicePixelRatio || 1, 2)
    W = Math.max(1, r.width)
    H = Math.max(1, r.height)
    canvas.width = Math.round(W * DPR)
    canvas.height = Math.round(H * DPR)
    cx2!.setTransform(DPR, 0, 0, DPR, 0, 0)
    if (reduced) draw(0)
  }

  function roundRect(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    c.beginPath()
    c.moveTo(x + r, y)
    c.arcTo(x + w, y, x + w, y + h, r)
    c.arcTo(x + w, y + h, x, y + h, r)
    c.arcTo(x, y + h, x, y, r)
    c.arcTo(x, y, x + w, y, r)
    c.closePath()
  }

  function paint(list: { x: number; y: number; s: number; a: number; warm: boolean }[]): void {
    for (const d of list) {
      if (d.a <= 0.004 || d.s <= 0.05) continue
      cx2!.beginPath()
      cx2!.arc(d.x, d.y, d.s, 0, TAU)
      cx2!.fillStyle = d.warm ? rgba(lift(palette.brand, 0.1), d.a) : rgba(palette.ink, d.a * 0.34)
      cx2!.fill()
    }
  }

  function draw(time: number): void {
    cx2!.clearRect(0, 0, W, H)

    const cx = W / 2
    const cy = H / 2

    shownEnergy += (energy - shownEnergy) * (reduced ? 1 : 0.045)

    const base = Math.min(W, H)
    const breathe = reduced ? 1 : 1 + Math.sin(time * 0.85) * 0.018
    /* Generous base so an EMPTY Brand Brain still reads as a presence rather
       than a dot — the intro has to carry a whole screen. The growth term is
       what the user earns. */
    let R =
      mode === 'processing' ? base * 0.21 * breathe : base * (0.135 + shownEnergy * 0.062) * breathe

    let coreA = 1
    let blow = 0
    if (mode === 'dissolve') {
      const k = Math.min(1, (time - dissolveAt) / 0.85)
      coreA = 1 - ease(k)
      blow = ease(k)
      R *= 1 + k * 0.55
    }

    const bright = 0.45 + shownEnergy * 0.55

    /* ---- outer light field: a warm radial aura ---- */
    if (coreA > 0.01) {
      const glowR = Math.min(R * 3.8, base * 0.49)
      const g = cx2!.createRadialGradient(cx, cy, R * 0.4, cx, cy, glowR)
      g.addColorStop(0, rgba(palette.brand, 0.22 * bright * coreA))
      g.addColorStop(0.35, rgba(lift(palette.brand, 0.08), 0.1 * bright * coreA))
      g.addColorStop(0.7, rgba(lift(palette.brand, 0.15), 0.03 * bright * coreA))
      g.addColorStop(1, rgba(lift(palette.brand, 0.15), 0))
      cx2!.fillStyle = g
      cx2!.beginPath()
      cx2!.arc(cx, cy, glowR, 0, TAU)
      cx2!.fill()
    }

    /* ---- two thin inclined orbital rings ---- */
    if (coreA > 0.01 && mode !== 'dissolve') {
      for (let i = 0; i < 2; i++) {
        const rr = R * (1.65 + i * 0.62)
        const tilt = 0.35 + i * 0.15
        const spin = reduced ? 0.4 : time * (0.05 + i * 0.025)
        cx2!.save()
        cx2!.translate(cx, cy)
        cx2!.rotate(spin * (i ? -1 : 1))
        cx2!.scale(1, tilt)
        cx2!.beginPath()
        cx2!.arc(0, 0, rr, 0, TAU)
        cx2!.strokeStyle = rgba(palette.brand, (0.18 - i * 0.06) * bright)
        cx2!.lineWidth = 1.2
        cx2!.stroke()
        cx2!.restore()
      }
    }

    /* ---- particles, depth-sorted in 3D perspective ---- */
    const drawn: { x: number; y: number; s: number; z: number; a: number; warm: boolean }[] = []
    for (const p of parts) {
      if (p.k < 1) p.k = Math.min(1, p.k + (reduced ? 1 : 0.022))

      const a = p.phase + (reduced ? 0.6 : time) * p.speed
      const orbR = R * p.r * (1 + blow * 5.2)
      const ox = Math.cos(a) * orbR
      const oy = Math.sin(a) * orbR * Math.sin(p.inc)
      const oz = Math.sin(a) * orbR * Math.cos(p.inc)

      // Arrival: travel from off-frame into the orbit slot.
      const k = ease(p.k)
      const x = lerp(p.fromX, ox, k)
      const y = lerp(p.fromY, oy, k)
      const z = oz * k

      const sc = FOCAL / (FOCAL + z)
      drawn.push({
        x: cx + x * sc,
        y: cy + y * sc,
        s: p.size * sc * (0.8 + shownEnergy * 0.5),
        z,
        a: (0.28 + 0.62 * sc) * (0.35 + 0.65 * k) * (1 - blow * 0.75) * bright,
        warm: p.warm,
      })
    }

    drawn.sort((m, n) => m.z - n.z)
    paint(drawn.filter((d) => d.z >= 0))

    /* ---- the core sphere: volumetric gradient, specular, rim ---- */
    if (coreA > 0.01) {
      const hx = cx - R * 0.32
      const hy = cy - R * 0.35
      const g = cx2!.createRadialGradient(hx, hy, R * 0.05, cx, cy, R * 1.02)
      g.addColorStop(0, rgba(lift(palette.brand, 0.94), coreA))
      g.addColorStop(0.18, rgba(lift(palette.brand, 0.54), coreA))
      g.addColorStop(0.55, rgba(palette.brand, coreA))
      g.addColorStop(0.85, rgba(deepen(palette.brand, 0.86), coreA))
      g.addColorStop(1, rgba(deepen(palette.brand, 0.65), coreA))
      cx2!.fillStyle = g
      cx2!.beginPath()
      cx2!.arc(cx, cy, R, 0, TAU)
      cx2!.fill()

      const glint = cx2!.createRadialGradient(hx, hy, 0, hx, hy, R * 0.45)
      glint.addColorStop(0, `rgba(255,255,255,${0.6 * coreA})`)
      glint.addColorStop(0.5, rgba(lift(palette.brand, 0.9), 0.2 * coreA))
      glint.addColorStop(1, 'rgba(255,255,255,0)')
      cx2!.fillStyle = glint
      cx2!.beginPath()
      cx2!.arc(hx, hy, R * 0.45, 0, TAU)
      cx2!.fill()

      // Rim light along the lower-right terminator.
      cx2!.save()
      cx2!.beginPath()
      cx2!.arc(cx, cy, R * 0.985, TAU * 0.05, TAU * 0.48)
      cx2!.strokeStyle = rgba(lift(palette.brand, 0.72), 0.55 * coreA)
      cx2!.lineWidth = Math.max(1.2, R * 0.038)
      cx2!.stroke()
      cx2!.restore()

      // Slow inner swirl — the intelligence pulse.
      if (!reduced && mode !== 'dissolve') {
        cx2!.save()
        cx2!.beginPath()
        cx2!.arc(cx, cy, R, 0, TAU)
        cx2!.clip()
        for (let i = 0; i < 3; i++) {
          const p2 = time * (0.2 + i * 0.08) + i * 2.1
          const bx = cx + Math.cos(p2) * R * 0.32
          const by = cy + Math.sin(p2 * 1.25) * R * 0.28
          const bg = cx2!.createRadialGradient(bx, by, 0, bx, by, R * 0.65)
          bg.addColorStop(0, rgba(lift(palette.brand, 0.92), 0.25 * coreA))
          bg.addColorStop(1, rgba(lift(palette.brand, 0.92), 0))
          cx2!.fillStyle = bg
          cx2!.fillRect(cx - R, cy - R, R * 2, R * 2)
        }
        cx2!.restore()
      }
    }

    paint(drawn.filter((d) => d.z < 0))

    /* ---- processing facets ---- */
    if (mode === 'processing' && facets.length) {
      const orbitW = Math.min(W * 0.4, H * 0.4)
      const orbitH = orbitW * 0.56
      cx2!.font =
        '600 12px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

      for (const f of facets) {
        if (f.absorbed) f.r = Math.max(0, f.r - 0.065)
        if (f.r <= 0.001) continue

        const a = f.a + (reduced ? 0 : time * 0.14)
        const rr = ease(f.r)
        const fx = cx + Math.cos(a) * orbitW * rr
        const fy = cy + Math.sin(a) * orbitH * rr

        const alpha = Math.min(1, f.r * 1.2)
        const w = cx2!.measureText(f.label).width + 30
        const h = 28

        cx2!.save()
        cx2!.globalAlpha = alpha
        cx2!.translate(fx, fy)
        cx2!.scale(0.7 + 0.3 * f.r, 0.7 + 0.3 * f.r)

        cx2!.shadowColor = 'rgba(0, 0, 0, 0.08)'
        cx2!.shadowBlur = 10
        cx2!.shadowOffsetY = 3

        roundRect(cx2!, -w / 2, -h / 2, w, h, 14)
        // --surface, not white: this pill sits on a near-black page in dark.
        cx2!.fillStyle = rgba(palette.surface, 1)
        cx2!.fill()

        cx2!.shadowColor = 'transparent'
        cx2!.strokeStyle = rgba(palette.brand, 0.32)
        cx2!.lineWidth = 1
        cx2!.stroke()

        cx2!.fillStyle = rgba(palette.brand, 1)
        cx2!.beginPath()
        cx2!.arc(-w / 2 + 12, 0, 3, 0, TAU)
        cx2!.fill()

        // --ink, so the label inverts with the pill it sits on.
        cx2!.fillStyle = rgba(palette.ink, 1)
        cx2!.textAlign = 'left'
        cx2!.textBaseline = 'middle'
        cx2!.fillText(f.label, -w / 2 + 20, 1)
        cx2!.restore()
      }
    }
  }

  function loop(now: number): void {
    t = (now - t0) / 1000
    draw(t)
    raf = requestAnimationFrame(loop)
  }

  // ---- boot ----
  palette = readPalette(canvas.parentElement ?? document.body)
  const seed = Math.round(26 + energy * 58)
  for (let i = 0; i < seed; i++) parts.push(makeParticle(false))
  resize()
  window.addEventListener('resize', resize)
  t0 = performance.now()
  if (reduced) draw(0)
  else raf = requestAnimationFrame(loop)

  return {
    /** Called every time the user contributes something real. */
    absorb(n = 1) {
      for (let i = 0; i < n && parts.length < MAX_P; i++) parts.push(makeParticle(true))
      if (reduced) draw(0)
    },
    setEnergy(v) {
      energy = Math.max(0, Math.min(1, v))
      if (reduced) draw(0)
    },
    setMode(m) {
      mode = m
      if (m === 'dissolve') dissolveAt = t
      if (reduced) draw(0)
    },
    setFacets(list) {
      facets = list.map((label, i) => ({
        label,
        a: (i / list.length) * TAU,
        r: 1,
        absorbed: false,
      }))
    },
    absorbFacet(i) {
      const f = facets[i]
      if (f) f.absorbed = true
    },
    refreshPalette() {
      palette = readPalette(canvas.parentElement ?? document.body)
      if (reduced) draw(0)
    },
    resize,
    destroy() {
      cancelAnimationFrame(raf)
      raf = 0
      window.removeEventListener('resize', resize)
      parts = []
    },
  }
}
