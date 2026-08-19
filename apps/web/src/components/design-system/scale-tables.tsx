/**
 * The scales, with the REASON each step exists in the third column.
 *
 * A scale without reasons is a list of numbers, and a list of numbers gets
 * picked from by eye — which is how a 7px cliff between h2 and body ended up
 * being filled by `text-[15px]` at forty call sites.
 */

const TYPE: ReadonlyArray<[string, string, string]> = [
  [
    'type-hero-num',
    '650 · 44/44 · −0.03em',
    'The one big number per view. Tabular, so digits do not shuffle.',
  ],
  [
    'type-display',
    '700 · 30/36 · −0.022em',
    'Page hero. At most one per screen, and never beside another hero.',
  ],
  ['type-h1', '600 · 24/30 · −0.022em', 'Page title.'],
  ['type-h2', '600 · 20/26 · −0.011em', 'Section title inside a page.'],
  ['type-h3', '650 · 15/20 · −0.011em', 'Card and row title. The rung that was missing.'],
  [
    'type-body',
    '400 · 13/20',
    'Everything a person reads. 13px, not 16 — density is most of the look.',
  ],
  ['type-sm', '400 · 12/18', 'Secondary and supporting. Never the only place a fact appears.'],
  [
    'type-eyebrow',
    '600 · 11/14 · +0.06em',
    'Uppercase label above a group. Never a heading on its own.',
  ],
]

const SPACE: ReadonlyArray<[string, string, string]> = [
  ['--space-1', '4px', 'Between a glyph and its label. Optical, not structural.'],
  ['--space-2', '8px', 'Between items in one row — chips, buttons in a group.'],
  ['--space-3', '12px', 'Inside a compact control; between a label and its field.'],
  ['--space-4', '16px', 'Card padding, and the gap between cards in a grid.'],
  ['--space-5', '20px', 'Between a section title and its content.'],
  ['--space-6', '24px', 'Page gutter, and between unrelated blocks.'],
  ['--space-8', '32px', 'Between sections of one page.'],
  ['--space-10', '40px', 'Above a page title.'],
  [
    '--space-12',
    '48px',
    'Between major regions. The largest step — if you want more, you want a divider.',
  ],
]

const RADIUS: ReadonlyArray<[string, string, string]> = [
  ['--r-sm', '6px', 'Buttons, inputs, badges, chips — anything you click or read a word in.'],
  ['--r', '8px', 'Tiles and small surfaces.'],
  ['--r-md', '10px', 'Segmented controls and larger controls.'],
  ['--r-lg', '12px', 'Cards, nav items, wells. The default for a surface.'],
  ['--r-full', '999px', 'Pills and avatars only. Never a card.'],
]

const ELEVATION: ReadonlyArray<[string, string, string]> = [
  [
    'surface-ring',
    'inset hairline',
    'A resting card. An INSET ring, so a hover cannot reflow the layout.',
  ],
  ['--sh-card', '0 1px 2px / 4%', 'A card that must lift slightly off a busy background.'],
  ['--sh-pop', '0 4px 16px / 8%', 'Popovers and menus — things that float and can be dismissed.'],
  ['--sh-lg', '0 16px 48px / 14%', 'Modals and drawers. The only rung that implies a scrim.'],
]

const MOTION: ReadonlyArray<[string, string, string]> = [
  ['--dur-fast', '140ms', 'Colour, opacity, border — anything under the pointer.'],
  ['--dur-base', '180ms', 'Panels, disclosure, tab changes.'],
  ['--dur-slow', '280ms', 'Drawers and modals entering. Nothing longer ships.'],
  ['--ease', 'cubic-bezier(.2,0,.2,1)', 'Everything. One curve, so motion reads as one hand.'],
]

export function ScaleTables() {
  return (
    <div className="grid gap-8">
      <Table title="Type" head="Utility" rows={TYPE} />
      <Table title="Space" head="Token" rows={SPACE} />
      <Table title="Radius" head="Token" rows={RADIUS} />
      <Table title="Elevation" head="Token" rows={ELEVATION} />
      <Table title="Motion" head="Token" rows={MOTION} />
      <div>
        <h3 className="type-h3">What must never animate</h3>
        <ul className="type-sm mt-2 grid max-w-[70ch] gap-1 text-muted">
          <li>
            · A number changing. A credit balance that counts up is a balance you cannot read.
          </li>
          <li>· Anything on the crash path — an error must arrive, not ease in.</li>
          <li>· Layout on first paint. The theme is set before paint for exactly this reason.</li>
          <li>· Anything at all under `prefers-reduced-motion`. Already enforced in tokens.css.</li>
        </ul>
      </div>
    </div>
  )
}

function Table({
  title,
  head,
  rows,
}: {
  title: string
  head: string
  rows: ReadonlyArray<[string, string, string]>
}) {
  return (
    <div>
      <h3 className="type-h3 mb-2">{title}</h3>
      <div className="overflow-x-auto rounded-card border border-line-soft">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {[head, 'Value', 'Why this step exists'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="type-eyebrow border-b border-line-soft px-3 py-2 text-left text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, value, why]) => (
              <tr key={name} className="border-b border-line-soft last:border-0">
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{name}</td>
                <td className="num px-3 py-2 whitespace-nowrap text-muted">{value}</td>
                <td className="px-3 py-2">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
