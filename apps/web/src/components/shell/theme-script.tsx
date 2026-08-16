/**
 * Sets `data-theme` on <html> BEFORE the first paint.
 *
 * ── WHY AN INLINE SCRIPT AND NOT A useEffect ─────────────────────────────────
 * A theme applied after hydration is a theme the user watches arrive: the page
 * paints light, React boots, and the whole shell flips to dark. That flash is
 * worse than having no dark mode at all, and it happens on every navigation to
 * a fresh document. This runs synchronously in <head>, so the first pixel is
 * already the right colour.
 *
 * ── WHY IT WRITES THE ATTRIBUTE AND NOT THE CLASS ────────────────────────────
 * tokens.css defines the dark block for `[data-theme='dark']` AND `.dark`, and
 * globals.css keys the `dark:` variant to both. Either signal works; the app
 * picks the attribute because that is what the reference kit documents
 * (SPECIFICATION.md §13: "This uses [data-theme='dark']"). Writing only one of
 * the two is deliberate — setting both would be two sources of truth for one
 * question, and the failure mode is a light dropdown inside a dark panel.
 *
 * ── THE THREE STATES ─────────────────────────────────────────────────────────
 * 'light' and 'dark' are explicit choices and always win. Absence is the third
 * state: follow the OS. It is NOT the same as 'light' — a user who never opened
 * the toggle should track their system when it changes, and a stored 'light'
 * must survive an OS that later goes dark.
 */
const SCRIPT = `(function(){try{
var s=localStorage.getItem('sahoda-theme');
var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',d?'dark':'light');
}catch(e){}})();`

export function ThemeScript() {
  // dangerouslySetInnerHTML is the only way to emit a synchronous inline script
  // from a server component. The content is a module-level constant with no
  // interpolation of any kind, so there is no injection surface.
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
