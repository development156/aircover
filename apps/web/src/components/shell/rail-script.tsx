/**
 * Sets `data-rail` on <html> BEFORE the first paint. Sibling of ThemeScript,
 * and the same argument: a rail that opens and then shuts is worse than a rail
 * that was never open.
 *
 * ── WHY ABSENCE MEANS COLLAPSED ──────────────────────────────────────────────
 * The founder's ruling is that the rail DEFAULTS to collapsed. Written as an
 * opt-in (`data-rail="collapsed"` set by this script) the default would depend
 * on the script having run, so a document rendered with JavaScript off, or in
 * the milliseconds before it executes, would paint the 240px labelled rail and
 * then snap to 62. Written as an opt-out — only `expanded` is ever set — the
 * default is the ABSENCE of an attribute, which is the state the server already
 * renders. There is no frame in which the wrong rail is on screen.
 *
 * That asymmetry is why `rail-min` in globals.css is
 * `html:not([data-rail='expanded'])` and not `html[data-rail='collapsed']`.
 *
 * ── AND WHY IT IS NOT A COOKIE ───────────────────────────────────────────────
 * A cookie would let the server render the right rail without a script at all,
 * which is strictly better — and it would put a preference that is purely about
 * this browser into every request to every route, including the ones that cache.
 * The theme already made this trade the other way (`sahoda-theme` in
 * localStorage) and a shell with two different mechanisms for two adjacent
 * chrome preferences is the thing worth avoiding. One pattern, stated twice.
 */
const SCRIPT = `(function(){try{
if(localStorage.getItem('sahoda-rail')==='expanded'){
document.documentElement.setAttribute('data-rail','expanded');}
}catch(e){}})();`

export function RailScript() {
  // Same reasoning as ThemeScript: a module-level constant with no
  // interpolation, so there is no injection surface.
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
