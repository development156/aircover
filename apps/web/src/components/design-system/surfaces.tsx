/**
 * The v5 surface primitives: the ladder, the radius ladder, and glass.
 *
 * ── WHY GLASS IS DEMONSTRATED HERE AND NOWHERE ELSE ON THIS PAGE ─────────────
 * /design-system is a PUBLIC route outside `(app)`, so it has no topbar, no rail
 * and no bottom bar — which means it carried ZERO blurred elements until this
 * component existed. `scripts/design/glass-cost.mjs` measured it anyway and
 * reported "+0ms (+0%)": true, and a measurement of nothing. The script now
 * refuses a page with no blur on it, and this section gives it something real
 * to measure without needing a Clerk session.
 *
 * It also does the job a primitive rack is for. Glass is a surface treatment
 * with a hard rule attached (docs/37 §7) and the rule is easier to get wrong
 * than to read, so the rack shows BOTH sides of it: a legal glass panel, and the
 * opaque well a glass panel must give anything that carries a status.
 */

const LADDER = [
  ['--canvas', 'bg-canvas', 'The page ground. NOT white in v5.'],
  ['--surface', 'bg-surface', 'Cards, panels, sheets. A card is a card because it is brighter.'],
  ['--surface-2', 'bg-s2', 'A well INSIDE a card: inputs, table heads, code.'],
  ['--surface-3', 'bg-surface-3', 'Hover and pressed.'],
] as const

const RADII = [
  ['--r-xs', 'rounded-xs', '8'],
  ['--r-sm', 'rounded-sm', '12'],
  ['--r', 'rounded', '16'],
  ['--r-md', 'rounded-md', '20'],
  ['--r-lg', 'rounded-lg', '24'],
  ['--r-xl', 'rounded-xl', '28'],
  ['--r-full', 'rounded-full', 'pill'],
] as const

export function Surfaces() {
  return (
    <div className="grid gap-8">
      <div>
        <h3 className="type-h3 mb-1">The tonal ladder</h3>
        <p className="type-meta mb-3 max-w-prose text-muted">
          Four rungs, and every adjacent pair clears a floor derived from the reference: 1.03:1 on
          light, 1.06:1 on dark. Two floors, not one: sRGB is compressed near black, so the same
          separation costs a different number of steps at each end. Proven by{' '}
          <code className="rounded-xs bg-s2 px-1">tonal-ladder.test.ts</code>.
        </p>
        <div className="grid grid-cols-4 gap-3 max-narrow:grid-cols-2">
          {LADDER.map(([token, cls, why]) => (
            <div key={token} className="surface-ring overflow-hidden rounded-lg">
              <div className={`${cls} h-16`} />
              <div className="p-3">
                <p className="type-chip num">{token}</p>
                <p className="type-meta mt-1 text-muted">{why}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="type-h3 mb-1">The radius ladder</h3>
        <p className="type-meta mb-3 max-w-prose text-muted">
          By surface SIZE, not by importance. A nested surface takes the parent&rsquo;s radius minus
          one step. Equal radii on nested boxes make the two curves fight, and a larger radius
          inside a smaller one reads as a mistake.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {RADII.map(([token, cls, px]) => (
            <div key={token} className="grid gap-1">
              <div className={`${cls} surface-ring grid size-20 place-items-center bg-s2`}>
                <span className="type-chip num text-muted">{px}</span>
              </div>
              <span className="type-meta num text-muted">{token}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="type-h3 mb-1">Glass, chrome only</h3>
        <p className="type-meta mb-3 max-w-prose text-muted">
          Allowed on the topbar, the rail, the mobile bottom bar, the command palette, modal and
          drawer panels, and toasts. <strong>Never</strong> on a card, table, stat, chart or list
          row. Two reasons, neither aesthetic: a backdrop-filter re-blurs everything behind it on
          every frame that changes, and the Certainty System separates its rungs by fill weight,
          which translucency destroys by definition.
        </p>
        {/* A real ground with something behind it, or the blur has nothing to sample
            and the demo would show a plain panel while claiming to show glass. */}
        <div className="relative overflow-hidden rounded-lg">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(320px 220px at 15% 20%, var(--grad-1), transparent 60%),' +
                'radial-gradient(300px 240px at 85% 70%, var(--grad-2), transparent 60%),' +
                'repeating-linear-gradient(45deg, var(--line) 0 1px, transparent 1px 14px)',
            }}
          />
          <div className="relative grid gap-3 p-6">
            <div className="glass surface-ring rounded-xl p-4">
              <p className="type-h3">A glass panel</p>
              <p className="type-meta mt-1 text-muted">
                Legal: this is chrome. The hatch behind it stays visible through the blur, which is
                the whole effect, and the whole problem for anything below.
              </p>
              {/* The rule, demonstrated rather than only stated. */}
              <div className="glass-well surface-ring mt-3 rounded-md p-3">
                <p className="type-meta mb-2 text-muted">
                  A status-bearing element gets an OPAQUE well. On the blur its fill weight would
                  read as a different rung.
                </p>
                <span className="is-simulated type-chip inline-flex rounded-sm px-2 py-1">
                  Simulated · not a real send
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
