/**
 * A CURATED SET OF EMOJI AND SYMBOLS, SHIPPED AS DATA RATHER THAN A DEPENDENCY.
 *
 * ── WHY THERE IS NO EMOJI-PICKER PACKAGE HERE ────────────────────────────────
 * `/(app)/posts/[id]` is the heaviest route in the product at 959,704 bytes and
 * `apps/web/scripts/perf/js-budget.mjs` allows 8kB of slack over the recorded
 * figure before `pnpm build` fails. Every emoji picker on npm is one to two
 * orders of magnitude past that, because they all ship the full Unicode emoji
 * table plus keyword indexes plus a sprite sheet. A picker that broke the build
 * of the screen it was added to is not a picker.
 *
 * These are characters. The system font renders them. The whole file is under
 * 4kB of source and compresses to a fraction of that, and it costs no runtime
 * beyond an array.
 *
 * ── AND THE EMOJI RULE POINTS THE OTHER WAY ──────────────────────────────────
 * CLAUDE.md: "The emoji rule (§18) applies to Sahoda's own interface only. It
 * must never reach anything that generates or templates a social caption. Emoji
 * are native to that medium and stripping them is a product regression."
 *
 * This is caption CONTENT, on the caption side of that line. The picker's own
 * chrome — its heading, its group names, its search box — carries none, which is
 * the half the rule governs.
 *
 * ── WHY THESE ONES ───────────────────────────────────────────────────────────
 * They are what a small business actually posts with: a shop, a plate of food, a
 * date, a price, an arrow, a tick. The set is deliberately SHORT. A grid of two
 * thousand emoji is a search problem; a hundred is a glance. Anything not here
 * is still reachable by the operating system's own picker, which every phone and
 * desktop already has and which no web page can beat.
 *
 * Each entry carries a plain name so the search box has something to match and
 * so every button has an accessible label. Screen readers announce emoji
 * inconsistently or not at all, so the name is not decoration.
 */

export interface GlyphGroup {
  id: string
  label: string
  /** `[character, name]`. The name is both the search key and the button's label. */
  glyphs: readonly (readonly [string, string])[]
}

export const GLYPH_GROUPS: readonly GlyphGroup[] = [
  {
    id: 'faces',
    label: 'Faces',
    glyphs: [
      ['\u{1F600}', 'grinning'],
      ['\u{1F604}', 'smiling'],
      ['\u{1F60A}', 'happy'],
      ['\u{1F602}', 'laughing'],
      ['\u{1F970}', 'loving'],
      ['\u{1F60D}', 'heart eyes'],
      ['\u{1F60E}', 'cool'],
      ['\u{1F929}', 'star struck'],
      ['\u{1F914}', 'thinking'],
      ['\u{1F60B}', 'delicious'],
      ['\u{1F62E}', 'surprised'],
      ['\u{1F622}', 'crying'],
      ['\u{1F644}', 'eye roll'],
      ['\u{1F634}', 'sleepy'],
      ['\u{1F621}', 'angry'],
      ['\u{1F917}', 'hugging'],
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    glyphs: [
      ['\u{1F44B}', 'wave'],
      ['\u{1F44D}', 'thumbs up'],
      ['\u{1F44E}', 'thumbs down'],
      ['\u{1F44F}', 'clap'],
      ['\u{1F64C}', 'celebrate'],
      ['\u{1F64F}', 'thanks'],
      ['\u{1F4AA}', 'strong'],
      ['\u{1F91D}', 'handshake'],
      ['\u{1F446}', 'point up'],
      ['\u{1F447}', 'point down'],
      ['\u{1F449}', 'point right'],
      ['\u{1F440}', 'eyes'],
    ],
  },
  {
    id: 'food',
    label: 'Food and drink',
    glyphs: [
      ['\u{2615}', 'tea'],
      ['\u{1F375}', 'green tea'],
      ['\u{1F35B}', 'curry'],
      ['\u{1F95F}', 'dumpling'],
      ['\u{1F956}', 'bread'],
      ['\u{1F370}', 'cake'],
      ['\u{1F36A}', 'biscuit'],
      ['\u{1F361}', 'sweets'],
      ['\u{1F34B}', 'lemon'],
      ['\u{1F345}', 'tomato'],
      ['\u{1F336}', 'chilli'],
      ['\u{1F9C1}', 'cupcake'],
      ['\u{1F37D}', 'dining'],
      ['\u{1F964}', 'cold drink'],
      ['\u{1F37E}', 'toast'],
      ['\u{1F366}', 'ice cream'],
    ],
  },
  {
    id: 'places',
    label: 'Places and weather',
    glyphs: [
      ['\u{1F3E0}', 'home'],
      ['\u{1F3EA}', 'shop'],
      ['\u{1F3E2}', 'office'],
      ['\u{1F4CD}', 'location'],
      ['\u{1F5FA}', 'map'],
      ['\u{2600}', 'sun'],
      ['\u{1F327}', 'rain'],
      ['\u{1F31F}', 'star'],
      ['\u{1F338}', 'blossom'],
      ['\u{1F33F}', 'leaf'],
      ['\u{1F30D}', 'globe'],
      ['\u{2708}', 'flight'],
    ],
  },
  {
    id: 'business',
    label: 'Business',
    glyphs: [
      ['\u{1F4E3}', 'announce'],
      ['\u{1F389}', 'party'],
      ['\u{1F381}', 'gift'],
      ['\u{1F525}', 'popular'],
      ['\u{2728}', 'sparkles'],
      ['\u{1F4A1}', 'idea'],
      ['\u{1F4C8}', 'going up'],
      ['\u{1F4C9}', 'going down'],
      ['\u{1F4CA}', 'chart'],
      ['\u{1F4C5}', 'date'],
      ['\u{23F0}', 'clock'],
      ['\u{1F4F8}', 'photo'],
      ['\u{1F3AC}', 'video'],
      ['\u{1F517}', 'link'],
      ['\u{1F4E6}', 'parcel'],
      ['\u{1F4DE}', 'phone'],
      ['\u{2709}', 'email'],
      ['\u{1F6D2}', 'cart'],
      ['\u{1F3F7}', 'price tag'],
      ['\u{1F3C6}', 'award'],
    ],
  },
  {
    id: 'marks',
    label: 'Marks and arrows',
    glyphs: [
      ['\u{2764}', 'heart'],
      ['\u{2B50}', 'star'],
      ['\u{2705}', 'tick'],
      ['\u{274C}', 'cross'],
      ['\u{2757}', 'important'],
      ['\u{2753}', 'question'],
      ['\u{27A1}', 'arrow right'],
      ['\u{2B05}', 'arrow left'],
      ['\u{2B06}', 'arrow up'],
      ['\u{2B07}', 'arrow down'],
      ['\u{2022}', 'bullet'],
      ['\u{00B7}', 'middle dot'],
      ['\u{2713}', 'check'],
      ['\u{00D7}', 'times'],
      ['\u{00B0}', 'degree'],
      ['\u{2122}', 'trademark'],
      ['\u{00AE}', 'registered'],
      ['\u{00A9}', 'copyright'],
      ['\u{00BD}', 'half'],
      ['\u{2116}', 'number'],
    ],
  },
  {
    /**
     * The currency box, as its own group rather than mixed into the marks.
     *
     * Rupee leads because this product's first market prices in rupees, and a
     * writer typing a price should not have to hunt for the sign their customers
     * read. Nothing here is a figure the product produced, so none of it is
     * subject to the "never render a number no query produced" rule: these are
     * characters the writer inserts into their own sentence.
     */
    id: 'currency',
    label: 'Currency',
    glyphs: [
      ['\u{20B9}', 'rupee'],
      ['\u{0024}', 'dollar'],
      ['\u{20AC}', 'euro'],
      ['\u{00A3}', 'pound'],
      ['\u{00A5}', 'yen'],
      ['\u{20A9}', 'won'],
      ['\u{20BD}', 'rouble'],
      ['\u{09F3}', 'taka'],
      ['\u{20A8}', 'rupee sign old'],
      ['\u{00A2}', 'cent'],
      ['\u{20BA}', 'lira'],
      ['\u{20AB}', 'dong'],
    ],
  },
]

/** Every glyph, flattened. Used by the search box and by the tests that count. */
export const ALL_GLYPHS: readonly (readonly [string, string])[] = GLYPH_GROUPS.flatMap(
  (group) => group.glyphs,
)

/**
 * Groups filtered to the glyphs whose name matches `query`, dropping any group
 * left with nothing. An empty or blank query returns every group untouched, so
 * the caller never has to special-case the resting state.
 */
export function searchGlyphs(query: string): readonly GlyphGroup[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return GLYPH_GROUPS
  return GLYPH_GROUPS.map((group) => ({
    ...group,
    glyphs: group.glyphs.filter(([, name]) => name.includes(needle)),
  })).filter((group) => group.glyphs.length > 0)
}
