// Link detection for the composer's live character meter.
//
// The Constraint Engine never looks for URLs — `VariantDraft.hasLink` is
// caller-computed, and on X (linkPolicy 'counted_fixed') a link is weighted at a
// fixed 23 characters regardless of its real length. Get this wrong and the
// meter lies to the user, so the rules below are deliberately conservative and
// every accepted limitation is pinned by a test.

// TLDs we accept in a *bare* domain (no scheme, no `www.`). Deliberately a
// curated list rather than "any 2+ letters": marketing copy is full of
// `Node.js`, `report.pdf`, `index.html` and `deploy.sh`, none of which are
// links. Scheme-prefixed and `www.` hosts bypass this list entirely.
//
// This list is NOT the IANA registry and never will be — see the limitation
// note on `extractLinks`. Entries are omitted on purpose when they collide with
// a common file extension (`sh`, `md`, `rs`, `py`, `js`, `zip`, `so`, `key`).
const KNOWN_TLDS: readonly string[] = [
  // generic
  'com',
  'net',
  'org',
  'edu',
  'gov',
  'mil',
  'int',
  'info',
  'biz',
  // common brand / startup
  'io',
  'co',
  'ai',
  'app',
  'dev',
  'xyz',
  'online',
  'store',
  'shop',
  'site',
  'tech',
  'blog',
  'cloud',
  'design',
  'studio',
  'agency',
  'media',
  'news',
  'live',
  'link',
  'page',
  'space',
  'world',
  'life',
  'fun',
  'art',
  'club',
  'group',
  'email',
  'digital',
  'marketing',
  'social',
  'work',
  'today',
  'zone',
  'tools',
  'tv',
  'me',
  'gg',
  'cc',
  'ly',
  'pro',
  'name',
  'mobi',
  'asia',
  'wiki',
  'plus',
  'best',
  'expert',
  'guide',
  'directory',
  'company',
  'solutions',
  'services',
  'consulting',
  'support',
  'reviews',
  'community',
  'team',
  'academy',
  'school',
  'education',
  'institute',
  // hospitality / retail / local services — the SMB long tail
  'cafe',
  'coffee',
  'tea',
  'bar',
  'pub',
  'restaurant',
  'menu',
  'bakery',
  'kitchen',
  'catering',
  'pizza',
  'salon',
  'spa',
  'beauty',
  'fitness',
  'yoga',
  'fit',
  'health',
  'care',
  'clinic',
  'travel',
  'tours',
  'events',
  'party',
  'wedding',
  'gifts',
  'flowers',
  'books',
  'photography',
  'photos',
  'video',
  'music',
  'fashion',
  'style',
  'jewelry',
  'furniture',
  'house',
  'estate',
  'properties',
  'repair',
  'legal',
  'finance',
  'deals',
  'sale',
  'boutique',
  'market',
  'farm',
  'garden',
  'organic',
  'kids',
  'pet',
  // country codes we actually see
  'in',
  'uk',
  'us',
  'ca',
  'au',
  'de',
  'fr',
  'es',
  'it',
  'nl',
  'se',
  'no',
  'dk',
  'fi',
  'pl',
  'ru',
  'jp',
  'cn',
  'br',
  'za',
  'sg',
  'ae',
  'nz',
  'ch',
  'ie',
  'pk',
  'lk',
  'np',
  'bd',
  'bt',
  'mv',
  'my',
  'th',
  'vn',
  'ph',
  'kr',
  'hk',
  'tw',
  'mx',
  'ar',
  'cl',
  'pe',
  'pt',
  'be',
  'at',
  'cz',
  'gr',
  'ro',
  'hu',
  'il',
  'tr',
  'sa',
  'qa',
  'kw',
  'om',
  'ng',
  'ke',
  'gh',
  'tz',
  'ug',
  'eu',
]

// Longest-first so `com` is tried before `co`; the trailing \b makes this safe
// either way, but explicit order keeps the behaviour obvious.
const TLD_ALTERNATION = [...KNOWN_TLDS].sort((a, b) => b.length - a.length).join('|')

const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const PATH_TAIL = String.raw`(?:[/?#][^\s<>"']*)?`

const LINK_PATTERN = new RegExp(
  [
    // Never start mid-token, and never start at the domain half of an email
    // address ("hello@example.com" is not a link).
    String.raw`(?<![\w@.+-])`,
    '(?:',
    // 1. An explicit scheme wins outright: if the user typed http(s)://, it is
    //    a link whatever the host looks like.
    String.raw`https?://[^\s<>"']+`,
    '|',
    // 2. A `www.` host reads as a link even without a scheme.
    String.raw`www\.[^\s<>"']+`,
    '|',
    // 3. A bare domain — X wraps these in t.co, so they cost 23 chars too.
    //    One or more labels, a TLD we recognise, then an optional path.
    String.raw`(?:${HOST_LABEL}\.)+(?:${TLD_ALTERNATION})\b${PATH_TAIL}`,
    ')',
  ].join(''),
  'gi',
)

// Sentence punctuation that a user types *after* a URL, never as part of it.
const TRAILING_SENTENCE_PUNCTUATION = /[.,;:!?'"«»“”‘’]+$/

const BRACKET_PAIRS: readonly (readonly [string, string])[] = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]

const LEADING_SCHEME = /^https?:\/\//i
const HOST_STARTS_HERE = /^[a-z0-9]/i

const HAS_SCHEME_OR_WWW = /^(?:https?:\/\/|www\.)/i
const ALL_DIGITS = /^\d+$/

// A candidate must still have a host character left once the scheme is removed,
// so a stray paste like "https://." is rejected rather than called a link.
// (Written as a strip-then-test rather than an optional group in one regex: an
// optional group happily backtracks and matches the "h" of "https".)
function hasHostCharacter(candidate: string): boolean {
  return HOST_STARTS_HERE.test(candidate.replace(LEADING_SCHEME, ''))
}

function countOccurrences(value: string, character: string): number {
  return value.split(character).length - 1
}

// True when the candidate ends in a closer that was opened outside the URL,
// e.g. "(see https://a.com/menu)" — but not ".../Chai_(drink)".
function endsWithUnbalancedCloser(candidate: string): boolean {
  const last = candidate.slice(-1)
  const pair = BRACKET_PAIRS.find(([, close]) => close === last)
  if (pair === undefined) return false
  const [open, close] = pair
  return countOccurrences(candidate, close) > countOccurrences(candidate, open)
}

// Strip sentence punctuation and wrapping brackets, repeating until stable so
// "(https://a.com)." reduces cleanly. Length strictly shrinks, so this ends.
function trimUrlTail(candidate: string): string {
  let trimmed = candidate
  for (;;) {
    const withoutPunctuation = trimmed.replace(TRAILING_SENTENCE_PUNCTUATION, '')
    const next = endsWithUnbalancedCloser(withoutPunctuation)
      ? withoutPunctuation.slice(0, -1)
      : withoutPunctuation
    if (next === trimmed) return trimmed
    trimmed = next
  }
}

// A bare domain whose TLD is mixed-case ("Open today.In store") is almost
// always a missing space after a sentence period, not a host. Scheme and `www.`
// candidates skip this check — the user's intent there is explicit.
function hasPlausibleTldCasing(candidate: string): boolean {
  if (HAS_SCHEME_OR_WWW.test(candidate)) return true
  const host = candidate.split(/[/?#]/)[0] ?? candidate
  const labels = host.split('.')
  const tld = labels[labels.length - 1]
  if (tld === undefined) return false
  return tld === tld.toLowerCase() || tld === tld.toUpperCase()
}

// A bare domain whose label before the TLD is all digits is a price or a
// quantity with a missing space, not a host: "Rs 40.in store", "Only 2.in
// stock", "Version 2.0.in stores now". Scheme and `www.` candidates skip this —
// a numeric host like www.163.com is explicit.
function hasNonNumericSecondLevelLabel(candidate: string): boolean {
  if (HAS_SCHEME_OR_WWW.test(candidate)) return true
  const host = candidate.split(/[/?#]/)[0] ?? candidate
  const labels = host.split('.')
  const secondLevel = labels[labels.length - 2]
  if (secondLevel === undefined) return false
  return !ALL_DIGITS.test(secondLevel)
}

function isPlausibleLink(candidate: string): boolean {
  return (
    hasHostCharacter(candidate) &&
    hasPlausibleTldCasing(candidate) &&
    hasNonNumericSecondLevelLabel(candidate)
  )
}

// Yields cleaned links lazily so hasLink can stop at the first one.
// `matchAll` clones the pattern, so the shared regex keeps no lastIndex state.
function* iterateLinks(body: string): Generator<string> {
  for (const match of body.matchAll(LINK_PATTERN)) {
    const candidate = trimUrlTail(match[0])
    if (isPlausibleLink(candidate)) yield candidate
  }
}

/** True when the body contains at least one URL or bare domain. */
export function hasLink(body: string): boolean {
  for (const _link of iterateLinks(body)) return true
  return false
}

/**
 * Every link in the body, in order of appearance, deduped by exact text.
 *
 * Note the dedupe: this is a display/preview list, not a count source. X
 * charges 23 characters per link *occurrence*, so a body that repeats one URL
 * is not two entries here.
 *
 * Known limitations — this is a heuristic and it is wrong in BOTH directions:
 *
 * 1. Under-detection (meter under-counts; X may reject a post the meter passed).
 *    A bare domain on a TLD outside KNOWN_TLDS is missed — `brew.coffee` is
 *    listed, `brew.espresso` is not, and no curated list ever closes this. Any
 *    scheme or `www.` prefix bypasses the list, so this only bites a bare
 *    domain on an unusual TLD.
 * 2. Over-detection (meter over-counts; a valid post can be blocked at the
 *    280-char boundary). A lowercase word followed by a real TLD is
 *    indistinguishable from a host without a dictionary: `etc.in the back room`
 *    reads as `etc.in`. Capitalized TLDs and numeric labels are filtered out,
 *    which kills the common cases, not the class.
 *
 * Both are pinned by tests. Neither direction is "the safe one" — treat a
 * change here as a change to what the composer will let a writer publish.
 */
export function extractLinks(body: string): string[] {
  const seen = new Set<string>()
  const links: string[] = []
  for (const link of iterateLinks(body)) {
    if (seen.has(link)) continue
    seen.add(link)
    links.push(link)
  }
  return links
}
