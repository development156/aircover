/**
 * The detectors, and the fixtures that prove each one works.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM THE CAPTURE ─────────────────────────
 * A peer's contrast detector reported eight invisible-text findings that were
 * its own clamping artefact — the exact signature it was hunting. A detector
 * that has never been shown a known-good and a known-bad is a rumour generator.
 *
 * So every detector below is a pure function of the DOM, expressed as a string
 * evaluated in the page, and `ux-detector-selftest.spec.ts` runs each one
 * against a synthetic page whose right answer is known before it is allowed
 * near a real screen.
 *
 * Two lessons are already baked in:
 *
 *  · `getComputedStyle(root).getPropertyValue('--brand')` does NOT reliably
 *    return a colour. tokens.css defines `--brand: var(--p)`, and an alias can
 *    come back as the literal text `var(--p)`. The brand colour is therefore
 *    resolved by PAINTING it onto a probe element and reading back what the
 *    engine actually computed — the only answer that cannot be a string.
 *
 *  · A colour is only a contrast finding if BOTH sides are opaque and known.
 *    Anything sitting on a gradient, an image, or a partially transparent stack
 *    is reported as `unknown`, never as a ratio. Guessing there is how the
 *    artefact above was manufactured.
 */

/** Shared preamble: colour parsing, luminance, contrast, visibility, naming. */
export const LIB = `
const _parse = (c) => {
  if (!c) return null
  const m = c.match(/^rgba?\\(([^)]+)\\)$/)
  if (!m) return null
  const parts = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}
const _lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
const _lum = (c) => 0.2126 * _lin(c.r) + 0.7152 * _lin(c.g) + 0.0722 * _lin(c.b)
const _ratio = (a, b) => { const l1 = _lum(a), l2 = _lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05) }
const _over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
const _visible = (el) => {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return false
  const s = getComputedStyle(el)
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
}
/* The effective background behind an element: walk ancestors until something
   opaque is found. Returns null the moment an image or gradient is involved —
   an unknown ground is not a white ground. */
const _bgOf = (el) => {
  let node = el
  let stack = []
  while (node && node.nodeType === 1) {
    const s = getComputedStyle(node)
    if (s.backgroundImage && s.backgroundImage !== 'none') return null
    const c = _parse(s.backgroundColor)
    if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break }
    node = node.parentElement
  }
  if (stack.length === 0 || !stack.some((c) => c.a >= 0.999)) return null
  let out = stack[stack.length - 1]
  for (let i = stack.length - 2; i >= 0; i--) out = _over(stack[i], out)
  return out
}
`

/**
 * The brand fill census: how rationed is orange, really?
 *
 * §1.5 of docs/26 allows exactly one primary action per view. This counts the
 * elements actually painted in the brand colour and names them, so "four
 * full-width orange primaries" is a number rather than an impression.
 */
export const BRAND_FILLS = `${LIB}
;(() => {
  /* Resolve the brand by PAINTING it. An alias token can return its own text. */
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;background-color:var(--brand)'
  document.body.appendChild(probe)
  const brand = _parse(getComputedStyle(probe).backgroundColor)
  probe.remove()
  if (!brand) return { resolved: null, count: 0, items: [] }
  const same = (c) => c && Math.abs(c.r - brand.r) < 6 && Math.abs(c.g - brand.g) < 6 && Math.abs(c.b - brand.b) < 6 && c.a > 0.85
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    if (!_visible(el)) continue
    const s = getComputedStyle(el)
    if (!same(_parse(s.backgroundColor))) continue
    const r = el.getBoundingClientRect()
    /* A 2px active rail and a 1px edge are explicitly allowed (docs/26 §1.1).
       Only count something big enough to read as a filled surface. */
    if (r.width < 24 || r.height < 12) continue
    hits.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      w: Math.round(r.width),
      h: Math.round(r.height),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
    })
  }
  return { resolved: 'rgb(' + brand.r + ', ' + brand.g + ', ' + brand.b + ')', count: hits.length, items: hits.slice(0, 20) }
})()`

/**
 * Text that is invisible against its own background.
 *
 * Reports ONLY where both sides are opaque and known. Everything else is
 * counted as `skipped`, and a skipped element is not a finding.
 */
export const INVISIBLE_TEXT = `${LIB}
;(() => {
  const hits = []
  let skipped = 0
  let checked = 0
  for (const el of document.querySelectorAll('*')) {
    if (!_visible(el)) continue
    /* Only elements with their OWN text, so a wrapper is not blamed for its child. */
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0)
    if (own.length === 0) continue
    const s = getComputedStyle(el)
    const fg = _parse(s.color)
    const bg = _bgOf(el)
    if (!fg || !bg) { skipped++; continue }
    const eff = fg.a >= 0.999 ? fg : _over(fg, bg)
    checked++
    const ratio = _ratio(eff, bg)
    if (ratio < 1.25) {
      hits.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).slice(0, 80),
        text: own.map((n) => n.textContent).join(' ').replace(/\\s+/g, ' ').trim().slice(0, 60),
        fg: s.color,
        bg: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
        ratio: Math.round(ratio * 100) / 100,
      })
    }
  }
  return { checked, skipped, count: hits.length, items: hits.slice(0, 20) }
})()`

/**
 * Buttons and links wearing an arrow cursor.
 *
 * Tailwind v4's Preflight dropped `cursor: pointer` on `button`, so a whole
 * app can silently lose the single strongest affordance it has. Disabled
 * controls are excluded — `not-allowed` is correct there, and counting it would
 * make the number unfalsifiable.
 */
export const ARROW_CURSORS = `${LIB}
;(() => {
  const hits = []
  /* label[for] is deliberately absent, and its absence is a RULING rather than
     an oversight: a label over a text field is not a pressable thing, and the
     arrow is right there. A label that CONTAINS a checkbox or a radio IS the
     control - pick-chips.tsx renders exactly that, with the input sr-only
     inside - so those are in.
     (No backticks in this comment, and that is load-bearing: it lives INSIDE a
     template literal, and one backtick here terminates the detector.) */
  const els = document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="switch"], summary, select, input[type="checkbox"], input[type="radio"], input[type="submit"], label:has(input[type="checkbox"]), label:has(input[type="radio"])')
  let considered = 0
  for (const el of els) {
    if (!_visible(el)) continue
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue
    considered++
    const s = getComputedStyle(el)
    if (s.cursor === 'pointer') continue
    hits.push({
      tag: el.tagName.toLowerCase(),
      cursor: s.cursor,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).slice(0, 70),
    })
  }
  return { considered, count: hits.length, items: hits.slice(0, 25) }
})()`

/**
 * Interactive elements with no accessible name.
 *
 * Nine unnamed nav links is what the `display:none` collapse bug looked like,
 * and no screenshot could ever have shown it.
 */
export const UNNAMED = `${LIB}
;(() => {
  const name = (el) => {
    const al = el.getAttribute('aria-label')
    if (al && al.trim()) return al.trim()
    const by = el.getAttribute('aria-labelledby')
    if (by) {
      const t = by.split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim()
      if (t) return t
    }
    const t = (el.textContent || '').replace(/\\s+/g, ' ').trim()
    if (t) return t
    for (const d of el.querySelectorAll('img[alt], [aria-label], title')) {
      const a = (d.getAttribute && (d.getAttribute('alt') || d.getAttribute('aria-label'))) || d.textContent
      if (a && a.trim()) return a.trim()
    }
    const ti = el.getAttribute('title')
    if (ti && ti.trim()) return ti.trim()
    /* A form control's name can come from three places, and a detector that
       knows only one of them manufactures findings. MEASURED: pick-chips.tsx
       renders <label><input class="sr-only"/>Consumer</label>, which is
       correctly named and was reported 204 times as unnamed until the ancestor
       label was checked here. */
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      const id = el.getAttribute('id')
      if (id) { const l = document.querySelector('label[for="' + CSS.escape(id) + '"]'); if (l && (l.textContent || '').trim()) return l.textContent.trim() }
      const wrapping = el.closest('label')
      if (wrapping && (wrapping.textContent || '').trim()) return wrapping.textContent.trim()
      const ph = el.getAttribute('placeholder')
      if (ph && ph.trim()) return ph.trim()
      const nm = el.getAttribute('name')
      if (nm && nm.trim()) return nm.trim()
    }
    return ''
  }
  const hits = []
  const els = document.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"], [role="switch"], input, select, textarea')
  let considered = 0
  for (const el of els) {
    if (!_visible(el)) continue
    if (el.getAttribute('aria-hidden') === 'true') continue
    if (el.closest('[aria-hidden="true"]')) continue
    if (el.type === 'hidden') continue
    considered++
    if (name(el) !== '') continue
    hits.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      href: el.getAttribute('href') || '',
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).slice(0, 80),
    })
  }
  return { considered, count: hits.length, items: hits.slice(0, 25) }
})()`

/**
 * A control that refuses without saying what would work.
 *
 * `<button disabled>` is banned for "coming soon" (docs/26 §10.3 and the lane
 * brief): a disabled button is unfocusable, unhoverable and unexplained, so it
 * is a dead end wearing the clothes of an action.
 */
export const DEAD_ENDS = `${LIB}
;(() => {
  const hits = []
  for (const el of document.querySelectorAll('button[disabled], [role="button"][aria-disabled="true"], a[aria-disabled="true"]')) {
    if (!_visible(el)) continue
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim()
    hits.push({
      tag: el.tagName.toLowerCase(),
      text: text.slice(0, 50),
      describedBy: el.getAttribute('aria-describedby') || '',
      title: el.getAttribute('title') || '',
      comingSoon: /soon|coming|not yet|unavailable/i.test(text),
    })
  }
  return { count: hits.length, items: hits.slice(0, 25) }
})()`

/** Anything painted wider than the viewport — the sideways-scroll cause, named. */
export const OVERFLOW = `${LIB}
;(() => {
  const vw = window.innerWidth
  const de = document.documentElement
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    if (!_visible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right <= vw + 1 && r.left >= -1) continue
    if (getComputedStyle(el).position === 'fixed' && r.width <= vw + 1) continue
    hits.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).slice(0, 80),
      w: Math.round(r.width),
      right: Math.round(r.right),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
    })
  }
  return { docWidth: de.scrollWidth, viewport: vw, overflows: de.scrollWidth > vw + 1, count: hits.length, items: hits.slice(0, 15) }
})()`

/** Tap targets under the 44px floor, which only binds at narrow widths. */
export const TOUCH = `${LIB}
;(() => {
  const hits = []
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input, select, textarea')) {
    if (!_visible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.height >= 43.5) continue
    /* An inline text link inside a paragraph is not a tap target in this sense. */
    if (el.tagName === 'A' && el.closest('p')) continue
    hits.push({
      tag: el.tagName.toLowerCase(),
      h: Math.round(r.height * 10) / 10,
      w: Math.round(r.width),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
    })
  }
  return { count: hits.length, items: hits.slice(0, 25) }
})()`

/** The heading spine: does one thing lead, and is the order legal? */
export const HEADINGS = `${LIB}
;(() => {
  const out = []
  for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (!_visible(el)) continue
    const s = getComputedStyle(el)
    out.push({
      level: Number(el.tagName.slice(1)),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70),
      px: Math.round(parseFloat(s.fontSize) * 10) / 10,
    })
  }
  return { count: out.length, items: out.slice(0, 25) }
})()`

/** What is actually animating, and for how long. */
export const MOTION = `${LIB}
;(() => {
  const anim = []
  const trans = new Map()
  for (const el of document.querySelectorAll('*')) {
    if (!_visible(el)) continue
    const s = getComputedStyle(el)
    if (s.animationName && s.animationName !== 'none') {
      anim.push({
        name: s.animationName,
        dur: s.animationDuration,
        delay: s.animationDelay,
        fill: s.animationFillMode,
        iter: s.animationIterationCount,
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).slice(0, 60),
      })
    }
    if (s.transitionDuration && s.transitionDuration !== '0s') {
      const key = s.transitionDuration + ' ' + s.transitionTimingFunction
      trans.set(key, (trans.get(key) || 0) + 1)
    }
  }
  return {
    animating: anim.length,
    animations: anim.slice(0, 20),
    transitions: Array.from(trans.entries()).map(([k, n]) => ({ spec: k, n })).sort((a, b) => b.n - a.n).slice(0, 12),
  }
})()`

export const DETECTORS = {
  brandFills: BRAND_FILLS,
  invisibleText: INVISIBLE_TEXT,
  arrowCursors: ARROW_CURSORS,
  unnamed: UNNAMED,
  deadEnds: DEAD_ENDS,
  overflow: OVERFLOW,
  touch: TOUCH,
  headings: HEADINGS,
  motion: MOTION,
} as const

export type DetectorName = keyof typeof DETECTORS
