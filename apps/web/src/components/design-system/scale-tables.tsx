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
    'The ONE big number per view. Tabular by construction, so digits do not shuffle when the value changes. Figures are wide, so this step needs the most negative tracking on the scale.',
  ],
  [
    'type-display',
    '700 · 30/36 · −0.022em',
    'A screen that is one statement. At most one per view, and never beside another hero.',
  ],
  ['type-h1', '650 · 24/30 · −0.022em', 'Page title. Exactly one per view.'],
  ['type-h2', '650 · 20/26 · −0.008em', 'Section title inside a page.'],
  [
    'type-h3',
    '650 · 16/22 · −0.008em',
    'Card and row title. Added in v4 because a 7px cliff between h2 and body made every card title a hand-written fifteen-pixel literal.',
  ],
  [
    'type-body',
    '400 · 14/22',
    'THE BASE. 14px, up from v4\u2019s 13px: the reference is generous rather than dense, and the reader is meeting this on a cheap 720p phone. 16px was rejected because this product has tables.',
  ],
  [
    'type-sm',
    '400 · 13/18',
    'Secondary and supporting. Absorbs the 12.5px block: 110 hand-written uses, the third most common size in the codebase, with no step at all.',
  ],
  [
    'type-meta',
    '400 · 12/16',
    'NEW in v5. Table cells, captions, timestamps, helper text: the 211 hand-written 12px uses that had nowhere to go.',
  ],
  [
    'type-chip',
    '600 · 12/16',
    'A chip\u2019s own label. NOT uppercase: a chip label is often a sentence fragment ("Not proven live").',
  ],
  [
    'type-eyebrow',
    '600 · 11/14 · +0.06em',
    'Uppercase label above a group. Positive tracking because 11px uppercase set solid looks cramped. Never a heading on its own.',
  ],
  [
    'type-input-embed',
    '400 · 16/22',
    'The one rung a browser insists on: iOS Safari zooms the viewport on focus for any input under 16px, and /embed/* renders inside somebody else\u2019s page where that zoom cannot be undone.',
  ],
]

const SPACE: ReadonlyArray<[string, string, string]> = [
  ['--space-1', '4px', 'Between a glyph and its label. Optical, not structural.'],
  ['--space-2', '8px', 'Between two controls in a row; a label and its field.'],
  ['--space-3', '12px', 'Between rows in a list; inside a compact card.'],
  ['--space-4', '16px', 'Card padding (compact); between fields in a form.'],
  ['--space-5', '20px', 'Card padding (default, lower bound).'],
  ['--space-6', '24px', 'Card padding (default); between cards in a grid; the page gutter.'],
  ['--space-8', '32px', 'Between a section heading and its content.'],
  ['--space-10', '40px', 'Between sections of a page.'],
  ['--space-12', '48px', 'Between sections of a page (upper bound).'],
  [
    '--space-16',
    '64px',
    'NEW in v5. Between major regions. The reference\u2019s page rhythm is ~64px and v4\u2019s ladder stopped at 48, so every screen that wanted more wrote it by hand.',
  ],
  ['--space-20', '80px', 'NEW in v5. Above a page footer, and nothing smaller.'],
]

const RADIUS: ReadonlyArray<[string, string, string]> = [
  ['--r-xs', '8px', 'A mark, a swatch, a 20px square.'],
  ['--r-sm', '12px', 'Chips, badges, inputs, small buttons.'],
  ['--r', '16px', 'Tiles, list rows, nav items.'],
  ['--r-md', '20px', 'Segmented controls, wells, media.'],
  ['--r-lg', '24px', 'CARDS. Measured off the reference — corner profile x112→x90 over 22 rows.'],
  ['--r-xl', '28px', 'Modals, drawers, the rail. Measured.'],
  [
    '--r-full',
    '999px',
    'EVERY button, every pill. The most recognisable single decision in the reference, and not negotiable per screen.',
  ],
]

const ELEVATION: ReadonlyArray<[string, string, string]> = [
  [
    'no shadow',
    '—',
    'A RESTING CARD. The reference separates by fill and the faintest border: a card\u2019s edge pixel reads #fdfdfd against a #fafafa page — one step, i.e. anti-aliasing, not a shadow.',
  ],
  [
    'surface-ring',
    'inset hairline',
    'When a surface must separate from a fill rather than from the page. An INSET ring, so a hover cannot reflow the layout. Never together with a border.',
  ],
  [
    '--sh-card',
    '0 1px 2px / 3%',
    'Almost nothing, deliberately. A card that sits on a busy ground.',
  ],
  ['--sh-pop', '0 8px 28px / 10%', 'Popovers and menus — things that float and can be dismissed.'],
  ['--sh-lg', '0 24px 64px / 16%', 'Modals and drawers. The only rung that implies a scrim.'],
]

const MOTION: ReadonlyArray<[string, string, string]> = [
  ['--dur-fast', '140ms', 'Colour, opacity, border — anything under the pointer.'],
  ['--dur-base', '180ms', 'Panels, disclosure, tab changes, entrances.'],
  ['--dur-slow', '280ms', 'Drawers and modals entering. No TRANSITION longer than this ships.'],
  [
    '--dur-count',
    '560ms',
    'Count-up only, and the exception is principled: a count-up is a REVEAL of one settled value, not a move between two states.',
  ],
  [
    '--stagger',
    '40ms',
    'The step between successive list items, capped at 8 so a 40-row table does not take 1.6s to arrive.',
  ],
  ['--ease', 'cubic-bezier(.2,0,.2,1)', 'Everything. One curve, so motion reads as one hand.'],
]

export function ScaleTables() {
  return (
    <div className="grid gap-8">
      <Table title="Type" head="Utility" rows={TYPE} specimen />
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
  specimen = false,
}: {
  title: string
  head: string
  rows: ReadonlyArray<[string, string, string]>
  /** Render each row's name IN the step it names. Type only. */
  specimen?: boolean
}) {
  return (
    <div>
      <h3 className="type-h3 mb-2">{title}</h3>
      <div className="overflow-x-auto rounded-card border border-line-soft">
        <table className="type-sm w-full border-collapse">
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
                <td className="px-3 py-2 whitespace-nowrap">
                  {/* The type table SETS each row in its own step. A page that only
                      prints the class name is a list of strings — you cannot see a
                      scale you cannot compare, and `type-space.spec.ts` can only
                      measure a step that something on this page actually renders.
                      It found `type-h1` had no example here at all. */}
                  <span className={specimen ? name : 'font-semibold'}>{name}</span>
                </td>
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
